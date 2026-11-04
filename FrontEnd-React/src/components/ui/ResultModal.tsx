import { useCallback, useState, type ReactNode } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";
import { Button } from "@heroui/react";
import { AppModal } from "./AppModal";

interface Result {
  ok: boolean;
  title: string;
  message: ReactNode;
}

/**
 * The window that says how an action ended (2026-11-04, the user: "show a proper modal with every action"): its title is what happened
 * ("Leave sent", "Attendance saved") or why it did not, a line under it, and one OK. `show` opens it; render `modal` once on the page.
 */
export function useResultModal() {
  const [result, setResult] = useState<Result | null>(null);
  const show = useCallback((next: Result) => setResult(next), []);
  const done = useCallback((title: string, message: ReactNode) => setResult({ ok: true, title, message }), []);
  const failed = useCallback((title: string, message: ReactNode) => setResult({ ok: false, title, message }), []);
  const modal = result ? (
    <AppModal
      title={result.title}
      icon={result.ok ? CircleCheck : CircleAlert}
      tone={result.ok ? "primary" : "danger"}
      size="sm"
      onClose={() => setResult(null)}
      footer={
        <Button variant="primary" onPress={() => setResult(null)}>
          OK
        </Button>
      }
    >
      <p className="text-sm text-foreground">{result.message}</p>
    </AppModal>
  ) : null;
  return { show, done, failed, modal };
}
