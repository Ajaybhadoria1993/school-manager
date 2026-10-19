import mongoose from "mongoose";
import { z } from "zod";
import { connectDB } from "../config/db";
import { getSuperAdminEnv } from "../config/env";
import { PASSWORD_POLICY_MESSAGE, PASSWORD_POLICY_REGEX, hashPassword } from "../utils/authUtils";
import { logger } from "../utils/logger";
import { User } from "../main/users/models/User";
import { TokenService } from "../main/auth/services/token.service";

export type SeedStatus = "created" | "exists" | "password_reset";

/**
 * Creates the platform super admin from SUPER_ADMIN_NAME / SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD.
 * Safe to run any number of times: an existing super admin is left alone, and its password is
 * only replaced when `resetPassword` is set (npm run seed:superadmin -- --reset-password).
 */
export async function seedSuperAdmin(options: { resetPassword?: boolean } = {}): Promise<{ status: SeedStatus; email: string }> {
  const { name, email, password } = getSuperAdminEnv();

  z.string().email().parse(email);
  if (!PASSWORD_POLICY_REGEX.test(password)) {
    throw new Error(`SUPER_ADMIN_PASSWORD does not meet the password policy. ${PASSWORD_POLICY_MESSAGE}.`);
  }

  const existing = await User.findOne({ email });

  if (!existing) {
    await User.create({
      name,
      email,
      passwordHash: await hashPassword(password),
      role: "super_admin",
      tenantId: null,
      isActive: true,
      emailVerifiedAt: new Date(),
    });
    return { status: "created", email };
  }

  // Never turn a school user into the platform owner by accident.
  if (existing.role !== "super_admin") {
    throw new Error(`${email} already belongs to a ${existing.role}. Use a different SUPER_ADMIN_EMAIL.`);
  }

  if (options.resetPassword) {
    existing.passwordHash = await hashPassword(password);
    existing.passwordChangedAt = new Date();
    existing.isActive = true;
    await existing.save();
    await TokenService.revokeAllForUser(existing._id);
    return { status: "password_reset", email };
  }

  return { status: "exists", email };
}

async function run() {
  const resetPassword = process.argv.includes("--reset-password");
  await connectDB();
  await User.syncIndexes();
  const result = await seedSuperAdmin({ resetPassword });

  const messages: Record<SeedStatus, string> = {
    created: "Super admin created.",
    exists: "Super admin already exists, nothing changed. (Use --reset-password to set the password from .env again.)",
    password_reset: "Super admin password reset from .env; all existing sessions were signed out.",
  };
  logger.info(`${messages[result.status]} Email: ${result.email}`);
}

if (require.main === module) {
  run()
    .then(() => mongoose.disconnect())
    .catch(async (err) => {
      logger.error("Super admin seed failed", err);
      await mongoose.disconnect();
      process.exit(1);
    });
}
