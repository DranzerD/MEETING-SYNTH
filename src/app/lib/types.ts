// Shared shapes for meeting data as persisted by /api/analyze and read
// back by the dashboard, meeting detail, and people views. Centralized
// here instead of each page declaring its own `any`-typed shape, which
// previously let real backend/frontend shape drift go unnoticed.

export type Task = {
  id: string;
  task: string;
  sentence?: string;
  assignee: string;
  priority: "high" | "medium" | "low" | string;
  deadline?: string | null;
  confidence?: number;
  completed: boolean;
};

export type Decision = {
  decision: string;
  sentence?: string;
  type?: string;
  impact?: string;
  participants?: string[];
  confidence?: number;
};

export type Sentiment = {
  label?: string;
  overall?: string;
  confidence?: number;
  emotion?: string;
  positiveScore?: number;
  negativeScore?: number;
  compound?: number;
};

export type Summary = {
  sentences: string[];
  summaryText: string;
};

export type Stats = {
  wordCount: number;
  sentenceCount: number;
  taskCount: number;
  decisionCount: number;
  generatedAt: string;
  extractionSource?: "local_ml" | "llm" | "ts_fallback";
};

export type Meeting = {
  meeting_id: string;
  title: string;
  timestamp: string;
  createdBy?: string;
  transcript: string;
  summary: Summary;
  tasks: Task[];
  decisions: Decision[];
  sentiment: Sentiment;
  stats: Stats;
};

export type IndexStatusValue = "queued" | "indexing" | "completed" | "failed";

export type IndexStatus = {
  meeting_id: string;
  status: IndexStatusValue;
  chunk_count: number;
  started_at?: string | null;
  completed_at?: string | null;
  error?: string | null;
};
