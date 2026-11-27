/** The most the server takes for a resume. */
export const MAX_RESUME_BYTES = 2 * 1024 * 1024;
export const RESUME_ACCEPT = ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** What is wrong with a chosen file before it is sent, or null. (The server looks inside it too.) */
export function resumeProblem(file: { name: string; size: number }): string | null {
  if (!/\.(pdf|docx?)$/i.test(file.name)) return "The resume must be a PDF or Word file.";
  if (file.size > MAX_RESUME_BYTES) return "The resume is bigger than 2 MB. Choose a smaller file.";
  return null;
}

/** "240 KB", "1.5 MB". */
export function fileSizeText(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The form a resume is sent in (the server reads the "resume" field). */
export function resumeForm(file: File): FormData {
  const body = new FormData();
  body.append("resume", file, file.name);
  return body;
}
