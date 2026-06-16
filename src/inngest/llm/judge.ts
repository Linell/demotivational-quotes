import { anthropic } from "./clients";

const JUDGE_MODEL = "claude-haiku-4-5-20251001";

const JUDGE_PROMPT = [
	"You rate demotivational quotes for the crowd at an AI conference on how well they nail the target voice: dark, deadpan, morose, quietly devastating, AI- and tech-literate, and funny in a bleak way.",
	"Reward genuine darkness, a sharp setup-to-landing turn, one concrete specific detail, and texture the whole room recognizes (AI-era). Penalize trite observations, off topic quotes, and things that aren't funny.",
	"Respond with ONLY a single number between 0 and 1 (e.g. 0.0, 0.7, 1.0). No words, no explanation.",
].join("\n");

/**
 * Rate a quote 0–1 on dark-funny / on-voice. One short, cheap LLM call. Never
 * throws on a model hiccup — a malformed/empty response clamps to 0 so a bad
 * judge call can't fail the generation step it's scoring.
 */
export async function judgeQuote(text: string): Promise<number> {
	const message = await anthropic.messages.create({
		model: JUDGE_MODEL,
		max_tokens: 8,
		temperature: 0,
		system: JUDGE_PROMPT,
		messages: [{ role: "user", content: text }],
	});

	const block = message.content.find((b) => b.type === "text");
	const raw = block && block.type === "text" ? block.text : "";
	const value = Number.parseFloat(raw.trim());

	if (!Number.isFinite(value)) return 0;

	return Math.min(1, Math.max(0, value));
}
