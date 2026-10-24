import { describe, it, expect, beforeEach } from "vitest";
import { Schema, Types, model } from "mongoose";
import { ALL_TENANTS, TenantScopeError, isTenantScoped, tenantScope } from "../plugins/tenantScope";

// A stand-in for any school-owned collection (students, fees, ...): the plugin is the only thing it uses.
const probeSchema = new Schema<{ tenantId: Types.ObjectId; label: string }>({ label: { type: String, required: true } });
probeSchema.plugin(tenantScope);
const Probe = model("TenantScopeProbe", probeSchema);

const sunrise = new Types.ObjectId();
const moonrise = new Types.ObjectId();

beforeEach(async () => {
  await Probe.create([
    { tenantId: sunrise, label: "sunrise one" },
    { tenantId: sunrise, label: "sunrise two" },
    { tenantId: moonrise, label: "moonrise one" },
  ]);
});

const refused = (run: () => unknown) =>
  expect(Promise.resolve().then(run)).rejects.toMatchObject({ name: "TenantScopeError", message: expect.stringContaining("tenantId") });

describe("a query that does not name one school", () => {
  it("is refused, whatever the operation", async () => {
    await refused(() => Probe.find());
    await refused(() => Probe.find({ label: "sunrise one" }));
    await refused(() => Probe.findOne({ label: "sunrise one" }));
    await refused(() => Probe.findById(new Types.ObjectId()));
    await refused(() => Probe.exists({ label: "sunrise one" }));
    await refused(() => Probe.countDocuments());
    await refused(() => Probe.estimatedDocumentCount());
    await refused(() => Probe.distinct("label"));
    await refused(() => Probe.findOneAndUpdate({ label: "x" }, { $set: { label: "y" } }));
    await refused(() => Probe.findByIdAndUpdate(new Types.ObjectId(), { $set: { label: "y" } }));
    await refused(() => Probe.findOneAndDelete({ label: "x" }));
    await refused(() => Probe.updateOne({ label: "x" }, { $set: { label: "y" } }));
    await refused(() => Probe.updateMany({}, { $set: { label: "y" } }));
    await refused(() => Probe.replaceOne({ label: "x" }, { label: "y", tenantId: sunrise }));
    await refused(() => Probe.deleteOne({ label: "x" }));
    await refused(() => Probe.deleteMany({}));
    await refused(() => Probe.aggregate([{ $group: { _id: "$label" } }]));
    await refused(() => Probe.bulkWrite([{ updateOne: { filter: { label: "x" }, update: { $set: { label: "y" } } } }]));
    await refused(() => Probe.bulkWrite([{ deleteMany: { filter: {} } }]));
    expect(await Probe.collection.countDocuments()).toBe(3);
  });

  it("is refused when the tenantId is missing, empty, an operator, or hidden", async () => {
    await refused(() => Probe.find({ tenantId: undefined }));
    await refused(() => Probe.find({ tenantId: null }));
    await refused(() => Probe.find({ tenantId: "" }));
    await refused(() => Probe.find({ tenantId: "not-an-id" }));
    await refused(() => Probe.find({ tenantId: { $ne: sunrise } }));
    await refused(() => Probe.find({ tenantId: { $in: [sunrise, moonrise] } }));
    await refused(() => Probe.find({ tenantId: { $exists: true } }));
    await refused(() => Probe.find({ $or: [{ tenantId: sunrise }, { label: "moonrise one" }] }));
    await refused(() => Probe.deleteMany({ $and: [{ tenantId: sunrise }] }));
  });

  it("is refused with an error that says what went wrong", async () => {
    const error = await Probe.find().then(
      () => null,
      (err: unknown) => err
    );
    expect(error).toBeInstanceOf(TenantScopeError);
    expect((error as Error).message).toContain("TenantScopeProbe.find");
  });

  it("is refused in a bulk write that names the school in one operation but not in the next", async () => {
    await refused(() =>
      Probe.bulkWrite([
        { updateOne: { filter: { tenantId: sunrise, label: "sunrise one" }, update: { $set: { label: "ok" } } } },
        { deleteOne: { filter: { label: "moonrise one" } } },
      ])
    );
    expect(await Probe.collection.countDocuments({ label: "moonrise one" })).toBe(1);
    expect(await Probe.collection.countDocuments({ label: "ok" })).toBe(0);
  });
});

