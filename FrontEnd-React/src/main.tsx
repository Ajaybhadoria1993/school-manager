import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { RouterProvider } from "react-router";

import { ToastProvider } from "./components/ui/toast-context";
import store from "./redux/store";
import { router } from "./routes/AppRoutes";
import "./index.css";

// A stale tab asking for a lazy-loaded page that a newer deploy has removed gets index.html back instead of the
// JavaScript module. Reload once to pick up the fresh files; the guard stops a reload loop if the cause is something else.
const PRELOAD_RELOAD_KEY = "vite-preload-reloaded";

window.addEventListener("vite:preloadError", () => {
  if (sessionStorage.getItem(PRELOAD_RELOAD_KEY)) return;
  sessionStorage.setItem(PRELOAD_RELOAD_KEY, "1");
  window.location.reload();
});

// Once this build is confirmed working, clear the guard so a later deploy in the same tab can still self-heal.
setTimeout(() => sessionStorage.removeItem(PRELOAD_RELOAD_KEY), 10_000);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Provider store={store}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </Provider>
  </StrictMode>,
);
