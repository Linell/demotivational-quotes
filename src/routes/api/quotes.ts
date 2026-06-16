import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { listQuotes } from "#/inngest";

export const Route = createFileRoute("/api/quotes")({
	server: {
		handlers: {
			GET: async () => {
				return Response.json(await listQuotes());
			},
		},
	},
});
