import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { sessionEnded, signedOut } from "./authSlice";

/** Where this tab remembers the medium it is on, so a reload stays on it. Per tab, and gone when the tab closes. */
export const MEDIUM_KEY = "edushiksha.medium";

function remembered(): string | null {
  try {
    return sessionStorage.getItem(MEDIUM_KEY);
  } catch {
    return null;
  }
}

/**
 * A school that teaches in more than one medium runs each on its own (backend: tenants/services/medium.service.ts). `mediumId` is the side
 * its administrator has open, or null: the first one, the school's own. Every request names it (redux/api/baseQueryWithReauth.ts), and what
 * was read for the other side is dropped when it changes (redux/middlewares/mediumMiddleware.ts).
 */
const mediumSlice = createSlice({
  name: "medium",
  initialState: { mediumId: remembered() } as { mediumId: string | null },
  reducers: {
    mediumChanged(state, action: PayloadAction<string | null>) {
      state.mediumId = action.payload;
    },
  },
  extraReducers: (builder) => {
    // The next person on this browser starts on their own school.
    builder.addCase(signedOut, (state) => {
      state.mediumId = null;
    });
    builder.addCase(sessionEnded, (state) => {
      state.mediumId = null;
    });
  },
});

export const { mediumChanged } = mediumSlice.actions;
export default mediumSlice.reducer;
