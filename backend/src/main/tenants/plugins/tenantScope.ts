import { Schema, Types, type Aggregate, type Query } from "mongoose";
/**
 * The rule that keeps one school's data away from another's, enforced in one place.
 *
 * Every collection that belongs to a school applies this plugin (`schema.plugin(tenantScope)`). It
 *  1. adds the `tenantId` field: required, and immutable, so a record can never be moved to another school;
 *  2. refuses to run any query, update, delete, count or aggregate whose filter does not name ONE school.
 *
 * So forgetting `tenantId` is no longer a silent leak: the call throws a TenantScopeError and the first test
 * that touches it fails. The filter must say `tenantId: <id>` at the top level, as an id and nothing cleverer
 * (`{ $ne }`, `{ $in }` and a `tenantId` hidden inside `$or` are refused).
 *
 * Models that are NOT a school's own (User, Tenant, the auth tokens) do not use this plugin; they are listed
 * in the model-registry test, which fails when a new model is neither one nor the other.
 *
 * The one way out is for work that really spans schools (a platform report, a nightly job, a migration):
 * `.setOptions(ALL_TENANTS)` on a query, `.option(ALL_TENANTS)` on an aggregate, or it as the options of
 * `bulkWrite`. Searching for ALL_TENANTS lists every place that does so, so each one gets reviewed.
 *
 * Delete and update through the model, with the school named: `Model.deleteOne({ _id, tenantId })`. The shortcuts
 * `doc.deleteOne()` and `doc.updateOne()` filter by `_id` alone, so they are refused. `doc.save()` is fine.
 * When populating a school-owned model from another one, pass `match: { tenantId }` so the lookup is scoped too.
 */
export const ALL_TENANTS = Object.freeze({ allTenants: true } as const);

declare module "mongoose" {
  interface MongooseBulkWriteOptions {
    /** Spans schools on purpose: see ALL_TENANTS in tenantScope.ts. */
    allTenants?: boolean;
  }
}

/** A programming mistake (a missing tenantId), never a user error: it reaches the API as a plain 500. */
export class TenantScopeError extends Error {
  constructor(model: string, operation: string) {
    super(
      `${model}.${operation} ran without a tenantId. Every query on a school's data must filter by the signed-in ` +
        `user's tenantId (or opt out on purpose with ALL_TENANTS).`
    );
    this.name = "TenantScopeError";
  }
}

const scopedSchemas = new WeakSet<Schema>();

/** True for a schema that applied tenantScope. */
export const isTenantScoped = (schema: Schema): boolean => scopedSchemas.has(schema);

const OBJECT_ID = /^[a-f\d]{24}$/i;

/** One school's id, as an ObjectId or its string form. Not null, not undefined, not an operator object. */
const isTenantId = (value: unknown): boolean =>
  value instanceof Types.ObjectId || (typeof value === "string" && OBJECT_ID.test(value));

const namesOneSchool = (filter: unknown): boolean =>
  typeof filter === "object" && filter !== null && isTenantId((filter as { tenantId?: unknown }).tenantId);

const optedOut = (options: object | undefined): boolean =>
  (options as { allTenants?: unknown } | undefined)?.allTenants === true;

/**
 * A query or aggregate that opted out: take the flag out of its own options, so it never travels on to the
 * database driver. (Only on a copy: the object the caller passed in is never changed.)
 */
function forgetOptOut(holder: { options: object }): void {
  const rest = { ...holder.options } as { allTenants?: unknown };
  delete rest.allTenants;
  holder.options = rest;
}

/** A Query or an Aggregate (both keep their options in `.options`, which Mongoose's Query typings leave out). */
function mayRunAcrossSchools(target: object): boolean {
  const holder = target as { options: object };
  if (!optedOut(holder.options)) return false;
  forgetOptOut(holder);
  return true;
}

/** Operations that take a filter. `findById`, `findByIdAnd*` and `exists` run through these. */
const FILTERED = [
  "find",
  "findOne",
  "findOneAndUpdate",
  "findOneAndDelete",
  "findOneAndReplace",
  "updateOne",
  "updateMany",
  "replaceOne",
  "deleteOne",
  "deleteMany",
  "countDocuments",
  "distinct",
] as const;

/** `Query.op` exists at runtime ("find", "updateOne", ...) but is missing from Mongoose's typings. */
const operationOf = (query: Query<unknown, unknown>): string => (query as unknown as { op: string }).op;

export function tenantScope(schema: Schema): void {
  scopedSchemas.add(schema);

  schema.add({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, immutable: true },
  });

  // `{ query: true, document: false }`: these run for Model.find(...) and friends, not for doc.deleteOne().
  schema.pre([...FILTERED], { query: true, document: false }, function (this: Query<unknown, unknown>) {
    if (mayRunAcrossSchools(this)) return;
    if (!namesOneSchool(this.getFilter())) throw new TenantScopeError(this.model.modelName, operationOf(this));
  });

  // It cannot take a filter at all: it counts the whole collection, every school's rows together.
  schema.pre("estimatedDocumentCount", { query: true, document: false }, function (this: Query<unknown, unknown>) {
    if (!mayRunAcrossSchools(this)) throw new TenantScopeError(this.model.modelName, "estimatedDocumentCount");
  });

  // The first stage must be a $match on the school, so nothing from another school ever enters the pipeline.
  schema.pre("aggregate", function (this: Aggregate<unknown>) {
    if (mayRunAcrossSchools(this)) return;
    const first = this.pipeline()[0] as { $match?: unknown } | undefined;
    if (!namesOneSchool(first?.$match)) throw new TenantScopeError(this.model().modelName, "aggregate");
  });

  // Every operation of a bulk write must name the school: its filter, or the document it inserts.
  schema.pre("bulkWrite", function (next, operations, options) {
    if (optedOut(options)) return next();
    for (const operation of operations) {
      const [kind] = Object.keys(operation);
      const spec = (operation as Record<string, { document?: unknown; filter?: unknown } | undefined>)[kind];
      const target = kind === "insertOne" ? spec?.document : spec?.filter;
      if (!namesOneSchool(target)) return next(new TenantScopeError(this.modelName, `bulkWrite(${kind})`));
    }
    next();
  });
}
