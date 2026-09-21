// Validation utilities for production use

export function validateTranscript(transcript: string): {
  valid: boolean;
  error?: string;
} {
  if (!transcript || typeof transcript !== "string") {
    return { valid: false, error: "Transcript is required" };
  }

  const trimmed = transcript.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: "Transcript cannot be empty" };
  }

  if (trimmed.length < 50) {
    return {
      valid: false,
      error: "Transcript is too short (minimum 50 characters)",
    };
  }

  if (trimmed.length > 500000) {
    return {
      valid: false,
      error: "Transcript is too long (maximum 500,000 characters)",
    };
  }

  // Check if it's just repeated characters or gibberish
  const uniqueChars = new Set(trimmed.toLowerCase().replace(/\s/g, "")).size;
  if (uniqueChars < 10) {
    return {
      valid: false,
      error: "Transcript appears to be invalid (too few unique characters)",
    };
  }

  return { valid: true };
}

export function validateMeetingTitle(title: string): {
  valid: boolean;
  error?: string;
} {
  if (!title || typeof title !== "string") {
    return { valid: false, error: "Meeting title is required" };
  }

  const trimmed = title.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: "Meeting title cannot be empty" };
  }

  if (trimmed.length > 200) {
    return {
      valid: false,
      error: "Meeting title is too long (maximum 200 characters)",
    };
  }

  // Prevent just numbers or special characters
  if (!/[a-zA-Z]/.test(trimmed)) {
    return {
      valid: false,
      error: "Meeting title must contain at least one letter",
    };
  }

  return { valid: true };
}

/** Rejects (rather than silently rewrites) a meeting id that could escape
 * the meetings data directory when joined into a filesystem path -- ids
 * must already be safe (analyze/route.ts sanitizes at creation time), so a
 * path separator or ".." here means the id was tampered with or came from
 * an untrusted source, not that it needs cleaning up. */
export function isSafeMeetingId(id: string): boolean {
  if (!id || typeof id !== "string" || id.length > 150) return false;
  if (id.includes("..") || id.includes("/") || id.includes("\\")) return false;
  return true;
}

export function sanitizeFilename(filename: string): string {
  // Remove or replace characters that are problematic in filenames
  return filename
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, "_")
    .substring(0, 100); // Limit length
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export function estimateReadingTime(text: string): number {
  const words = text.trim().split(/\s+/).length;
  const wordsPerMinute = 200; // Average reading speed
  return Math.ceil(words / wordsPerMinute);
}
