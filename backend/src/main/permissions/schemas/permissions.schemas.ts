import { z } from "zod";
import { MAX_ROLE_OTHER } from "../../staff/constants";

/** A kind's key: "receptionist", or a role the school named, "other:sports coach" (the name is at most 40 letters). */
export const profileParamSchema = z.object({ profile: z.string().trim().min(1).max(60) });

/** A role the school makes on the Permissions page (2026-11-26): only its name, as long as a role typed in Add staff > Other may be. */
export const createRoleSchema = z.object({
  name: z
    .string({ required_error: "Write the role's name", invalid_type_error: "Write the role's name" })
    .trim()
    .min(2, "Write the role's name")
    .max(MAX_ROLE_OTHER, `At most ${MAX_ROLE_OTHER} letters`),
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

/** What one kind of person may do: the keys ticked (each once; the service checks that they can be given to that kind). */
export const savePermissionsSchema = z.object({
  permissions: z
    .array(z.string({ invalid_type_error: "Choose from the list" }).trim().min(1).max(60), { required_error: "Send the permissions", invalid_type_error: "Send the permissions" })
    .max(100, "Too many permissions")
    .transform((keys) => [...new Set(keys)]),
});
export type SavePermissionsInput = z.infer<typeof savePermissionsSchema>;
