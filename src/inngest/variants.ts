export const VARIANTS = ["claude", "openai"] as const;
export type Variant = (typeof VARIANTS)[number];

// Flagship-tier models for a fair model-vs-model comparison. Single constant
// each to swap.
export const CLAUDE_MODEL = "claude-opus-4-8";
export const OPENAI_MODEL = "gpt-4o";

/**
 * Single source of truth for per-variant display + model id. Keeping the
 * model string here (not duplicated in an inline ternary) means the value
 * persisted to KV, the badge label, and the API call can't drift apart.
 */
export const VARIANT_META: Record<Variant, { label: string; model: string }> = {
	claude: { label: "Claude", model: CLAUDE_MODEL },
	openai: { label: "GPT", model: OPENAI_MODEL },
};

/**
 * Step id for a variant's generation step. Single source of truth: the
 * experiment defines these step ids and the scorer attaches scores to them, so
 * both sides must agree.
 */
export function variantStepId(variant: Variant): string {
	return `quote-${variant}`;
}
