import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { EVENTS, inngest, recordVote } from "#/inngest";
import { voteChannel } from "#/inngest/channels";

// POST /api/vote → persist the tally so the archive can show running up/down
// counts, then emit the vote event that drives the sentiment scorer.
export const Route = createFileRoute("/api/vote")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const { quoteId, up } = (await request.json().catch(() => ({}))) as {
					quoteId?: string;
					up?: boolean;
				};

				if (!quoteId) {
					return Response.json({ error: "quoteId required" }, { status: 400 });
				}

				const counts = await recordVote(quoteId, !!up);
				if (!counts) {
					return Response.json({ error: "quote not found" }, { status: 404 });
				}

				// Broadcast the authoritative tally to everyone viewing the feed, and
				// emit the event that drives the sentiment scorer. Independent, so run
				// both together.
				await Promise.all([
					inngest.realtime.publish(voteChannel.cast, { quoteId, ...counts }),
					inngest.send({
						name: EVENTS.quoteVoted,
						data: { quoteId, up: !!up },
					}),
				]);

				return Response.json({ counts });
			},
		},
	},
});
