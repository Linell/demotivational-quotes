import { experiment } from "inngest";
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
	{ id: "generate-quote", triggers: [{ event: EVENTS.quoteRequested }] },
	async ({ event, step, group, defer, runId }) => {
		const { quoteId, topic } = event.data as {
			quoteId: string;
			topic?: string;
		};

		// Judge the freshly generated quote and write its `quality-<variant>` score.
		const scoreQuality = async (variant: Variant, quoteText: string) => {
			const quality = await step.run(`judge-${variant}`, () =>
				judgeQuote(quoteText),
			);
			await step.run(`score-quality-${variant}`, () =>
				inngest.score({
					runId,
					stepId: variantStepId(variant),
					name: scoreName("quality", variant),
					value: quality,
				}),
			);
		};

		const { result: quoteText, variant } = await group.experiment(
			"quote-model",
			{
				variants: {
					claude: async () =>
						step.run(variantStepId("claude"), () => generateWithClaude(topic)),
					openai: async () =>
						step.run(variantStepId("openai"), () => generateWithOpenAI(topic)),
				},
				select: experiment.weighted({ claude: 50, openai: 50 }),
				withVariant: true,
			},
		);

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
			};
			await putQuote(quoteId, quote);
			return quote;
		});

		// Publish before the judge step so the browser isn't waiting on its
		// latency; KV stays the source of truth.
		await step.realtime.publish(
			"publish-ready",
			quoteChannel({ quoteId }).ready,
			{
				id: quoteId,
				...stored,
			},
		);

		// This quality score is used to be able to immediatley evaluate the percieved quality
		// of the generated quote.
		await scoreQuality(v, quoteText);

		// This is where things get more fun, though! Whether or not another LLM thinks the joke
		// is funny doens't matter nearly as much as the actual engagement that we're getting on
		// the generated content. The function running below is super simple: it's just waiting
		// for a time period (like five minutes) after generation to see if a user has actually
		// voted on that quote. If not, we can safely assume that it wasn't funny enough.
		await step.run("schedule-reaction-scorer", () => {
			defer("score-reaction", {
				function: reactionScorer,
				data: { quoteId, variant: variant as Variant },
			});
		});

		return { quoteId, variant, model };
	},
);
