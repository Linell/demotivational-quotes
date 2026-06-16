// Scoring configuration: how score series are named, and how long the apathy
// scorer waits before recording a verdict.

import type { Variant } from "./variants";

/**
 * Build a score name that encodes the model into the name.
 */
export function scoreName(metric: string, variant: Variant): string {
	return `${metric}-${variant}`;
}

/**
 * How long the apathy scorer waits for a vote before scoring `reacted`.
 */
export const VOTE_WINDOW = "5m" as const;
