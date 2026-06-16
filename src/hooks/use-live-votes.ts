import { type Realtime, subscribe } from "inngest/realtime";
import { useEffect } from "react";
import {
	type VoteCast,
	type VoteMessage,
	voteChannel,
} from "#/inngest/channels";

/**
 * Subscribe to the feed-wide vote channel for the component's lifetime and
 * invoke `onCast` with the authoritative counts for each vote that lands.
 *
 * `onCast` is a dependency, so memoize it (`useCallback`) — an unstable
 * reference re-opens the WebSocket on every render.
 */
export function useLiveVotes(onCast: (vote: VoteCast) => void): void {
	useEffect(() => {
		let sub: { unsubscribe: (reason?: string) => void } | null = null;
		let cancelled = false;
		(async () => {
			try {
				const res = await fetch("/api/votes-token");
				if (!res.ok) return;
				const token = (await res.json()) as Realtime.Subscribe.ClientToken;
				if (cancelled) return;
				sub = await subscribe({
					channel: voteChannel,
					topics: ["cast"],
					key: token.key,
					apiBaseUrl: token.apiBaseUrl,
					onMessage: (message: VoteMessage) => {
						// Only the single `cast` topic exists, so `kind` is the one guard
						// needed to drop run-lifecycle/datastream frames.
						if (message.kind !== "data") return;
						onCast(message.data);
					},
					onError: () => {},
				});
				if (cancelled) sub.unsubscribe();
			} catch {
				// Live counts are a nice-to-have; a reload reconciles from KV.
			}
		})();
		return () => {
			cancelled = true;
			sub?.unsubscribe();
		};
	}, [onCast]);
}
