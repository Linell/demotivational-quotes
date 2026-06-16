import { createFileRoute, Link } from "@tanstack/react-router";
import { type Realtime, subscribe } from "inngest/realtime";
import {
	ChevronDown,
	ChevronUp,
	Link2,
	Loader2,
	RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ModelBadge, TallyButton } from "#/components/quote";
import { SiteHeader } from "#/components/site-header";
import { useLiveVotes } from "#/hooks/use-live-votes";
// Runtime values come from the dependency-free module directly: the `#/inngest`
// barrel re-exports server-only code (KV, LLM SDKs, `cloudflare:workers`) that
// must never enter the client bundle. Types are erased at build, so the
// `QuoteWithId` type-only import through the barrel is safe.
import type { QuoteWithId } from "#/inngest";
// The channel module is client-safe — it pulls only `inngest/realtime`, zod,
// and the variant constants, no KV/LLM/`cloudflare:workers` code. Importing the
// real channel instance is what lets `subscribe` type and validate messages.
import {
	type QuoteMessage,
	quoteChannel,
	type VoteCast,
} from "#/inngest/channels";

export const Route = createFileRoute("/")({ component: Home });

// Realtime delivers the quote the instant the function publishes it; this is
// only a safety net for a dropped connection — fall back to one list refetch.
const GENERATION_TIMEOUT_MS = 60_000;
// How many quotes to reveal per infinite-scroll page. The list loads in full
// (demo scale), so this is client-side reveal — no server cursor needed.
const PAGE_SIZE = 10;

// Just the auth bits the server mints; the client supplies channel + topics.
type SubscriptionToken = Realtime.Subscribe.ClientToken;

const LOADING_LINES = [
	"Composing something bleak…",
	"Distilling your ambition into regret…",
	"Lowering your expectations…",
	"Consulting the void…",
	"Manufacturing disappointment…",
	"Workshopping your inevitable failure…",
	"Searching for meaning, finding none…",
	"Calibrating the despair…",
	"Pretending any of this matters…",
	"Polishing a profound shrug…",
];

const randomLoadingLine = () =>
	LOADING_LINES[Math.floor(Math.random() * LOADING_LINES.length)];

