import { combineReducers, configureStore } from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query";
import authReducer from "./slices/authSlice";
import { allApiSlices } from "./api/apiRoot";
import { logoutMiddleware } from "./middlewares/logoutMiddleware";

/* RTK Query reducers, built from the list of slices (typed per slice, so RootState knows each one). */
type ApiSlice = (typeof allApiSlices)[number];
const apiReducers = Object.fromEntries(allApiSlices.map((api) => [api.reducerPath, api.reducer])) as {
  [Slice in ApiSlice as Slice["reducerPath"]]: Slice["reducer"];
};

const rootReducer = combineReducers({
  auth: authReducer,
  ...apiReducers,
});

const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(...allApiSlices.map((api) => api.middleware), logoutMiddleware),
});

// Lets RTK Query refetch when the browser comes back online.
setupListeners(store.dispatch);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export default store;
