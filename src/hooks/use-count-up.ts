import { useEffect, useRef, useState } from "react";

/**
 * Tween the displayed number toward `target` with an ease-out, so a tally
 * rolls (4 → 5) instead of snapping. Returns the integer to render.
 *
 * Starts each tween from whatever is currently shown, so rapid changes (your
 * optimistic bump, then the server's authoritative count, then someone else's
 * live vote) chain smoothly. Snaps instantly when the user prefers reduced
 * motion, and on the initial render (SSR-safe: the first value is `target`).
 */
export function useCountUp(target: number, duration = 420): number {
	const [value, setValue] = useState(target);
	const rafRef = useRef<number | null>(null);

	// `value` is read to seed each tween from the current display, but we only
	// want to (re)start a tween when `target` changes — re-running on `value`
	// would restart the animation every frame and never settle.
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional — tween restarts on target only
	useEffect(() => {
		if (value === target) return;

		const reduce = window.matchMedia?.(
			"(prefers-reduced-motion: reduce)",
		).matches;
		if (reduce) {
			setValue(target);
			return;
		}

		const from = value;
		const delta = target - from;
		const start = performance.now();

		const tick = (now: number) => {
			const t = Math.min(1, (now - start) / duration);
			const eased = 1 - (1 - t) ** 3; // easeOutCubic
			setValue(Math.round(from + delta * eased));
			if (t < 1) rafRef.current = requestAnimationFrame(tick);
		};
		rafRef.current = requestAnimationFrame(tick);

		return () => {
			if (rafRef.current) cancelAnimationFrame(rafRef.current);
		};
	}, [target, duration]);

	return value;
}
