import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import type { Font } from "satori";
import { ImageResponse, loadGoogleFont } from "workers-og";
import { findQuote } from "#/inngest";
import { VARIANT_META, type Variant } from "#/inngest/variants";

// GET /api/og/:id → the 1200×630 PNG used as og:image / twitter:image for the
// /q/:id permalink, rendered to mirror the page.
const WIDTH = 1200;
const HEIGHT = 630;

// Mirror the variant colors from <ModelBadge>.
const BADGE: Record<Variant, { bg: string; fg: string; dot: string }> = {
	claude: { bg: "rgba(217,119,87,0.15)", fg: "#b3492a", dot: "#d97757" },
	openai: { bg: "rgba(16,163,127,0.15)", fg: "#0d8467", dot: "#10a37f" },
};

const escapeHtml = (s: string): string =>
	s.replace(
		/[&<>"']/g,
		(c) =>
			({
				"&": "&amp;",
				"<": "&lt;",
				">": "&gt;",
				'"': "&quot;",
				"'": "&#39;",
			})[c] as string,
	);

function quoteFontSize(length: number): number {
	if (length <= 60) return 66;
	if (length <= 120) return 54;
	if (length <= 200) return 44;
	return 36;
}

// Satori drops raw inline <svg> from an HTML string, but rasterizes an <img>
// pointing at an SVG data URI; encoding the SVG also escapes its quotes.
function chevron(dir: "up" | "down", color: string): string {
	const points = dir === "up" ? "18 15 12 9 6 15" : "6 9 12 15 18 9";
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="${points}"/></svg>`;
	return `<img width="30" height="30" src="data:image/svg+xml;utf8,${encodeURIComponent(svg)}" />`;
}

function markup(quote: {
	text: string;
	model: string;
	variant: Variant;
	up: number;
	down: number;
}): string {
	const badge = BADGE[quote.variant];
	const label = VARIANT_META[quote.variant].label;
	const size = quoteFontSize(quote.text.length);

	return `
<div style="display:flex;flex-direction:column;width:${WIDTH}px;height:${HEIGHT}px;background:#f6f6ef;color:#1a1a1a;font-family:Inter;">
  <div style="display:flex;align-items:center;gap:10px;background:#ff6600;padding:18px 40px;">
    <div style="display:flex;align-items:center;border:1px solid rgba(255,255,255,0.8);padding:2px 8px;font-size:22px;font-weight:700;color:#ffffff;">DT</div>
    <div style="display:flex;font-size:22px;font-weight:700;color:#ffffff;">Demotivational Thoughts</div>
  </div>
  <div style="display:flex;flex:1;align-items:center;justify-content:center;padding:56px 80px;">
    <div style="display:flex;text-align:center;font-size:${size}px;font-weight:700;line-height:1.18;letter-spacing:-0.02em;">“${escapeHtml(quote.text)}”</div>
  </div>
  <div style="display:flex;align-items:center;justify-content:space-between;padding:28px 48px;">
    <div style="display:flex;align-items:center;gap:10px;background:${badge.bg};padding:8px 14px;font-size:24px;font-weight:600;color:${badge.fg};">
      <div style="display:flex;width:12px;height:12px;border-radius:9999px;background:${badge.dot};"></div>
      ${escapeHtml(label)}
      <div style="display:flex;font-weight:400;opacity:0.6;">${escapeHtml(quote.model)}</div>
    </div>
    <div style="display:flex;align-items:center;gap:28px;font-size:28px;font-weight:600;color:#525252;">
      <div style="display:flex;align-items:center;gap:6px;">${chevron("up", "#16a34a")}${quote.up}</div>
      <div style="display:flex;align-items:center;gap:6px;">${chevron("down", "#dc2626")}${quote.down}</div>
    </div>
  </div>
</div>`;
}

export const Route = createFileRoute("/api/og/$id")({
	server: {
		handlers: {
			GET: async ({ params }) => {
				const quote = await findQuote(params.id);
				if (!quote) {
					return new Response("Quote not found", { status: 404 });
				}

				const [regular, bold] = await Promise.all([
					loadGoogleFont({ family: "Inter", weight: 400 }),
					loadGoogleFont({ family: "Inter", weight: 700 }),
				]);

				// workers-og derives ImageResponseOptions from @vercel/og, which
				// isn't installed here, so its Satori `fonts` field is erased from
				// the type. Spread a typed satori Font[] in alongside the rest.
				const fonts: Font[] = [
					{ name: "Inter", data: regular, weight: 400, style: "normal" },
					{ name: "Inter", data: bold, weight: 700, style: "normal" },
				];
				const image = new ImageResponse(markup(quote), {
					width: WIDTH,
					height: HEIGHT,
					...{ fonts },
				});

				// Replace ImageResponse's year-long immutable cache so the card
				// refreshes as tallies drift (setting, not appending, avoids a
				// conflicting double header).
				const headers = new Headers(image.headers);
				headers.set("cache-control", "public, max-age=3600, s-maxage=86400");
				return new Response(image.body, { status: image.status, headers });
			},
		},
	},
});
