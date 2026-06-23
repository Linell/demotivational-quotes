import { experiment } from "inngest";
import type { ExperimentRef } from "inngest/experimental";
import { quoteChannel } from "../channels";
import { inngest } from "../client";
import { EVENTS } from "../events";
import { generateWithClaude, generateWithOpenAI, judgeQuote } from "../llm";
import { scoreName } from "../scoring";
import { putQuote } from "../storage";
import { VARIANT_META, type Variant, variantStepId } from "../variants";
import { reactionScorer } from "./reaction-scorer";

/**
 * Generates a demotivational quote, choosing Claude vs GPT via a durable,
 * memoized experiment, persists it to KV as early as possible, then runs
 * telemetry (the quality judge) and schedules the deferred reaction scorer.
 */
export const generateQuote = inngest.createFunction(
	{
		id: "generate-quote",
		triggers: [{ event: EVENTS.quoteRequested }, { cron: "*/30 * * * *" }],
	},
	async ({ event, step, group, defer, runId }) => {
		const data = event.data as {
			quoteId?: string;
			topic?: string;
		};
		// Cron-triggered runs arrive with no event data, so mint an id here the
		// same way the HTTP path does. Without this, `quoteId` is undefined and
		// the quote gets persisted under a broken KV key.
		const quoteId = data.quoteId ?? crypto.randomUUID();
		const topic = data.topic;
		// Only the HTTP path has a live browser subscribed to this quote's
		// channel; cron runs have no listener, so skip the realtime publish.
		const hasSubscriber = data.quoteId != null;

		// Judge the freshly generated quote and write its `quality-<variant>` score.
		// The score is attached to the experiment variant via the `experimentRef`
		// handle so the cloud co-locates it with the variant on the experiment
		// detail, rather than relying on the variant's step id.
		const scoreQuality = async (
			variant: Variant,
			quoteText: string,
			experimentRef: ExperimentRef,
		) => {
			const quality = await step.run(`judge-${variant}`, () =>
				judgeQuote(quoteText),
			);
			await step.run(`score-quality-${variant}`, () =>
				inngest.score.experiment({
					runId,
					name: scoreName("quality", variant),
					value: quality,
					experiment: experimentRef,
				}),
			);
		};

		const {
			result: quoteText,
			variant,
			experimentRef,
		} = await group.experiment("quote-model", {
			variants: {
				claude: async () =>
					step.run(variantStepId("claude"), () => generateWithClaude(topic)),
				openai: async () =>
					step.run(variantStepId("openai"), () => generateWithOpenAI(topic)),
			},
			select: experiment.weighted({ claude: 50, openai: 50 }),
		});

		const v = variant as Variant;
		const model = VARIANT_META[v].model;

		// Return the stored record so the publish below reuses the same payload
		// (incl. the memoized `createdAt`) the archive holds.
		const stored = await step.run("persist", async () => {
			const quote = {
				text: quoteText,
				model,
				variant: v,
				createdAt: new Date().toISOString(),
				up: 0,
				down: 0,
				runId,
			};
			await putQuote(quoteId, quote);
			return quote;
		});

		// Publish before the judge step so the browser isn't waiting on its
		// latency; KV stays the source of truth.
		if (hasSubscriber) {
			await step.realtime.publish(
				"publish-ready",
				quoteChannel({ quoteId }).ready,
				{
					id: quoteId,
					...stored,
				},
			);
		}

		await scoreQuality(v, quoteText, experimentRef);

		// The deferred reaction scorer waits a window after generation to see
		// whether a user actually voted — real engagement matters more than the
		// judge's opinion. Pass the experiment handle so its `reacted` score
		// links back to this run's experiment variant directly.
		await step.run("schedule-reaction-scorer", () => {
			defer("score-reaction", {
				function: reactionScorer,
				data: { quoteId, variant: v },
				experiment: experimentRef,
			});
		});

		return { quoteId, variant, model };
	},
);
