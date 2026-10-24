import { Loader2 } from "lucide-react";

/** A full-screen spinner: shown while a page loads or the saved session is being checked. */
export function PageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="size-6 animate-spin text-primary" aria-label="Loading" />
    </div>
  );
}
