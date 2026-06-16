import { generateQuote } from "./generate-quote";
import { reactionScorer } from "./reaction-scorer";
import { sentimentScorer } from "./sentiment-scorer";

export const functions = [generateQuote, sentimentScorer, reactionScorer];
