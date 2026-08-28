/**
 * Chat constants + validation shared by client and server.
 * (No "server-only" here — the client needs these too.)
 */

export const CHAT_BUCKET = "chat-images";
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB (matches bucket limit)
export const MAX_MESSAGE_LENGTH = 2000;

/** Images only — no video/audio/other. Mirrors the bucket's allowed_mime_types. */
export const ALLOWED_IMAGE_MIME = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

const ALLOWED_EXT = new Set(["png", "jpg", "jpeg", "webp", "gif"]);

/** Client-side check before uploading. Returns an error string, or null if ok. */
export function validateImageFile(file: File): string | null {
  if (!(ALLOWED_IMAGE_MIME as readonly string[]).includes(file.type)) {
    return "Only image files (PNG, JPEG, WebP, GIF) are allowed.";
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return "Image must be 5 MB or smaller.";
  }
  return null;
}

export function extForMime(mime: string): string {
  return MIME_TO_EXT[mime] ?? "bin";
}

/** Server-side check: the stored path must be an image, inside the conversation folder. */
export function isAllowedImagePath(path: string, conversationId: string): boolean {
  if (!path.startsWith(`${conversationId}/`)) return false;
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return ALLOWED_EXT.has(ext);
}
