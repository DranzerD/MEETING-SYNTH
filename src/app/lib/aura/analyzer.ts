import { cleanText, splitSentences, countWords } from "./preprocessing";
import { extractTasks } from "./taskExtraction";
import { extractDecisions } from "./decisionExtraction";
import { analyzeSentiment } from "./sentiment";
import { buildSummary } from "./summarizer";
import { tasksToCsv, decisionsToCsv } from "./csv";
import { AuraAnalysis } from "./types";

export function analyzeTranscript(transcript: string): AuraAnalysis {
  const cleanedTranscript = cleanText(transcript || "");
  const sentences = splitSentences(cleanedTranscript);
  const tasks = extractTasks(sentences);
  const decisions = extractDecisions(sentences);
  const summary = buildSummary(sentences);
  const sentiment = analyzeSentiment(cleanedTranscript);
  const generatedAt = new Date().toISOString();

  const stats = {
    wordCount: countWords(cleanedTranscript),
    sentenceCount: sentences.length,
    taskCount: tasks.length,
    decisionCount: decisions.length,
    generatedAt,
  };

  const safeTimestamp = generatedAt.replace(/[:.]/g, "-");

  return {
    stats,
    summary,
    tasks,
    decisions,
    sentiment,
    cleanedTranscript,
    sentences,
    exports: {
      jsonFilename: `aura_output_${safeTimestamp}.json`,
      tasksCsv: tasksToCsv(tasks),
      decisionsCsv: decisionsToCsv(decisions),
    },
  };
}
