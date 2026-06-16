import { env } from "cloudflare:workers";
import type { Variant } from "./variants";

export interface StoredQuote {
	text: string;
	model: string;
	variant: Variant;
	createdAt: string;
	up: number;
	down: number;
}

export type QuoteWithId = StoredQuote & { id: string };

const KEY_PREFIX = "quote:";
const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days — long enough to be an archive.

const key = (quoteId: string): string => `${KEY_PREFIX}${quoteId}`;

let cachedQuotes: typeof env.QUOTES | undefined;

/**
 * Capture the `QUOTES` binding while a request context is active. Call this from
 * route handlers (notably /api/inngest) before any Inngest step runs.
 */
export function rememberBindings(): void {
	if (!cachedQuotes && env.QUOTES) {
		cachedQuotes = env.QUOTES;
	}
}

function quotes(): typeof env.QUOTES {
	// Warm from the current context if we can (covers direct request handlers
	// like the poll endpoint)
	rememberBindings();
	if (!cachedQuotes) {
		throw new Error(
			"QUOTES KV binding unavailable — rememberBindings() must run in a request context first",
		);
	}
	return cachedQuotes;
}

export async function putQuote(
	quoteId: string,
	quote: StoredQuote,
): Promise<void> {
	await quotes().put(key(quoteId), JSON.stringify(quote), {
		expirationTtl: TTL_SECONDS,
	});
}

export async function getQuote(quoteId: string): Promise<StoredQuote | null> {
	return quotes().get(key(quoteId), "json");
}

/**
 * Look up a single quote by id WITHOUT risking a cached negative lookup — this
 * is the read the UI's poll loop uses while generation is still in flight.
 *
 * A direct `get()` on a key that doesn't exist yet caches the miss at the edge
 * colo for up to ~60s (Cloudflare caches negative lookups too). The poll fires
 * its first read *before* the async `persist` step runs, so that read returns
 * null, the miss sticks, and every later poll keeps seeing null even after the
 * quote is written — until the cache expires (~60s, right when the client poll
 * times out). Only a manual refresh, which lists, reveals it.
 *
 * We sidestep that exactly like `listQuotes`: list the single-key prefix to
 * learn whether the key exists, and only `get()` once it does. We therefore
 * never issue a negative `get()` on the cold key, so nothing poisons the cache.
 */
export async function findQuote(quoteId: string): Promise<StoredQuote | null> {
	const k = key(quoteId);
	const { keys } = await quotes().list({ prefix: k });
	if (!keys.some((entry) => entry.name === k)) return null;
	return quotes().get(k, "json");
}

/**
 * Record a vote against a stored quote, incrementing its tally. Read-modify-
 * write (KV isn't transactional — fine for a demo). Re-stamps the 30-day TTL so
 * an actively-voted quote doesn't expire. Returns the updated counts, or null
 * if the quote no longer exists.
 */
export async function recordVote(
	quoteId: string,
	up: boolean,
): Promise<{ up: number; down: number } | null> {
	const quote = await getQuote(quoteId);
	if (!quote) return null;
	if (up) quote.up += 1;
	else quote.down += 1;
	await putQuote(quoteId, quote);
	return { up: quote.up, down: quote.down };
}

/**
 * List every stored quote, newest first — the archive's data source. Lists keys
 * by prefix, then fetches each value (N+1, but the demo's quote count is small).
 */
export async function listQuotes(): Promise<QuoteWithId[]> {
	const { keys } = await quotes().list({ prefix: KEY_PREFIX });
	const loaded = await Promise.all(
		keys.map(async ({ name }) => {
			const quote = await quotes().get<StoredQuote>(name, "json");
			if (!quote) return null;
			return { ...quote, id: name.slice(KEY_PREFIX.length) };
		}),
	);
	return loaded
		.filter((q): q is QuoteWithId => q !== null)
		.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
