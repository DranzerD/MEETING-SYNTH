export type Priority = "high" | "medium" | "low";
export type SentimentLabel = "positive" | "negative" | "neutral";
export type DecisionType = "timeline" | "budget" | "technical" | "general";

export interface TaskInsight {
  sentence: string;
  task: string;
  assignee: string;
  priority: Priority;
  deadline?: string;
  confidence: number;
  keywords: string[];
}

export interface DecisionInsight {
  sentence: string;
  decision: string;
  type: DecisionType;
  impact: Priority;
  participants: string[];
  keywords: string[];
}

export interface SentimentInsight {
  label: SentimentLabel;
  confidence: number;
  emotion: string;
  positiveScore: number;
  negativeScore: number;
}

export interface SummaryInsight {
  sentences: string[];
  summaryText: string;
}

export interface ThreadEntry {
  meeting_id: string;
  timestamp: string;
  summary: string;
  sentiment: string;
  tasks_open: number;
  decisions_made: number;
}

export interface ThreadInsight {
  key: string;
  history: ThreadEntry[];
}

export interface AuraAnalysis {
  stats: {
    wordCount: number;
    sentenceCount: number;
    taskCount: number;
    decisionCount: number;
    generatedAt: string;
  };
  summary: SummaryInsight;
  tasks: TaskInsight[];
  decisions: DecisionInsight[];
  sentiment: SentimentInsight;
  cleanedTranscript: string;
  sentences: string[];
  thread?: ThreadInsight | null;
  exports: {
    jsonFilename: string;
    tasksCsv: string;
    decisionsCsv: string;
  };
}
