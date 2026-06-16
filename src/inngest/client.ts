import { Inngest } from "inngest";
import { scoreMiddleware } from "inngest/experimental";

export const inngest = new Inngest({
	id: "demotivational-quotes",
	middleware: [scoreMiddleware()],
});
