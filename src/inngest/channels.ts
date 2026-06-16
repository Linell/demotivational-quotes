import { channel, type Realtime } from "inngest/realtime";
import { z } from "zod";
import { VARIANTS } from "./variants";

// Both channels are imported on the client too (to give `subscribe` the live
// zod schema for typed + validated messages). That's safe: this module pulls
// only `inngest/realtime`, zod, and variant constants — no KV/LLM/`cloudflare`
// code rides along into the browser bundle.

// Per-generation channel, scoped by `quoteId` so the browser can subscribe the
// instant it kicks off generation — no run id round-trip.
export const quoteChannel = channel({
	name: ({ quoteId }: { quoteId: string }) => `quote:${quoteId}`,
	topics: {
		ready: {
			schema: z.object({
				id: z.string(),
				text: z.string(),
				model: z.string(),
				variant: z.enum(VARIANTS),
				createdAt: z.string(),
				up: z.number(),
				down: z.number(),
			}),
		},
	},
});

// One feed-wide channel for vote tallies: a single subscription per page routes
// updates by `quoteId`, rather than one connection per visible quote. Carries
// absolute counts (not deltas) so applying a message is idempotent against the
// voter's optimistic bump.
export const voteChannel = channel({
	name: "votes",
	topics: {
		cast: {
			schema: z.object({
				quoteId: z.string(),
				up: z.number(),
				down: z.number(),
			}),
		},
	},
});

// Message + payload types live next to their channels so consumers import one
// source of truth rather than re-deriving `Realtime.Message<...>` per file.
export type QuoteMessage = Realtime.Message<
	string,
	(typeof quoteChannel)["topics"]
>;
export type VoteMessage = Realtime.Message<
	string,
	(typeof voteChannel)["topics"]
>;
export type VoteCast = (typeof voteChannel)["$infer"]["cast"];
