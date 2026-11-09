import { Types } from "mongoose";
import { User } from "../../users/models/User";

/** Who is doing something, as the session knows them (the id and the role of the signed-in user). */
export interface Actor {
  userId: string;
  role: string;
}

/** The actor as it is written into a record: with the name their account has now (a role or a name may change later). */
export type ActorRecord = { userId: Types.ObjectId; name: string; role: string };

export async function actorRecord(actor: Actor): Promise<ActorRecord> {
  const user = await User.findById(actor.userId).select("name").lean();
  return { userId: new Types.ObjectId(actor.userId), name: user?.name ?? "Unknown", role: actor.role };
}
