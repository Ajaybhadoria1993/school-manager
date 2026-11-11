import { Link } from "react-router";
import { Download, KeyRound, PartyPopper, PencilLine, TriangleAlert, Upload } from "lucide-react";
import { TONES } from "../../../constants/tones";
import { cn } from "../../../utils/helpers";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";

/** A teacher who was made, and the login to hand over. */
export interface AddedTeacher {
  row: number;
  id: string;
  name: string;
  mobile: string;
  username: string;
  password: string;
}

/**
 * The last step: how many teachers were added, the rows of teachers the school already had (not added again, nothing to fix), the rows
 * still to fix (fix them here, or as a file), and where to go next.
 */
export function TeacherDoneCard({
  added,
  notAdded,
  already,
  backTo,
  onFix,
  onDownloadProblems,
  onAnother,
}: {
  added: number;
  /** Rows that still need a fix. */
  notAdded: number;
  /** Rows whose teacher was in the school already. */
  already: number;
  backTo: string;
  onFix: () => void;
  onDownloadProblems: () => void;
  onAnother: () => void;
}) {
  return (
    <Card className="fade-in relative overflow-hidden px-6 py-8 text-center sm:py-10">
      <div aria-hidden className={cn("absolute -right-16 -top-16 size-56 rounded-full bg-gradient-to-br to-transparent blur-3xl", TONES.success.glow)} />
      <span aria-hidden className={cn("relative mx-auto flex size-14 items-center justify-center rounded-2xl", added > 0 ? TONES.success.gradient : TONES.warning.gradient)}>
        {added > 0 ? <PartyPopper className="size-7" /> : <TriangleAlert className="size-7" />}
      </span>
      <h2 className="text-section-heading relative mt-4">{added > 0 ? `${added} teacher${added === 1 ? "" : "s"} added` : "No teacher was added"}</h2>
      <div className="relative mx-auto mt-2 max-w-xl space-y-1 text-sm text-foreground-muted">
        {already > 0 && (
          <p>
            {already} row{already === 1 ? " was" : "s were"} already in your school: {already === 1 ? "it was" : "they were"} not added again.
          </p>
        )}
        {notAdded > 0 ? (
          <p>
            {notAdded} row{notAdded === 1 ? " still needs" : "s still need"} a fix. Fix {notAdded === 1 ? "it" : "them"} in the table and upload again, or download{" "}
            {notAdded === 1 ? "it" : "them"} with the problem written beside each row.
          </p>
        ) : (
          <p>{already > 0 ? "Every other row of the file was added." : "Every row of the file was added."}</p>
        )}
      </div>
      <div className="relative mt-5 flex flex-wrap items-center justify-center gap-2.5">
        {notAdded > 0 && (
          <>
            <Button onClick={onFix}>
              <PencilLine className="size-4" aria-hidden />
              Fix the {notAdded} row{notAdded === 1 ? "" : "s"}
            </Button>
            <Button variant="outline" onClick={onDownloadProblems}>
              <Download className="size-4" aria-hidden />
              Download them
            </Button>
          </>
        )}
        <Button variant="outline" onClick={onAnother}>
          <Upload className="size-4" aria-hidden />
          Upload another file
        </Button>
        <Link
          to={backTo}
          className={cn(
            "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-all",
            notAdded > 0 ? "border border-border bg-surface text-foreground shadow-sm hover:bg-background" : "bg-primary text-primary-foreground hover:bg-primary-hover"
          )}
        >
          Go to teachers
        </Link>
      </div>
    </Card>
  );
}

/**
 * The logins just made, to hand over: the username and the password of each teacher added in this visit. The passwords are shown only
 * now (only their hash is kept), so the list can be downloaded here; the school can still set a new password for anyone later.
 */
export function TeacherLogins({ added, onDownload }: { added: AddedTeacher[]; onDownload: () => void }) {
  return (
    <Card className="fade-in space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-section-heading flex items-center gap-2">
            <KeyRound className="size-5 text-primary" aria-hidden />
            Login details
          </h2>
          <p className="mt-0.5 text-sm text-foreground-muted">The passwords are shown only now. Download the list before you leave this page.</p>
        </div>
        <Button onClick={onDownload}>
          <Download className="size-4" aria-hidden />
          Download login details
        </Button>
      </div>
      <div className="max-h-96 overflow-auto rounded-xl border border-border">
        <table aria-label="Logins to hand out" className="min-w-full text-sm">
          <thead className="sticky top-0 bg-background text-left text-xs font-bold uppercase tracking-wider text-foreground-muted">
            <tr>
              <th scope="col" className="px-4 py-2.5">
                Name
              </th>
              <th scope="col" className="px-4 py-2.5">
                Mobile
              </th>
              <th scope="col" className="px-4 py-2.5">
                Username
              </th>
              <th scope="col" className="px-4 py-2.5">
                Password
              </th>
            </tr>
          </thead>
          <tbody>
            {added.map((a) => (
              <tr key={a.id} className="border-t border-border/70">
                <td className="px-4 py-2 font-semibold text-foreground">{a.name}</td>
                <td className="px-4 py-2 text-foreground-muted">{a.mobile}</td>
                <td className="px-4 py-2 font-mono text-foreground">{a.username}</td>
                <td className="px-4 py-2 font-mono text-foreground">{a.password}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
