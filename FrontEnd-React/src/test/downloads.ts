import { vi } from "vitest";

/**
 * Stands in for the browser's file saving (jsdom has none): every file a page saves with `saveBlob` is noted by its name, and its bytes
 * are kept to be read. The stubs are put back by `vi.restoreAllMocks()` and `vi.unstubAllGlobals()` (the pages' tests do both after each test).
 */
export function stubDownloads() {
  const saved: string[] = [];
  const blobs: Blob[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    saved.push(this.download);
  });
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: (blob: Blob) => {
        blobs.push(blob);
        return "blob:saved";
      },
      revokeObjectURL: () => {},
    })
  );
  return { saved, blobs };
}

/** A saved file's text (jsdom has no `Blob.text()`). */
export function textOf(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}
