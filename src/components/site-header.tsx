import { Link } from "@tanstack/react-router";

export function SiteHeader({
	maxWidthClass = "max-w-2xl",
	right,
}: {
	maxWidthClass?: string;
	right?: React.ReactNode;
}) {
	return (
		<header className="bg-[#ff6600]">
			<div
				className={`mx-auto flex w-full ${maxWidthClass} items-center gap-2 px-4 py-2`}
			>
				<span className="border border-white/80 px-1.5 py-0.5 text-sm font-bold text-white">
					DT
				</span>
				<Link to="/" className="flex-1">
					<h1 className="text-sm font-bold text-white">
						Demotivational Thoughts
					</h1>
				</Link>
				{right}
			</div>
		</header>
	);
}
