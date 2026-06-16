import { useEffect, useRef, useState } from "react";
import { useCountUp } from "#/hooks/use-count-up";
import { VARIANT_META, type Variant } from "#/inngest/variants";

// Shared quote-card pieces used by both the home feed (`/`) and the single
// quote permalink (`/q/$id`). Kept dependency-free of route state so either
// page can drop them in.

export function ModelBadge({
	variant,
	model,
}: {
	variant: Variant;
	model: string;
}) {
	const isClaude = variant === "claude";
	return (
		<span
			className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs font-semibold ${
				isClaude
					? "bg-[#d97757]/15 text-[#b3492a]"
					: "bg-[#10a37f]/15 text-[#0d8467]"
			}`}
		>
			<span
				className={`h-2 w-2 rounded-full ${isClaude ? "bg-[#d97757]" : "bg-[#10a37f]"}`}
			/>
			{VARIANT_META[variant].label}
			<span className="font-normal opacity-60">{model}</span>
		</span>
	);
}

export function TallyButton({
	tone,
	count,
	active,
	disabled,
	onClick,
	icon,
}: {
	tone: "up" | "down";
	count: number;
	active: boolean;
	disabled: boolean;
	onClick: () => void;
	icon: React.ReactNode;
}) {
	const display = useCountUp(count);
	// Replay the bump keyframe whenever the count climbs — covers both this
	// user's vote and votes that arrive from others over realtime. Bumping a
	// `key` remounts the number span so the animation restarts every time.
	const prev = useRef(count);
	const [bumpKey, setBumpKey] = useState(0);
	useEffect(() => {
		if (count > prev.current) setBumpKey((k) => k + 1);
		prev.current = count;
	}, [count]);

	const activeClasses =
		tone === "up"
			? "border-green-500 bg-green-50 text-green-700"
			: "border-red-500 bg-red-50 text-red-700";
	const bumpClass = tone === "up" ? "tally-bump-up" : "tally-bump-down";
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className={`tally-btn flex items-center gap-1 border px-2.5 py-1 text-sm tabular-nums disabled:cursor-not-allowed ${
				active
					? activeClasses
					: "border-neutral-300 text-neutral-600 enabled:hover:border-neutral-400 disabled:opacity-60"
			}`}
		>
			{icon}
			<span
				key={bumpKey}
				className={`inline-block ${bumpKey ? bumpClass : ""}`}
			>
				{display}
			</span>
		</button>
	);
}