function Home() {
	const [topic, setTopic] = useState("");
	const [generating, setGenerating] = useState(false);
	const [loadingLine, setLoadingLine] = useState(LOADING_LINES[0]);
	const [error, setError] = useState<string | null>(null);
	const [quotes, setQuotes] = useState<QuoteWithId[] | null>(null);
	// Quote ids voted on this session — one vote per quote, reset on reload.
	const [voted, setVoted] = useState<Record<string, "up" | "down">>({});
	const [visible, setVisible] = useState(PAGE_SIZE);
	const [newId, setNewId] = useState<string | null>(null);
	const subRef = useRef<{ unsubscribe: (reason?: string) => void } | null>(
		null,
	);
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const sentinelRef = useRef<HTMLDivElement | null>(null);

	const stopListening = useCallback(() => {
		subRef.current?.unsubscribe();
		subRef.current = null;
		if (timeoutRef.current) {
			clearTimeout(timeoutRef.current);
			timeoutRef.current = null;
		}
	}, []);

	useEffect(() => stopListening, [stopListening]);

	const loadQuotes = useCallback(async () => {
		try {
			const res = await fetch("/api/quotes");
			if (!res.ok) throw new Error(`list failed: ${res.status}`);
			setQuotes((await res.json()) as QuoteWithId[]);
		} catch {
			// Keep whatever we had; surface the error only if we have nothing.
			setQuotes((q) => q ?? []);
			setError((e) => e ?? "Couldn't load the quotes.");
		}
	}, []);

	useEffect(() => {
		loadQuotes();
	}, [loadQuotes]);

	// One feed-wide subscription patches the matching quote's tally in place as
	// votes (anyone's) land. Stable callback → the hook subscribes once.
	const applyVote = useCallback((vote: VoteCast) => {
		setQuotes(
			(qs) =>
				qs?.map((q) =>
					q.id === vote.quoteId ? { ...q, up: vote.up, down: vote.down } : q,
				) ?? qs,
		);
	}, []);
	useLiveVotes(applyVote);

	// Infinite scroll: reveal another page when the sentinel scrolls into view.
	// `quotes` isn't read here — it's an intentional re-arm trigger: when the list
	// changes the sentinel may (re)mount, so we rebuild the observer to watch it.
	// biome-ignore lint/correctness/useExhaustiveDependencies: quotes re-arms the observer, it isn't read
	useEffect(() => {
		const el = sentinelRef.current;
		if (!el) return;
		const obs = new IntersectionObserver((entries) => {
			if (entries[0]?.isIntersecting) setVisible((v) => v + PAGE_SIZE);
		});
		obs.observe(el);
		return () => obs.disconnect();
	}, [quotes]);

	// Drop the new quote on top, deduping in case a later list refetch races
	// the realtime push.
	const reveal = useCallback((quote: QuoteWithId) => {
		setNewId(quote.id);
		setVisible(PAGE_SIZE);
		setQuotes((qs) => [quote, ...(qs ?? []).filter((q) => q.id !== quote.id)]);
	}, []);

	const generate = useCallback(async () => {
		stopListening();
		setError(null);
		setLoadingLine(randomLoadingLine());
		setGenerating(true);
		const finish = () => {
			stopListening();
			setGenerating(false);
		};
		// Dropped/absent push: tear down and reconcile from the list once.
		const fallback = () => {
			finish();
			loadQuotes();
		};
		try {
			const res = await fetch("/api/quote", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ topic: topic.trim() || undefined }),
			});
			if (!res.ok) throw new Error(`generate failed: ${res.status}`);
			const { quoteId: id, token } = (await res.json()) as {
				quoteId?: string;
				token?: SubscriptionToken;
			};
			if (!id || !token) throw new Error("response missing quoteId or token");

			// Rebuilding the channel here (rather than trusting the JSON-serialized
			// token) gives the SDK the live zod schema — so messages are validated
			// and `message.data` is typed per topic.
			subRef.current = await subscribe({
				channel: quoteChannel({ quoteId: id }),
				topics: ["ready"],
				key: token.key,
				apiBaseUrl: token.apiBaseUrl,
				onMessage: (message: QuoteMessage) => {
					if (message.kind !== "data" || message.topic !== "ready") return;
					const quote = message.data;
					if (quote.id !== id) return;
					reveal(quote);
					finish();
				},
				onError: fallback,
			});

			timeoutRef.current = setTimeout(fallback, GENERATION_TIMEOUT_MS);
		} catch {
			finish();
			setError("Couldn't reach the server. Is the dev server running?");
		}
	}, [topic, stopListening, loadQuotes, reveal]);

	const castVote = useCallback(
		async (id: string, up: boolean) => {
			if (voted[id]) return;
			setVoted((v) => ({ ...v, [id]: up ? "up" : "down" }));
			// Optimistic bump; reconcile with the server's authoritative counts.
			setQuotes(
				(qs) =>
					qs?.map((q) =>
						q.id === id
							? { ...q, up: q.up + (up ? 1 : 0), down: q.down + (up ? 0 : 1) }
							: q,
					) ?? qs,
			);
			try {
				const res = await fetch("/api/vote", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ quoteId: id, up }),
				});
				const { counts } = (await res.json()) as {
					counts?: { up: number; down: number };
				};
				if (counts) {
					setQuotes(
						(qs) =>
							qs?.map((q) => (q.id === id ? { ...q, ...counts } : q)) ?? qs,
					);
				}
			} catch {
				// Leave the optimistic count; a reload reconciles from KV.
			}
		},
		[voted],
	);

	const shown = quotes?.slice(0, visible) ?? [];

	return (
		<div className="min-h-screen bg-[#f6f6ef] text-[#1a1a1a]">
			<SiteHeader
				right={
					<span className="ml-auto text-xs text-white/80">
						powered by
						<a
							className="ml-1 font-bold"
							href="https://inngest.com"
							target="_blank"
							rel="noreferrer"
						>
							Inngest
						</a>
					</span>
				}
			/>

			<main className="mx-auto max-w-2xl px-4 py-10">
				<p className="mb-6 text-sm text-neutral-600">
					Demotivational quotes for builders and founders, written by Claude or
					GPT — whichever the coin lands on. The startup will fail. The quote
					will be profound about it. Vote, or don't. Silence is also a verdict.
				</p>

				<div className="mb-8 flex gap-2">
					<input
						value={topic}
						onChange={(e) => setTopic(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && !generating) generate();
						}}
						placeholder="optional topic — e.g. side projects, Series A, 10x engineers"
						className="flex-1 border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#ff6600]"
					/>
					<button
						type="button"
						onClick={generate}
						disabled={generating}
						className="flex items-center gap-2 bg-[#ff6600] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#e65c00] disabled:opacity-60"
					>
						{generating ? (
							<Loader2 className="h-4 w-4 animate-spin" />
						) : (
							<RefreshCw className="h-4 w-4" />
						)}
						{generating ? "Thinking…" : "Generate"}
					</button>
				</div>

				{error && (
					<p className="mb-6 border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
						{error}
					</p>
				)}

				{generating && (
					<div className="mb-3 flex items-center gap-2 border border-neutral-200 bg-white p-4 text-sm text-neutral-400">
						<Loader2 className="h-4 w-4 animate-spin" />
						{loadingLine}
					</div>
				)}

				{!quotes && !error && (
					<div className="flex items-center gap-2 border border-neutral-200 bg-white p-8 text-sm text-neutral-400">
						<Loader2 className="h-4 w-4 animate-spin" />
						Loading the feed…
					</div>
				)}

				{quotes && quotes.length === 0 && !generating && (
					<div className="border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-400">
						Nothing here yet. Generate the first one.
					</div>
				)}

				<ul className="space-y-3">
					{shown.map((q) => (
						<li
							key={q.id}
							className={`relative border bg-white p-5 shadow-sm transition hover:shadow-md ${
								q.id === newId
									? "quote-reveal border-[#ff6600] ring-1 ring-[#ff6600]"
									: "border-neutral-200 hover:border-neutral-300"
							}`}
						>
							{/* Stretched link: the whole card navigates to the permalink.
							    Interactive controls below sit above it (z-10) so they
							    keep working without triggering navigation. */}
							<Link
								to="/q/$id"
								params={{ id: q.id }}
								className="absolute inset-0"
								aria-label="Open this quote"
							/>
							<div className="flex items-center gap-2">
								<ModelBadge variant={q.variant} model={q.model} />
								{q.id === newId && (
									<span className="text-xs font-semibold text-[#ff6600]">
										just now
									</span>
								)}
							</div>
							<blockquote className="mt-3 text-lg font-medium leading-snug">
								“{q.text}”
							</blockquote>
							<div className="mt-4 flex items-center gap-2 border-t border-neutral-100 pt-3">
								<span className="relative z-10 flex items-center gap-2">
									<TallyButton
										tone="up"
										count={q.up}
										active={voted[q.id] === "up"}
										disabled={!!voted[q.id]}
										onClick={() => castVote(q.id, true)}
										icon={<ChevronUp className="h-4 w-4" />}
									/>
									<TallyButton
										tone="down"
										count={q.down}
										active={voted[q.id] === "down"}
										disabled={!!voted[q.id]}
										onClick={() => castVote(q.id, false)}
										icon={<ChevronDown className="h-4 w-4" />}
									/>
								</span>
								<time
									className="ml-auto flex items-center gap-1 text-xs text-neutral-400"
									dateTime={q.createdAt}
								>
									<Link2 className="h-3.5 w-3.5" />
									{new Date(q.createdAt).toLocaleString()}
								</time>
							</div>
						</li>
					))}
				</ul>

				{quotes && visible < quotes.length && (
					<div
						ref={sentinelRef}
						className="py-6 text-center text-xs text-neutral-400"
					>
						Loading more…
					</div>
				)}

				<footer className="mt-12 border-t border-neutral-200 pt-4 text-xs text-neutral-500">
					The payoff is the{" "}
					<a
						href="https://app.inngest.com"
						target="_blank"
						rel="noreferrer"
						className="text-[#ff6600] hover:underline"
					>
						Inngest dashboard
					</a>{" "}
					— watch the experiment variant split and the scores arrive. Don't
					vote, and the scorer records apathy.
				</footer>
			</main>
		</div>
	);
}
