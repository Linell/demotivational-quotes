import { CLAUDE_MODEL, OPENAI_MODEL } from "../variants";
import { anthropic, openai } from "./clients";
import { SYSTEM_PROMPT, tidy, userPrompt } from "./prompts";

export async function generateWithClaude(topic?: string): Promise<string> {
	const message = await anthropic.messages.create({
		model: CLAUDE_MODEL,
		max_tokens: 120,
		temperature: 1,
		system: SYSTEM_PROMPT,
		messages: [{ role: "user", content: userPrompt(topic) }],
	});

	const block = message.content.find((b) => b.type === "text");
	const text = tidy(block && block.type === "text" ? block.text : "");

	if (!text) throw new Error("Claude returned an empty quote");

	return text;
}

export async function generateWithOpenAI(topic?: string): Promise<string> {
	const completion = await openai.chat.completions.create({
		model: OPENAI_MODEL,
		max_tokens: 120,
		temperature: 1,
		top_p: 0.95,
		messages: [
			{ role: "system", content: SYSTEM_PROMPT },
			{ role: "user", content: userPrompt(topic) },
		],
	});

	const text = tidy(completion.choices[0]?.message?.content ?? "");

	if (!text) throw new Error("OpenAI returned an empty quote");

	return text;
}
