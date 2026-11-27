import { z } from "zod";
import { label } from "../../subjects/schemas/subjects.schemas";
import { MAX_TEACHER_NAME } from "../../staff/constants";
import { fields } from "../../staff/schemas/staff.schemas";
import { DESIGNATIONS } from "../../tenants/constants";
import { INDIAN_MOBILE, optional, phoneNumber } from "../../../utils/formFields";

/**
 * `PUT /profile`: the signed-in person's own details. Only these boxes exist: anything else sent (an email, a role, an employee code) is
 * dropped, because the school decides it. Which of them apply depends on who the person is (ProfileService).
 */
export const ownProfileSchema = z
  .object({
    name: label("name", MAX_TEACHER_NAME),
    mobile: fields.mobile,
    // The school's administrator.
    designation: z.enum(DESIGNATIONS, { message: "Choose your role in the school" }),
    designationOther: optional(z.string().trim().min(2, "Tell us your role").max(50)),
    alternateMobile: z.union([z.literal(""), phoneNumber("Enter a 10-digit mobile number", INDIAN_MOBILE), z.null()]),
    // A teacher or a staff member.
    gender: fields.gender,
    dateOfBirth: fields.dateOfBirth,
    address: fields.address,
    qualification: fields.qualification,
    experienceYears: fields.experienceYears,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: "Nothing to change" });
export type OwnProfileInput = z.infer<typeof ownProfileSchema>;
