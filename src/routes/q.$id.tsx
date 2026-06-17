import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";
import { ArrowLeft, Check, ChevronDown, ChevronUp, Link2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ModelBadge, TallyButton } from "#/components/quote";
import { SiteHeader } from "#/components/site-header";
import { useLiveVotes } from "#/hooks/use-live-votes";
import type { QuoteWithId } from "#/inngest";
import type { VoteCast } from "#/inngest/channels";
import { VARIANT_META } from "#/inngest/variants";

type QuotePageData = QuoteWithId & { ogImage: string };

const getQuote = createServerFn({ method: "GET" })
	.validator((id: string) => id)
	.handler(async ({ data: id }): Promise<QuotePageData> => {
		const { findQuote } = await import("#/inngest");
		const quote = await findQuote(id);
		if (!quote) throw notFound();
		// Social scrapers require an absolute og:image URL.
		const ogImage = `${getRequestUrl().origin}/api/og/${id}`;
		return { ...quote, id, ogImage };
	});

export const Route = createFileRoute("/q/$id")({
	component: QuotePage,
	loader: ({ params }) => getQuote({ data: params.id }),
	notFoundComponent: NotFound,
	head: ({ loaderData }) => {
		if (!loaderData) return {};
		const q = loaderData;
		const title = `“${q.text}”`;
		const description = `A demotivational thought by ${VARIANT_META[q.variant].label} (${q.model}) — ${q.up} up, ${q.down} down.`;
		return {
			meta: [
				{ title: `${title} — Demotivational Thoughts` },
				{ name: "description", content: description },
				{ property: "og:type", content: "article" },
				{ property: "og:title", content: title },
				{ property: "og:description", content: description },
				{ property: "og:image", content: q.ogImage },
				{ property: "og:image:width", content: "1200" },
				{ property: "og:image:height", content: "630" },
				{ property: "og:image:alt", content: title },
				{ name: "twitter:card", content: "summary_large_image" },
				{ name: "twitter:title", content: title },
				{ name: "twitter:description", content: description },
				{ name: "twitter:image", content: q.ogImage },
			],
		};
	},
});

function QuotePage() {
	const initial = Route.useLoaderData();
	const [quote, setQuote] = useState<QuoteWithId>(initial);
	const [voted, setVoted] = useState<"up" | "down" | null>(null);
	const [copied, setCopied] = useState(false);

	// Keep local state in sync if the loader re-runs for a different id.
	useEffect(() => {
		setQuote(initial);
		setVoted(null);
	}, [initial]);

	// Live vote tallies: patch this quote whenever a vote lands for its id.
	const applyVote = useCallback(
		(vote: VoteCast) => {
			if (vote.quoteId !== quote.id) return;
			setQuote((q) => ({ ...q, up: vote.up, down: vote.down }));
		},
		[quote.id],
	);
	useLiveVotes(applyVote);

	const castVote = useCallback(
		async (up: boolean) => {
			if (voted) return;
			setVoted(up ? "up" : "down");
			setQuote((q) => ({
				...q,
				up: q.up + (up ? 1 : 0),
				down: q.down + (up ? 0 : 1),
			}));
			try {
				const res = await fetch("/api/vote", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ quoteId: quote.id, up }),
				});
				const { counts } = (await res.json()) as {
					counts?: { up: number; down: number };
				};
				if (counts) setQuote((q) => ({ ...q, ...counts }));
			} catch {
				// Leave the optimistic count; a reload reconciles from KV.
			}
		},
		[voted, quote.id],
	);

	const share = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(window.location.href);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			// clipboard blocked — nothing graceful left to do.
		}
	}, []);

	return (
		<Shell>
			<ModelBadge variant={quote.variant} model={quote.model} />
			<blockquote className="mt-10 max-w-5xl text-balance text-4xl font-semibold leading-tight tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
				“{quote.text}”
			</blockquote>
			<div className="mt-12 flex items-center justify-center gap-3">
				<TallyButton
					tone="up"
					count={quote.up}
					active={voted === "up"}
					disabled={!!voted}
					onClick={() => castVote(true)}
					icon={<ChevronUp className="h-4 w-4" />}
				/>
				<TallyButton
					tone="down"
					count={quote.down}
					active={voted === "down"}
					disabled={!!voted}
					onClick={() => castVote(false)}
					icon={<ChevronDown className="h-4 w-4" />}
				/>
				<button
					type="button"
					onClick={share}
					className="flex items-center gap-1.5 border border-neutral-300 px-2.5 py-1 text-sm text-neutral-600 transition hover:border-[#ff6600] hover:text-[#ff6600]"
				>
					{copied ? (
						<Check className="h-4 w-4 text-green-600" />
					) : (
						<Link2 className="h-4 w-4" />
					)}
					{copied ? "Copied" : "Copy link"}
				</button>
			</div>
			<time
				className="mt-6 block text-xs text-neutral-400"
				dateTime={quote.createdAt}
			>
				{new Date(quote.createdAt).toLocaleString()}
			</time>
		</Shell>
	);
}

function NotFound() {
	return (
		<Shell>
			<p className="max-w-xl text-2xl font-medium text-neutral-500">
				This quote doesn't exist — or it expired and drifted into the void.
			</p>
			<Link
				to="/"
				className="mt-6 inline-block text-sm font-semibold text-[#ff6600] hover:underline"
			>
				Generate a fresh one →
			</Link>
		</Shell>
	);
}

function Shell({ children }: { children: React.ReactNode }) {
	return (
		<div className="flex min-h-screen flex-col bg-[#f6f6ef] text-[#1a1a1a]">
			<SiteHeader
				maxWidthClass="max-w-5xl"
				right={
					<Link
						to="/"
						className="ml-auto flex items-center gap-1 text-xs text-white/90 transition hover:text-white"
					>
						<ArrowLeft className="h-3.5 w-3.5" />
						Back to the feed
					</Link>
				}
			/>
			<main className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
				{children}
			</main>
		</div>
	);
}
