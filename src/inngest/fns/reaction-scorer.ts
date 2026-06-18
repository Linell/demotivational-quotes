import { createScorer } from "inngest/experimental";
import { z } from "zod";
import { inngest } from "../client";
import { EVENTS } from "../events";
import { scoreName, VOTE_WINDOW } from "../scoring";
import { getQuote } from "../storage";
import { VARIANTS, variantStepId } from "../variants";

const hasReacted = (quote: Awaited<ReturnType<typeof getQuote>>) =>
	!!quote && quote.up + quote.down > 0;

export const reactionScorer = createScorer(
	inngest,
	{
		id: "reaction-scorer",
		schema: z.object({
			quoteId: z.string(),
			variant: z.enum(VARIANTS),
		}),
	},
	async ({ event, step, parents }) => {
		const { quoteId, variant } = event.data;

		// A deferred run doesn't enqueue until the parent generation finalizes, so
		// a vote can land before we start listening. The durable KV tally
		// survives that gap — check it first and short-circuit if someone already
		// reacted.
		let reacted = hasReacted(
			await step.run("read-tally", () => getQuote(quoteId)),
		);

		if (!reacted) {
			const vote = await step.waitForEvent("await-vote", {
				event: EVENTS.quoteVoted,
				timeout: VOTE_WINDOW,
				match: "data.quoteId",
			});

			// On a vote we're done. On timeout, re-read the tally to close the
			// sliver of a gap between the read above and the wait registering.
			reacted = vote
				? true
				: hasReacted(
						await step.run("read-tally-final", () => getQuote(quoteId)),
					);
		}

		return {
			runId: parents[0].runId,
			name: scoreName("reacted", variant),
			value: reacted,
		};
	},
);
