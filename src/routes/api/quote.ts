import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { getSubscriptionToken } from "inngest/realtime";
import { EVENTS, inngest } from "#/inngest";
import { quoteChannel } from "#/inngest/channels";

// POST /api/quote → kick off generation. Returns the id plus a realtime
// subscription token so the UI can stream the result the instant it's ready,
// instead of polling KV (which lags across colos).
export const Route = createFileRoute("/api/quote")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const body = (await request.json().catch(() => ({}))) as {
					topic?: string;
				};
				const quoteId = crypto.randomUUID();
				// Mint the token in parallel with the send to keep its latency off
				// the response's critical path.
				const [, token] = await Promise.all([
					inngest.send({
						name: EVENTS.quoteRequested,
						data: { quoteId, topic: body.topic },
					}),
					getSubscriptionToken(inngest, {
						channel: quoteChannel({ quoteId }),
						topics: ["ready"],
					}),
				]);
				// Return only the auth bits. The client rebuilds the channel (with its
				// schema, for typed + validated messages) and pairs it with this key.
				return Response.json({
					quoteId,
					token: { key: token.key, apiBaseUrl: token.apiBaseUrl },
				});
			},
		},
	},
});
