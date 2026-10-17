// Deadlines come out of the extractors as free text ("by Friday", "by October
// 28", "by 3/5") -- not dates. Feeding that straight to `new Date()` is wrong
// in both directions: "by Friday" is an Invalid Date (so never overdue) while
// "by October 28" parses as the year 2001 (so always overdue). This resolves
// the text against a reference date -- the meeting it was said in -- and
// returns null when it can't, so callers can show the raw text and never
// flag an unparseable deadline as overdue.

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

function monthIndex(name: string): number {
  const lower = name.toLowerCase();
  return MONTHS.findIndex((m) => m === lower || (lower.length >= 3 && m.startsWith(lower)));
}

function validDate(year: number, month: number, day: number): Date | null {
  const d = new Date(year, month, day);
  return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day ? d : null;
}

/** Strips a leading "by"/"due"/"before" so the remaining text is the date phrase. */
export function stripDeadlinePrefix(text: string): string {
  return text.trim().replace(/^(?:by|due|before|until)\s+/i, "").trim();
}

/** Resolves a deadline phrase to a calendar day, relative to `reference`
 * (the meeting's date). Returns null if the phrase isn't understood. */
export function parseDeadline(text: string | null | undefined, reference: Date): Date | null {
  if (!text || typeof text !== "string") return null;
  if (Number.isNaN(reference.getTime())) return null;
  const ref = startOfDay(reference);
  const phrase = stripDeadlinePrefix(text).toLowerCase().replace(/[.,]+$/, "");
  if (!phrase) return null;

  let m = phrase.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return validDate(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

  // m/d or m/d/yy(yy). US order, matching the extractors' \d{1,2}/\d{1,2}.
  m = phrase.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (m) {
    const year = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : ref.getFullYear();
    let d = validDate(year, Number(m[1]) - 1, Number(m[2]));
    if (d && !m[3] && addDays(d, 183) < ref) d = validDate(year + 1, Number(m[1]) - 1, Number(m[2]));
    return d;
  }

  // "october 28", "oct 28th", "28 october"
  m = phrase.match(/^([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?$/) ||
      (() => {
        const alt = phrase.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)(?:,?\s+(\d{4}))?$/);
        return alt ? ([alt[0], alt[2], alt[1], alt[3]] as unknown as RegExpMatchArray) : null;
      })();
  if (m) {
    const month = monthIndex(m[1]);
    if (month === -1) return null;
    const day = Number(m[2]);
    if (m[3]) return validDate(Number(m[3]), month, day);
    let d = validDate(ref.getFullYear(), month, day);
    // "by January 5" said in late December means next January, not last.
    if (d && addDays(d, 183) < ref) d = validDate(ref.getFullYear() + 1, month, day);
    return d;
  }

  const weekday = phrase.match(/^(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
  if (weekday) {
    const target = WEEKDAYS.indexOf(weekday[2]);
    const ahead = ((target - ref.getDay() + 7) % 7) || 7; // next occurrence, never today
    if (!weekday[1]) return addDays(ref, ahead);
    // "next Tuesday": the Tuesday of the *following* calendar week.
    const daysToNextMonday = ((8 - ref.getDay()) % 7) || 7;
    return addDays(ref, daysToNextMonday + ((target - 1 + 7) % 7));
  }

  if (phrase === "today" || phrase === "tonight" || phrase === "eod" || phrase === "end of day") return ref;
  if (phrase === "tomorrow") return addDays(ref, 1);
  if (phrase === "next week") return addDays(ref, 7);
  if (phrase === "end of week" || phrase === "eow") {
    const toFriday = (5 - ref.getDay() + 7) % 7;
    return addDays(ref, toFriday);
  }

  const quarter = phrase.match(/^q([1-4])$/);
  if (quarter) {
    const endMonth = Number(quarter[1]) * 3; // 1-based month of quarter end
    return validDate(ref.getFullYear(), endMonth - 1, new Date(ref.getFullYear(), endMonth, 0).getDate());
  }

  return null; // "next sprint", free text, anything else
}

/** Overdue only when the deadline was understood AND its whole day has passed. */
export function isOverdue(
  deadline: string | null | undefined,
  reference: Date,
  completed: boolean,
  now: Date = new Date()
): boolean {
  if (completed) return false;
  const due = parseDeadline(deadline, reference);
  return due !== null && startOfDay(now) > due;
}

/** A readable date when the phrase resolves; otherwise the original text
 * (minus "by") -- never "Invalid Date". */
export function formatDeadline(
  deadline: string | null | undefined,
  reference: Date,
  locale?: string
): string {
  if (!deadline) return "";
  const due = parseDeadline(deadline, reference);
  return due ? due.toLocaleDateString(locale) : stripDeadlinePrefix(deadline);
}

/** Sort key: resolved date as ms, or null for unparseable (sort those last). */
export function deadlineTime(deadline: string | null | undefined, reference: Date): number | null {
  const due = parseDeadline(deadline, reference);
  return due ? due.getTime() : null;
}
