import { env } from "cloudflare:workers";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

export const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
export const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
