import { useCallback, useState, type ReactNode } from "react";
import { Printer, FileText } from "lucide-react";
import { AppModal } from "../ui/AppModal";
import { Button } from "../ui/Button";
import { PrintPortal } from "./PrintPortal";

/**
 * A document on screen with a Print button: the person reads it first, then prints it (or saves it as a PDF from the browser's print window). What is
 * printed is the same documents, laid out on their own pages; nothing else of the app is printed.
 */
export function DocumentDialog({ title, onClose, children, extra }: { title: string; onClose: () => void; children: ReactNode; extra?: ReactNode }) {
  const [printing, setPrinting] = useState(false);
  const done = useCallback(() => setPrinting(false), []);
  return (
    <AppModal
      title={title}
      icon={FileText}
      size="cover"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={() => setPrinting(true)}>
            <Printer className="size-4" aria-hidden />
            Print
          </Button>
          <Button onClick={onClose}>Done</Button>
        </>
      }
    >
      {extra}
      <div className="overflow-x-auto">{children}</div>
      {printing && <PrintPortal onDone={done}>{children}</PrintPortal>}
    </AppModal>
  );
}
