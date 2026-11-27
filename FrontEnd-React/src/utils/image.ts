/** The most the server takes for a student's photo (it is shrunk before it is sent, so a phone's 4 MB picture goes as about 40 KB). */
export const MAX_PHOTO_BYTES = 300 * 1024;
const LONGEST_SIDE = 480;

/** The form a photo is sent in (the server reads the "photo" field). */
export function photoForm(picture: Blob, fileName: string): FormData {
  const body = new FormData();
  body.append("photo", picture, fileName);
  return body;
}

/**
 * A picture a person chose, made small for an ID card: no side longer than 480 pixels, as a JPEG. When the browser cannot do it (an old one, a
 * picture it cannot read) the picture goes as it is, and the server's own size check says if it is too big.
 */
export async function shrinkPhoto(file: File): Promise<Blob> {
  try {
    if (typeof createImageBitmap !== "function" || typeof document === "undefined") return file;
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, LONGEST_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}
