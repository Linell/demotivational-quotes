import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { serve } from "inngest/edge";
import { functions, inngest, rememberBindings } from "#/inngest";

const handler = serve({
	client: inngest,
	functions,
});

const withBindings = (request: Request) => {
	rememberBindings();
	return handler(request);
};

export const Route = createFileRoute("/api/inngest")({
	server: {
		handlers: {
			GET: ({ request }) => withBindings(request),
			POST: ({ request }) => withBindings(request),
			PUT: ({ request }) => withBindings(request),
		},
	},
});
