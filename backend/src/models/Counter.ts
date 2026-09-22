import { Schema, model } from "mongoose";

// Generic atomic sequence counter used to generate gap-free, non-reusable
// numbers (admission no., receipt no., TC serial no.) scoped per branch + key.
export interface ICounter {
  scopeKey: string; // e.g. "branch:<id>:receipt:2026-27"
  seq: number;
}

const counterSchema = new Schema<ICounter>({
  scopeKey: { type: String, required: true, unique: true },
  seq: { type: Number, required: true, default: 0 },
});

export const Counter = model<ICounter>("Counter", counterSchema);

export async function nextSequence(scopeKey: string): Promise<number> {
  const doc = await Counter.findOneAndUpdate(
    { scopeKey },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  return doc.seq;
}
