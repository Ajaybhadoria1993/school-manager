import { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle2, XCircle, Info } from "lucide-react";
import { cn } from "../../utils/helpers";

type ToastKind = "success" | "error" | "info";
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

const ToastContext = createContext<{ push: (kind: ToastKind, message: string) => void } | undefined>(undefined);

const icons: Record<ToastKind, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

const styles: Record<ToastKind, string> = {
  success: "border-success/30 bg-success-soft text-success",
  error: "border-danger/30 bg-danger-soft text-danger",
  info: "border-info/30 bg-info-soft text-info",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      {/* Top centre: clear of the bars pinned to the bottom of the forms (their Save / Admit / Export buttons). */}
      <div role="status" aria-live="polite" className="pointer-events-none fixed left-1/2 top-4 z-[100] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 flex-col items-center gap-2">
        {toasts.map((t) => {
          const Icon = icons[t.kind];
          return (
            <div
              key={t.id}
              className={cn(
                "pop-in pointer-events-auto flex w-full items-start gap-2.5 rounded-2xl border bg-surface px-4 py-3 text-sm shadow-float",
                styles[t.kind]
              )}
            >
              <Icon className="mt-0.5 size-4 shrink-0" />
              <span className="text-foreground">{t.message}</span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
