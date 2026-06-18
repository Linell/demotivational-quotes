import { inngest } from "../client";
import { EVENTS } from "../events";
import { scoreName } from "../scoring";
import { getQuote } from "../storage";
import { variantStepId } from "../variants";

/**
 * Records a single vote's direction as a sentiment signal. Triggered by every
 * `quote/vote.cast` event, it reads the quote's variant from KV and writes
 * `sentiment-<variant>` (±1).
 */
export const sentimentScorer = inngest.createFunction(
	{ id: "sentiment-scorer", triggers: [{ event: EVENTS.quoteVoted }] },
	async ({ event, step }) => {
		const { quoteId, up: votedUp } = event.data as {
			quoteId: string;
			up: boolean;
		};

		const quote = await step.run("read-variant", () => getQuote(quoteId));

		if (!quote) return { quoteId, skipped: "quote-not-found" };

		await step.run("score-sentiment", () =>
			inngest.score({
				runId: quote.runId,
				name: scoreName("sentiment", quote.variant),
				value: votedUp ? 1 : -1,
			}),
		);

		return { quoteId, variant: quote.variant, up: votedUp };
	},
);
