"use client";

import React, { useEffect, useMemo, useState, FormEvent } from "react";
import { ReactElement } from "react";

// ---- Utilities ----
const pad = (n: number): string => String(n).padStart(2, "0");

function startOfMonth(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), 1);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfMonth(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addMonths(d: Date, n: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}
function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function formatDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function displayDate(d: Date): string {
  const opts: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
  };
  return d.toLocaleDateString(undefined, opts);
}

interface Task {
  id: string;
  title: string;
  status: string;
}

const DEFAULT_TASKS: Task[] = [
  { id: "t1", title: "Prep agenda for next sprint", status: "todo" },
  { id: "t2", title: "Follow-up: design review notes", status: "in-progress" },
  { id: "t3", title: "Collect availability from QA", status: "todo" },
];

function generateTimeSlots(start = 9, end = 17): string[] {
  const slots: string[] = [];
  for (let h = start; h <= end; h++) {
    slots.push(`${pad(h)}:00`);
    if (h < end) slots.push(`${pad(h)}:30`);
  }
  return slots;
}

const ALL_SLOTS = generateTimeSlots(9, 17);
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ---- In-Memory Storage (since localStorage isn't available in artifacts) ----
interface Meeting {
  id: string;
  title: string;
  date: string;
  time: string;
  participants: string[];
}

let meetingsStorage: Meeting[] = [];

function loadMeetings(): Meeting[] {
  return meetingsStorage;
}

function saveMeetings(list: Meeting[]): void {
  meetingsStorage = list;
}

// ---- Component ----
export default function SchedulerApp(): ReactElement {
  const [cursor, setCursor] = useState<Date>(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [meetings, setMeetings] = useState<Meeting[]>(() => loadMeetings());

  useEffect(() => saveMeetings(meetings), [meetings]);

  interface FormState {
    title: string;
    date: string;
    time: string;
    participants: string;
  }

  const [form, setForm] = useState<FormState>({
    title: "",
    date: formatDateKey(new Date()),
    time: "",
    participants: "",
  });

  const monthDays = useMemo(() => {
    const start = startOfMonth(cursor);
    const end = endOfMonth(cursor);

    const firstWeekday = start.getDay();
    const totalDays = end.getDate();

    const days: { date: Date; inMonth: boolean }[] = [];

    for (let i = 0; i < firstWeekday; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() - (firstWeekday - i));
      days.push({ date: d, inMonth: false });
    }
    for (let day = 1; day <= totalDays; day++) {
      const d = new Date(cursor);
      d.setDate(day);
      days.push({ date: d, inMonth: true });
    }
    while (days.length % 7 !== 0) {
      const last = days[days.length - 1].date;
      const d = new Date(last);
      d.setDate(d.getDate() + 1);
      days.push({ date: d, inMonth: false });
    }
    return days;
  }, [cursor]);

  const selectedKey = formatDateKey(selectedDate);

  const slotsForSelectedDate = useMemo(() => {
    const isWeekend = [0, 6].includes(selectedDate.getDay());
    return isWeekend ? ALL_SLOTS.filter((_, i) => i % 2 === 0) : ALL_SLOTS;
  }, [selectedDate]);

  const meetingsForSelectedDate = useMemo(
    () => meetings.filter((m) => m.date === selectedKey),
    [meetings, selectedKey]
  );

  const usedSlots = new Set(meetingsForSelectedDate.map((m) => m.time));

  const handleSelectDay = (d: Date) => {
    setSelectedDate(d);
    setForm((f) => ({ ...f, date: formatDateKey(d) }));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return alert("Please enter a meeting title.");
    if (!form.time) return alert("Please select a time.");

    const list = form.participants
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const invalid = list.filter((x) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
    if (invalid.length) return alert(`Invalid emails: ${invalid.join(", ")}`);

    const id = `m_${Date.now()}`;
    const newMeeting: Meeting = { id, ...form, participants: list };
    setMeetings((prev) => [newMeeting, ...prev]);
    setForm((f) => ({ ...f, time: "" }));
  };

  const handleDelete = (id: string) => {
    setMeetings((prev) => prev.filter((m) => m.id !== id));
  };

  const Header = () => (
    <header className="backdrop-blur-sm bg-white/90 border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between">
          {/* Logo + Title */}
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center">
              <span className="text-white font-bold text-lg">A</span>
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                AURA Meetings
              </h1>
              <p className="text-sm text-gray-600">
                Lightweight scheduler UI (Next.js + Tailwind ready)
              </p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex items-center gap-3">
            <button
              className="px-4 py-2 rounded-2xl border border-gray-300 text-gray-900 hover:bg-gray-50 hover:border-gray-400 active:scale-95 transition-all duration-200 font-medium"
              onClick={() => setCursor((c) => addMonths(c, -1))}
            >
              ← Prev
            </button>

            <div className="min-w-[180px] text-center font-semibold text-gray-900">
              {cursor.toLocaleString(undefined, {
                month: "long",
                year: "numeric",
              })}
            </div>

            <button
              className="px-4 py-2 rounded-2xl border border-gray-300 text-gray-900 hover:bg-gray-50 hover:border-gray-400 active:scale-95 transition-all duration-200 font-medium"
              onClick={() => setCursor((c) => addMonths(c, 1))}
            >
              Next →
            </button>
          </nav>
        </div>
      </div>
    </header>
  );

  const Calendar = () => (
    <section className="rounded-3xl bg-white shadow-xl shadow-gray-100 border border-gray-100">
      <div className="bg-gradient-to-r from-gray-50 to-blue-50 px-6 py-4 border-b border-gray-100">
        <h2 className="font-semibold text-gray-800">Calendar</h2>
      </div>
      <div className="p-6">
        <div className="grid grid-cols-7 text-center text-xs font-semibold text-gray-500 mb-4">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-2">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {monthDays.map(({ date, inMonth }, idx) => {
            const isToday = sameDay(date, new Date());
            const isSelected = sameDay(date, selectedDate);
            const key = formatDateKey(date);
            const count = meetings.filter((m) => m.date === key).length;

            return (
              <button
                key={idx}
                onClick={() => handleSelectDay(date)}
                className={`
                aspect-square rounded-2xl p-3 text-left transition-all duration-200 group relative
                ${inMonth ? "text-gray-700" : "text-gray-400"}
                ${
                  isSelected
                    ? "bg-blue-500 text-white shadow-lg scale-105"
                    : isToday
                    ? "bg-blue-100 text-blue-700 border-2 border-blue-300"
                    : "border border-gray-200 hover:border-gray-300 hover:bg-gray-50 hover:scale-105"
                }
              `}
              >
                <div className="flex items-start justify-between mb-2">
                  <span className={`text-sm font-bold`}>{date.getDate()}</span>
                  {count > 0 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                        isSelected
                          ? "bg-white/20 text-white"
                          : "bg-orange-400 text-white"
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {ALL_SLOTS.slice(0, 2).map((s) => (
                    <div
                      key={s}
                      className={`h-1 rounded-full ${
                        isSelected ? "bg-white/30" : "bg-gray-200"
                      }`}
                    />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );

  const SlotsPanel = () => (
    <section className="rounded-3xl bg-white shadow-xl shadow-gray-100 border border-gray-100 overflow-hidden">
      <div className="bg-gradient-to-r from-gray-50 to-green-50 px-6 py-4 border-b border-gray-100">
        <h3 className="font-semibold text-gray-800">Available Times</h3>
        <p className="text-sm text-gray-600 mt-1">
          {displayDate(selectedDate)}
        </p>
      </div>
      <div className="p-6">
        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {slotsForSelectedDate.map((slot) => {
            const disabled = usedSlots.has(slot);
            const isSelected = form.time === slot;
            return (
              <button
                key={slot}
                disabled={disabled}
                onClick={() => setForm((f) => ({ ...f, time: slot }))}
                className={`
                px-4 py-3 rounded-2xl text-sm font-semibold transition-all duration-200
                ${
                  isSelected
                    ? "bg-blue-600 text-white shadow-lg scale-105 border border-blue-700"
                    : disabled
                    ? "bg-gray-100 text-gray-400 border border-gray-300 cursor-not-allowed opacity-70"
                    : "bg-white text-gray-800 border border-gray-300 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 hover:scale-105 active:scale-95"
                }
              `}
              >
                {slot}
              </button>
            );
          })}
        </div>

        {slotsForSelectedDate.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <div className="w-16 h-16 mx-auto bg-gray-100 rounded-full flex items-center justify-center mb-3">
              <span className="text-3xl">📅</span>
            </div>
            <p className="text-gray-600 font-medium">
              No slots available for this date
            </p>
          </div>
        )}
      </div>
    </section>
  );

  const ScheduleForm = () => (
    <form
      onSubmit={handleSubmit}
      className="rounded-3xl bg-white shadow-xl shadow-gray-100 border border-gray-100 overflow-hidden"
    >
      <div className="bg-gradient-to-r from-gray-50 to-purple-50 px-6 py-4 border-b border-gray-100">
        <h3 className="font-semibold text-gray-900">Schedule a Meeting</h3>
      </div>
      <div className="p-6 space-y-5">
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-900">Title</label>
            <input
              type="text"
              className="w-full px-4 py-3 rounded-2xl border border-gray-300 outline-none text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              placeholder="e.g., Sprint Planning"
              value={form.title}
              onChange={(e) =>
                setForm((f) => ({ ...f, title: e.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-900">Date</label>
            <input
              type="date"
              className="w-full px-4 py-3 rounded-2xl border border-gray-300 outline-none text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-900">Time</label>
          <select
            className="w-full px-4 py-3 rounded-2xl border border-gray-300 outline-none text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            value={form.time}
            onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
          >
            <option value="">Select a time</option>
            {slotsForSelectedDate.map((slot) => (
              <option key={slot} value={slot} disabled={usedSlots.has(slot)}>
                {slot} {usedSlots.has(slot) ? "(booked)" : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-900">
            Participants (comma-separated emails)
          </label>
          <input
            type="text"
            className="w-full px-4 py-3 rounded-2xl border border-gray-300 outline-none text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            placeholder="alice@company.com, bob@company.com"
            value={form.participants}
            onChange={(e) =>
              setForm((f) => ({ ...f, participants: e.target.value }))
            }
          />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            className="flex-1 px-6 py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold hover:from-blue-700 hover:to-blue-800 active:scale-95 transition-all duration-200 shadow-lg shadow-blue-200"
          >
            Schedule Meeting
          </button>
          <button
            type="button"
            onClick={() =>
              setForm({
                title: "",
                date: formatDateKey(selectedDate),
                time: "",
                participants: "",
              })
            }
            className="px-6 py-3 rounded-2xl border border-gray-300 font-medium text-gray-900 hover:bg-gray-50 active:scale-95 transition-all duration-200"
          >
            Reset
          </button>
        </div>
      </div>
    </form>
  );

  const TasksPanel = () => (
    <section className="rounded-3xl bg-white shadow-xl shadow-gray-100 border border-gray-100 overflow-hidden">
      <div className="bg-gradient-to-r from-gray-50 to-yellow-50 px-6 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-gray-800">Tasks</h4>
          <button className="text-sm px-3 py-1 rounded-lg border border-gray-200 hover:bg-gray-50 active:scale-95 transition-all duration-200">
            Add
          </button>
        </div>
      </div>
      <div className="p-6 space-y-3">
        {DEFAULT_TASKS.map((t, index) => (
          <div
            key={t.id}
            className="border-2 border-gray-200 rounded-2xl p-4 hover:shadow-lg hover:border-gray-300 transition-all duration-200 group bg-white"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="font-bold text-gray-900 text-base group-hover:text-blue-700 transition-colors">
                  {t.title}
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <span
                    className={`
                    text-sm px-3 py-1 rounded-full font-bold border-2
                    ${
                      t.status === "todo"
                        ? "bg-yellow-100 border-yellow-300 text-yellow-800"
                        : t.status === "in-progress"
                        ? "bg-blue-100 border-blue-300 text-blue-800"
                        : "bg-green-100 border-green-300 text-green-800"
                    }
                  `}
                  >
                    {t.status.toUpperCase()}
                  </span>
                </div>
              </div>
              <button className="text-sm font-semibold px-3 py-2 rounded-xl bg-gray-100 border-2 border-gray-200 text-gray-700 hover:bg-gray-200 hover:border-gray-300 active:scale-95 transition-all duration-200">
                Edit
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );

  const Dashboard = () => (
    <section className="rounded-3xl bg-white shadow-xl shadow-gray-100 border border-gray-100 overflow-hidden">
      <div className="grid md:grid-cols-2 gap-6">
        {/* Upcoming Meetings */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold text-gray-800">Upcoming Meetings</h4>
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium">
              {
                meetings.filter(
                  (m) => new Date(`${m.date}T${m.time}`) >= new Date()
                ).length
              }{" "}
              total
            </span>
          </div>
          <div className="space-y-3">
            {meetings.filter(
              (m) => new Date(`${m.date}T${m.time}`) >= new Date()
            ).length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <div className="w-16 h-16 mx-auto bg-gray-100 rounded-full flex items-center justify-center mb-3">
                  <span className="text-2xl">📝</span>
                </div>
                <p className="text-sm">No upcoming meetings.</p>
              </div>
            )}
            {meetings
              .filter((m) => new Date(`${m.date}T${m.time}`) >= new Date())
              .slice()
              .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
              .map((m, index) => (
                <div
                  key={m.id}
                  className="border border-gray-100 rounded-2xl p-4 hover:shadow-md transition-all duration-200 group"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                        {m.title}
                      </div>
                      <div className="text-sm text-gray-500 mt-1">
                        {m.date} • {m.time}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(m.id)}
                      className="text-sm px-3 py-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 active:scale-95 transition-all duration-200"
                    >
                      Delete
                    </button>
                  </div>
                  {m.participants?.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <div className="text-xs text-gray-600">
                        <span className="font-medium">Participants:</span>{" "}
                        {m.participants.join(", ")}
                      </div>
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>

        {/* Completed Meetings */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold text-gray-800">Completed Meetings</h4>
            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">
              {
                meetings.filter(
                  (m) => new Date(`${m.date}T${m.time}`) < new Date()
                ).length
              }{" "}
              total
            </span>
          </div>
          <div className="space-y-3">
            {meetings.filter(
              (m) => new Date(`${m.date}T${m.time}`) < new Date()
            ).length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <div className="w-16 h-16 mx-auto bg-gray-100 rounded-full flex items-center justify-center mb-3">
                  <span className="text-2xl">✅</span>
                </div>
                <p className="text-sm">No completed meetings yet.</p>
              </div>
            )}
            {meetings
              .filter((m) => new Date(`${m.date}T${m.time}`) < new Date())
              .slice()
              .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)) // recent first
              .map((m, index) => (
                <div
                  key={m.id}
                  className="border border-gray-100 rounded-2xl p-4 hover:shadow-md transition-all duration-200 group bg-gray-50"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-semibold text-gray-500 group-hover:text-gray-700 transition-colors">
                        {m.title}
                      </div>
                      <div className="text-sm text-gray-400 mt-1">
                        {m.date} • {m.time}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(m.id)}
                      className="text-sm px-3 py-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 active:scale-95 transition-all duration-200"
                    >
                      Delete
                    </button>
                  </div>
                  {m.participants?.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500">
                      <span className="font-medium">Participants:</span>{" "}
                      {m.participants.join(", ")}
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      </div>
    </section>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50">
      <Header />

      <main className="container mx-auto max-w-6xl px-6 pb-16 space-y-8">
        {/* Layout: Calendar + Slots + Form */}
        <div className="grid lg:grid-cols-3 gap-8 pt-8">
          <div className="lg:col-span-2 space-y-8">
            <Calendar />
            <SlotsPanel />
          </div>
          <div className="space-y-8">
            <ScheduleForm />
            <div className="mt-6">
              {" "}
              {/* adds extra 1.5rem gap */}
              <TasksPanel />
            </div>
          </div>
        </div>

        {/* Dashboard */}
        <Dashboard />
      </main>

      <footer className="py-8 text-center">
        <div className="text-sm text-gray-500 flex items-center justify-center gap-2">
          Built with <span className="text-red-500 animate-pulse">❤️</span>{" "}
          using React + Tailwind
        </div>
      </footer>
    </div>
  );
}
