import type { AccessTokenPayload } from "../utils/authUtils";

declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth, from the database (not blindly from the token). */
      user?: AccessTokenPayload;
      validatedBody?: unknown;
      validatedParams?: unknown;
      validatedQuery?: unknown;
    }
  }
}

export {};
