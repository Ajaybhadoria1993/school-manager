import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { sessionEnded, signedOut } from "./authSlice";

/** Where this tab remembers the year it is looking at, so a reload stays on it. Per tab, and gone when the tab closes. */
export const YEAR_VIEW_KEY = "edushiksha.year-view";

function remembered(): string | null {
  try {
    return sessionStorage.getItem(YEAR_VIEW_KEY);
  } catch {
    return null;
  }
}

/**
 * Looking at a past academic year (backend: academics/services/viewedYear.ts). `yearId` is the closed year the school admin opened, or null
 * (the usual case: the running year). The requests that can answer for a year carry it (redux/api/baseQueryWithReauth.ts), and the screens
 * that show one ask again when it changes (redux/middlewares/yearViewMiddleware.ts).
 */
const yearViewSlice = createSlice({
  name: "yearView",
  initialState: { yearId: remembered() } as { yearId: string | null },
  reducers: {
    yearViewChanged(state, action: PayloadAction<string | null>) {
      state.yearId = action.payload;
    },
  },
  extraReducers: (builder) => {
    // The next person on this browser starts on the running year.
    builder.addCase(signedOut, (state) => {
      state.yearId = null;
    });
    builder.addCase(sessionEnded, (state) => {
      state.yearId = null;
    });
  },
});

export const { yearViewChanged } = yearViewSlice.actions;
export default yearViewSlice.reducer;
