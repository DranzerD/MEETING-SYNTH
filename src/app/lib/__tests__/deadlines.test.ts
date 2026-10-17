import { describe, expect, it } from "vitest";
import { deadlineTime, formatDeadline, isOverdue, parseDeadline } from "../deadlines";

// Fixed reference: Wednesday, 14 Oct 2026 (local time, so tests don't depend on the clock/timezone).
const ref = new Date(2026, 9, 14);
const ymd = (d: Date | null) => (d ? `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` : null);

describe("parseDeadline", () => {
  it("resolves a weekday to its next occurrence after the meeting", () => {
    expect(ymd(parseDeadline("by Friday", ref))).toBe("2026-10-16");
    expect(ymd(parseDeadline("by Wednesday", ref))).toBe("2026-10-21"); // never "today"
  });

  it("resolves 'next <weekday>' to the following calendar week", () => {
    expect(ymd(parseDeadline("by next Tuesday", ref))).toBe("2026-10-20");
    expect(ymd(parseDeadline("by next Friday", ref))).toBe("2026-10-23");
  });

  it("uses the meeting's year for month-day dates, not 2001", () => {
    expect(ymd(parseDeadline("by October 28", ref))).toBe("2026-10-28");
    expect(ymd(parseDeadline("by Oct 28th", ref))).toBe("2026-10-28");
    expect(ymd(parseDeadline("by 28 October", ref))).toBe("2026-10-28");
  });

  it("rolls a month-day that is far in the past into next year", () => {
    expect(ymd(parseDeadline("by January 5", new Date(2026, 11, 20)))).toBe("2027-1-5");
  });

  it("parses ISO and m/d dates", () => {
    expect(ymd(parseDeadline("by 2026-11-03", ref))).toBe("2026-11-3");
    expect(ymd(parseDeadline("by 3/5", new Date(2026, 1, 1)))).toBe("2026-3-5");
  });

  it("handles relative words", () => {
    expect(ymd(parseDeadline("by tomorrow", ref))).toBe("2026-10-15");
    expect(ymd(parseDeadline("by today", ref))).toBe("2026-10-14");
    expect(ymd(parseDeadline("by next week", ref))).toBe("2026-10-21");
    expect(ymd(parseDeadline("by EOW", ref))).toBe("2026-10-16");
    expect(ymd(parseDeadline("by Q4", ref))).toBe("2026-12-31");
  });

  it("returns null for phrases it does not understand, and for invalid dates", () => {
    expect(parseDeadline("by next sprint", ref)).toBeNull();
    expect(parseDeadline("by February 30", ref)).toBeNull();
    expect(parseDeadline("soon-ish", ref)).toBeNull();
    expect(parseDeadline("", ref)).toBeNull();
    expect(parseDeadline(undefined, ref)).toBeNull();
    expect(parseDeadline("by Friday", new Date("garbage"))).toBeNull();
  });
});

describe("isOverdue", () => {
  const now = new Date(2026, 9, 20); // Tue 20 Oct 2026

  it("is overdue once the resolved day has passed", () => {
    expect(isOverdue("by Friday", ref, false, now)).toBe(true); // Fri 16 Oct
  });

  it("is NOT overdue for a month-day still in the future (used to parse as 2001 -> always overdue)", () => {
    expect(isOverdue("by October 28", ref, false, now)).toBe(false);
  });

  it("is not overdue on the due day itself", () => {
    expect(isOverdue("by October 20", ref, false, now)).toBe(false);
  });

  it("never flags an unparseable deadline or a completed task", () => {
    expect(isOverdue("by next sprint", ref, false, now)).toBe(false);
    expect(isOverdue("by Friday", ref, true, now)).toBe(false);
    expect(isOverdue(null, ref, false, now)).toBe(false);
  });
});

describe("formatDeadline / deadlineTime", () => {
  it("never renders 'Invalid Date'", () => {
    expect(formatDeadline("by next sprint", ref)).toBe("next sprint");
    expect(formatDeadline("by Friday", ref, "en-US")).toBe("10/16/2026");
    expect(formatDeadline(undefined, ref)).toBe("");
  });

  it("gives null sort keys for unparseable deadlines", () => {
    expect(deadlineTime("by next sprint", ref)).toBeNull();
    expect(typeof deadlineTime("by Friday", ref)).toBe("number");
  });
});
