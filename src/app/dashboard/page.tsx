"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

type Meeting = {
  meeting_id: string;
  title: string;
  timestamp: string;
  tasks: any[];
  decisions: any[];
  sentiment: any;
};

export default function DashboardPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"meetings" | "people">("meetings");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchMeetings();
  }, []);

  const fetchMeetings = async () => {
    try {
      const response = await fetch("/api/meetings");
      const data = await response.json();
      if (data.success) {
        setMeetings(data.meetings);
      }
    } catch (error) {
      console.error("Error fetching meetings:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getTaskStats = (meeting: Meeting) => {
    const tasks = meeting.tasks || [];
    const open = tasks.filter((t) => !t.completed).length;
    const completed = tasks.filter((t) => t.completed).length;
    const overdue = tasks.filter(
      (t) => !t.completed && t.deadline && new Date(t.deadline) < new Date()
    ).length;
    return { open, completed, overdue };
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-white text-xl">Loading meetings...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              Meeting Dashboard
            </h1>
            <p className="text-slate-400 mt-2">
              {meetings.length} meeting{meetings.length !== 1 ? "s" : ""}{" "}
              analyzed
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/"
              className="rounded-full border border-white/10 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10 transition-colors"
            >
              ← Home
            </Link>
            <Link
              href="/chat"
              className="rounded-full border border-white/10 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10 transition-colors"
            >
              💬 Chat
            </Link>
            <Link
              href="/analyze"
              className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-900 shadow-lg hover:bg-slate-100 transition-colors"
            >
              + New Analysis
            </Link>
          </div>
        </div>

        {meetings.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="text-3xl font-bold">{meetings.length}</div>
              <div className="text-sm text-slate-400">Total Meetings</div>
            </div>
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="text-3xl font-bold">
                {meetings.reduce((acc, m) => acc + (m.tasks?.length || 0), 0)}
              </div>
              <div className="text-sm text-slate-400">Total Tasks</div>
            </div>
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="text-3xl font-bold">
                {meetings.reduce(
                  (acc, m) => acc + (m.decisions?.length || 0),
                  0
                )}
              </div>
              <div className="text-sm text-slate-400">Total Decisions</div>
            </div>
          </div>
        )}

        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex gap-2">
            <button
              onClick={() => setView("meetings")}
              className={`px-6 py-2 rounded-full font-semibold transition-all ${
                view === "meetings"
                  ? "bg-white text-slate-900"
                  : "bg-white/10 text-slate-300 hover:bg-white/20"
              }`}
            >
              📅 Meetings
            </button>
            <button
              onClick={() => setView("people")}
              className={`px-6 py-2 rounded-full font-semibold transition-all ${
                view === "people"
                  ? "bg-white text-slate-900"
                  : "bg-white/10 text-slate-300 hover:bg-white/20"
              }`}
            >
              👥 People
            </button>
          </div>

          <input
            type="text"
            placeholder={
              view === "meetings"
                ? "🔍 Search meetings..."
                : "🔍 Search people..."
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 px-4 py-2 rounded-full bg-white/5 border border-white/10 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>

        {view === "meetings" ? (
          <MeetingsView
            meetings={meetings}
            formatDate={formatDate}
            getTaskStats={getTaskStats}
            searchQuery={searchQuery}
          />
        ) : (
          <PeopleView searchQuery={searchQuery} />
        )}
      </div>
    </div>
  );
}

function MeetingsView({
  meetings,
  formatDate,
  getTaskStats,
  searchQuery,
}: {
  meetings: Meeting[];
  formatDate: (ts: string) => string;
  getTaskStats: (m: Meeting) => {
    open: number;
    completed: number;
    overdue: number;
  };
  searchQuery: string;
}) {
  const filteredMeetings = meetings.filter((meeting) =>
    meeting.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (filteredMeetings.length === 0) {
    if (searchQuery) {
      return (
        <div className="bg-white/5 rounded-2xl p-12 text-center">
          <div className="text-6xl mb-4">🔍</div>
          <h3 className="text-2xl font-semibold mb-2">No meetings found</h3>
          <p className="text-slate-400">Try a different search term</p>
        </div>
      );
    }

    return (
      <div className="bg-white/5 rounded-2xl p-12 text-center">
        <div className="text-6xl mb-4">📋</div>
        <h3 className="text-2xl font-semibold mb-2">No meetings yet</h3>
        <p className="text-slate-400 mb-6">
          Upload your first meeting transcript to get started
        </p>
        <Link
          href="/analyze"
          className="inline-block rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-100 transition-colors"
        >
          Analyze Meeting
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {filteredMeetings.map((meeting) => {
        const stats = getTaskStats(meeting);
        const sentiment =
          meeting.sentiment?.overall || meeting.sentiment?.label;
        const sentimentColor =
          sentiment === "positive"
            ? "text-green-400"
            : sentiment === "negative"
            ? "text-red-400"
            : "text-slate-400";

        return (
          <Link
            key={meeting.meeting_id}
            href={`/meetings/${meeting.meeting_id}`}
            className="block bg-white/5 rounded-2xl p-6 border border-white/10 hover:border-white/20 hover:bg-white/10 transition-all"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="text-xl font-semibold mb-2">{meeting.title}</h3>
                <p className="text-sm text-slate-400 mb-4">
                  {formatDate(meeting.timestamp)}
                </p>

                <div className="flex gap-6 text-sm">
                  <div>
                    <span className="text-slate-400">Tasks:</span>
                    <span className="ml-2 font-semibold">
                      {stats.open} open
                    </span>
                    {stats.completed > 0 && (
                      <span className="ml-2 text-green-400">
                        • {stats.completed} done
                      </span>
                    )}
                    {stats.overdue > 0 && (
                      <span className="ml-2 text-red-400">
                        • {stats.overdue} overdue
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="text-slate-400">Decisions:</span>
                    <span className="ml-2 font-semibold">
                      {meeting.decisions?.length || 0}
                    </span>
                  </div>
                  {sentiment && (
                    <div>
                      <span className="text-slate-400">Sentiment:</span>
                      <span className={`ml-2 font-semibold ${sentimentColor}`}>
                        {sentiment}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="text-slate-400">→</div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function PeopleView({ searchQuery }: { searchQuery: string }) {
  const [people, setPeople] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPerson, setSelectedPerson] = useState<any>(null);

  useEffect(() => {
    fetchPeople();
  }, []);

  const fetchPeople = async () => {
    try {
      const response = await fetch("/api/people");
      const data = await response.json();
      if (data.success) {
        setPeople(data.people);
      }
    } catch (error) {
      console.error("Error fetching people:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredPeople = people.filter((person) =>
    person.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return <div className="text-center py-12">Loading people...</div>;
  }

  if (filteredPeople.length === 0) {
    if (searchQuery) {
      return (
        <div className="bg-white/5 rounded-2xl p-12 text-center">
          <div className="text-6xl mb-4">🔍</div>
          <h3 className="text-2xl font-semibold mb-2">No people found</h3>
          <p className="text-slate-400">Try a different search term</p>
        </div>
      );
    }

    return (
      <div className="bg-white/5 rounded-2xl p-12 text-center">
        <div className="text-6xl mb-4">👥</div>
        <h3 className="text-2xl font-semibold mb-2">No assignees yet</h3>
        <p className="text-slate-400">
          Task assignees will appear here once you analyze meetings
        </p>
      </div>
    );
  }

  if (selectedPerson) {
    return (
      <div>
        <button
          onClick={() => setSelectedPerson(null)}
          className="mb-6 text-slate-400 hover:text-white flex items-center gap-2"
        >
          ← Back to all people
        </button>

        <div className="bg-white/5 rounded-2xl p-8 border border-white/10">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-3xl font-bold">{selectedPerson.name}</h2>
              <p className="text-slate-400 mt-2">
                {selectedPerson.taskCount} tasks across{" "}
                {selectedPerson.meetingCount} meetings
              </p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-white">
                {selectedPerson.openTasks}
              </div>
              <div className="text-sm text-slate-400">open tasks</div>
              {selectedPerson.overdueTasks > 0 && (
                <div className="text-sm text-red-400 mt-1">
                  {selectedPerson.overdueTasks} overdue
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            {selectedPerson.tasks
              .sort((a: any, b: any) => {
                if (a.completed !== b.completed) return a.completed ? 1 : -1;
                if (a.deadline && b.deadline) {
                  return (
                    new Date(a.deadline).getTime() -
                    new Date(b.deadline).getTime()
                  );
                }
                return 0;
              })
              .map((task: any, idx: number) => {
                const isOverdue =
                  task.deadline &&
                  new Date(task.deadline) < new Date() &&
                  !task.completed;

                return (
                  <div
                    key={idx}
                    className={`p-4 rounded-xl border ${
                      task.completed
                        ? "bg-white/5 border-white/5 opacity-60"
                        : isOverdue
                        ? "bg-red-500/10 border-red-500/30"
                        : "bg-white/10 border-white/10"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1">
                        <div
                          className={
                            task.completed ? "line-through text-slate-500" : ""
                          }
                        >
                          {task.task || task.text}
                        </div>
                        <div className="flex gap-4 mt-2 text-sm text-slate-400">
                          <span>📅 {task.meetingTitle}</span>
                          {task.deadline && (
                            <span className={isOverdue ? "text-red-400" : ""}>
                              Due:{" "}
                              {new Date(task.deadline).toLocaleDateString()}
                            </span>
                          )}
                          {task.priority && (
                            <span
                              className={
                                task.priority === "high"
                                  ? "text-red-400"
                                  : task.priority === "medium"
                                  ? "text-yellow-400"
                                  : "text-slate-400"
                              }
                            >
                              {task.priority.toUpperCase()}
                            </span>
                          )}
                        </div>
                      </div>
                      {task.completed && (
                        <span className="text-green-400">✓</span>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {filteredPeople.map((person) => (
        <button
          key={person.name}
          onClick={() => setSelectedPerson(person)}
          className="bg-white/5 rounded-2xl p-6 border border-white/10 hover:border-white/20 hover:bg-white/10 transition-all text-left"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold">{person.name}</h3>
            {person.overdueTasks > 0 && (
              <span className="bg-red-500/20 text-red-400 px-3 py-1 rounded-full text-xs font-semibold">
                {person.overdueTasks} overdue
              </span>
            )}
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Total tasks:</span>
              <span className="font-semibold">{person.taskCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Open:</span>
              <span className="font-semibold text-blue-400">
                {person.openTasks}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Completed:</span>
              <span className="font-semibold text-green-400">
                {person.taskCount - person.openTasks}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Meetings:</span>
              <span className="font-semibold">{person.meetingCount}</span>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
