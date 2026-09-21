import { describe, expect, it } from "vitest";
import {
  validateTranscript,
  validateMeetingTitle,
  isSafeMeetingId,
  sanitizeFilename,
  formatFileSize,
} from "../validation";

describe("validateTranscript", () => {
  it("rejects empty input", () => {
    expect(validateTranscript("").valid).toBe(false);
  });

  it("rejects input shorter than the minimum", () => {
    expect(validateTranscript("too short").valid).toBe(false);
  });

  it("rejects input longer than the maximum", () => {
    expect(validateTranscript("a".repeat(500001)).valid).toBe(false);
  });

  it("rejects low-entropy / gibberish-looking input", () => {
    expect(validateTranscript("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa").valid).toBe(false);
  });

  it("accepts a normal-looking transcript", () => {
    const transcript = "Dana will finalize the onboarding deck by Friday. We decided to ship then too.";
    expect(validateTranscript(transcript).valid).toBe(true);
  });
});

describe("validateMeetingTitle", () => {
  it("rejects an empty title", () => {
    expect(validateMeetingTitle("").valid).toBe(false);
  });

  it("rejects a title over 200 characters", () => {
    expect(validateMeetingTitle("a".repeat(201)).valid).toBe(false);
  });

  it("rejects a title with no letters", () => {
    expect(validateMeetingTitle("123456!!!").valid).toBe(false);
  });

  it("accepts a normal title", () => {
    expect(validateMeetingTitle("Sprint Planning Q1").valid).toBe(true);
  });
});

describe("isSafeMeetingId", () => {
  it("accepts a normal generated meeting id", () => {
    expect(isSafeMeetingId("aura_1700000000000")).toBe(true);
  });

  it("rejects an id containing a forward slash (path traversal shape)", () => {
    expect(isSafeMeetingId("../../etc/passwd")).toBe(false);
  });

  it("rejects an id containing a backslash", () => {
    expect(isSafeMeetingId("..\\..\\windows\\system32")).toBe(false);
  });

  it("rejects an id containing '..' even without a separator", () => {
    expect(isSafeMeetingId("meeting..id")).toBe(false);
  });

  it("rejects an empty id", () => {
    expect(isSafeMeetingId("")).toBe(false);
  });

  it("rejects an id over 150 characters", () => {
    expect(isSafeMeetingId("a".repeat(151))).toBe(false);
  });
});

describe("sanitizeFilename", () => {
  it("replaces filesystem-unsafe characters with underscores", () => {
    expect(sanitizeFilename('a/b\\c:d"e')).toBe("a_b_c_d_e");
  });

  it("truncates to 100 characters", () => {
    expect(sanitizeFilename("a".repeat(150)).length).toBe(100);
  });
});

describe("formatFileSize", () => {
  it("formats bytes, KB, and MB appropriately", () => {
    expect(formatFileSize(500)).toBe("500 B");
    expect(formatFileSize(2048)).toBe("2.0 KB");
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});
