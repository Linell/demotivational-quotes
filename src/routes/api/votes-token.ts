import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { getSubscriptionToken } from "inngest/realtime";
import { inngest } from "#/inngest";
import { voteChannel } from "#/inngest/channels";

// GET /api/votes-token → a subscription token for the feed-wide vote channel.
// The channel is public (votes are public data), so no per-user scoping.
export const Route = createFileRoute("/api/votes-token")({
	server: {
		handlers: {
			GET: async () => {
				const token = await getSubscriptionToken(inngest, {
					channel: voteChannel,
					topics: ["cast"],
				});
				return Response.json({
					key: token.key,
					apiBaseUrl: token.apiBaseUrl,
				});
			},
		},
	},
});
