import store from "../redux/store";
import { sessionStarted, signedOut } from "../redux/slices/authSlice";
import type { UserRole } from "../types";

/** Signs a person of the given kind in, for a page that asks who is looking (what the school allowed them). `permissions` omitted: the usual list of the kind. */
export function signInAs(role: UserRole = "school_admin", permissions?: string[]) {
  store.dispatch(
    sessionStarted({
      user: { id: "u1", name: "Asha Verma", email: "asha@school.example", username: null, role, tenantId: "t1", emailVerifiedAt: null, ...(permissions ? { permissions } : {}) },
      tenant: { id: "t1", name: "Sunrise Public School", approvalStatus: "approved", isActive: true },
    } as never)
  );
}

export const signOut = () => store.dispatch(signedOut());
