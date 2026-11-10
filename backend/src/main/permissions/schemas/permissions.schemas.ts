import { z } from "zod";

export const profileParamSchema = z.object({ profile: z.string().trim().min(1).max(40) });

/** What one kind of person may do: the keys ticked (each once; the service checks that they can be given to that kind). */
export const savePermissionsSchema = z.object({
  permissions: z
    .array(z.string({ invalid_type_error: "Choose from the list" }).trim().min(1).max(60), { required_error: "Send the permissions", invalid_type_error: "Send the permissions" })
    .max(100, "Too many permissions")
    .transform((keys) => [...new Set(keys)]),
});
export type SavePermissionsInput = z.infer<typeof savePermissionsSchema>;