describe("a query that names one school", () => {
  it("sees only that school's records, as an id or as text", async () => {
    expect((await Probe.find({ tenantId: sunrise })).map((p) => p.label).sort()).toEqual(["sunrise one", "sunrise two"]);
    expect((await Probe.find({ tenantId: moonrise.toString() })).map((p) => p.label)).toEqual(["moonrise one"]);
    expect(await Probe.countDocuments({ tenantId: sunrise })).toBe(2);
    expect(await Probe.exists({ tenantId: moonrise, label: "sunrise one" })).toBeNull();
    expect(await Probe.distinct("label", { tenantId: moonrise })).toEqual(["moonrise one"]);
  });

  it("changes and deletes only that school's records", async () => {
    await Probe.updateMany({ tenantId: moonrise }, { $set: { label: "changed" } });
    expect(await Probe.countDocuments({ tenantId: sunrise, label: "changed" })).toBe(0);

    await Probe.deleteMany({ tenantId: moonrise });
    expect(await Probe.countDocuments({ tenantId: sunrise })).toBe(2);
  });

  it("works for aggregate and bulkWrite when the school is named", async () => {
    const counted = await Probe.aggregate([{ $match: { tenantId: sunrise } }, { $count: "n" }]);
    expect(counted[0].n).toBe(2);

    await Probe.bulkWrite([
      { updateOne: { filter: { tenantId: sunrise, label: "sunrise one" }, update: { $set: { label: "renamed" } } } },
      { insertOne: { document: { tenantId: sunrise, label: "new" } } },
    ]);
    expect(await Probe.countDocuments({ tenantId: sunrise })).toBe(3);
    expect(await Probe.countDocuments({ tenantId: moonrise })).toBe(1);
  });

  it("finds a record by id only inside its own school", async () => {
    const [one] = await Probe.find({ tenantId: sunrise });
    expect(await Probe.findOne({ _id: one._id, tenantId: moonrise })).toBeNull();
    expect(await Probe.findOne({ _id: one._id, tenantId: sunrise })).not.toBeNull();
    expect(await Probe.deleteOne({ _id: one._id, tenantId: moonrise })).toMatchObject({ deletedCount: 0 });
    expect(await Probe.deleteOne({ _id: one._id, tenantId: sunrise })).toMatchObject({ deletedCount: 1 });
  });

  it("is saved with doc.save(), but doc.deleteOne() and doc.updateOne() are refused (they filter by _id alone)", async () => {
    const [one] = await Probe.find({ tenantId: sunrise });
    one.label = "saved";
    await one.save();
    expect(await Probe.countDocuments({ tenantId: sunrise, label: "saved" })).toBe(1);

    await refused(() => one.deleteOne());
    await refused(() => one.updateOne({ $set: { label: "x" } }));
    expect(await Probe.countDocuments({ tenantId: sunrise })).toBe(2);
  });
});

describe("a record", () => {
  it("cannot be saved without a school", async () => {
    await expect(Probe.create({ label: "orphan" })).rejects.toThrow(/tenantId/);
    await expect(Probe.insertMany([{ label: "orphan" }])).rejects.toThrow(/tenantId/);
  });

  it("cannot be moved to another school", async () => {
    await Probe.updateOne({ tenantId: sunrise, label: "sunrise one" }, { $set: { tenantId: moonrise } });
    expect(await Probe.countDocuments({ tenantId: moonrise })).toBe(1);
    expect(await Probe.countDocuments({ tenantId: sunrise, label: "sunrise one" })).toBe(1);

    const [one] = await Probe.find({ tenantId: sunrise });
    one.tenantId = moonrise;
    await one.save();
    expect(await Probe.countDocuments({ tenantId: moonrise })).toBe(1);
  });
});

describe("ALL_TENANTS", () => {
  it("lets work that spans schools run, and says so in the code", async () => {
    expect(await Probe.find().setOptions(ALL_TENANTS)).toHaveLength(3);
    expect(await Probe.countDocuments().setOptions(ALL_TENANTS)).toBe(3);
    expect(await Probe.estimatedDocumentCount().setOptions(ALL_TENANTS)).toBe(3);
    expect(await Probe.distinct("label").setOptions(ALL_TENANTS)).toHaveLength(3);
    expect(await Probe.aggregate([{ $group: { _id: "$tenantId" } }]).option(ALL_TENANTS)).toHaveLength(2);

    await Probe.bulkWrite([{ updateMany: { filter: {}, update: { $set: { label: "all" } } } }], ALL_TENANTS);
    expect(await Probe.countDocuments({ label: "all" }).setOptions(ALL_TENANTS)).toBe(3);
  });

  it("does not reach the database driver", async () => {
    const query = Probe.find().setOptions(ALL_TENANTS);
    await query;
    expect(query.getOptions()).not.toHaveProperty("allTenants");
  });

  it("applies only to the query it was set on", async () => {
    await Probe.find().setOptions(ALL_TENANTS);
    await refused(() => Probe.find());
  });
});

describe("the plugin", () => {
  it("marks the schema, so the model-registry test can tell school-owned models apart", () => {
    expect(isTenantScoped(probeSchema)).toBe(true);
    expect(isTenantScoped(new Schema({}))).toBe(false);
  });
});
