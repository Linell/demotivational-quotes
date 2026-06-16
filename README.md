# demotivational-quotes

A small public demo of [Inngest's](https://inngest.com) experiments and scoring features. It generates demotivational quotes, choosing between Claude and GPT via a durable A/B experiment, and scores each variant on quality, sentiment, and engagement. The payoff is in the [Inngest dashboard](https://app.inngest.com), where the variant split and the scores arrive in real time.

## The experiment

`generateQuote` (`src/inngest/quotes.ts`) wraps generation in an Inngest experiment:

```ts
group.experiment("quote-model", {
  variants: { claude: ..., openai: ... },
  select: experiment.weighted({ claude: 50, openai: 50 }),
});
```

Each request is durably routed to one variant — Claude (`claude-opus-4-8`) or GPT (`gpt-4o`) — by a weighted 50/50 split. Each variant runs as a tagged step (`quote-claude` / `quote-openai`), and that variant tag is what later lets the dashboard slice scores per model.

## The scores

The whole point is comparing the two models, so every metric is scored _per variant_. Scores group by name, so each model gets its own series — `quality-claude` vs `quality-openai`, etc. The three metrics:

| Score                 | Range   | Written by                           | When                                                              |
| --------------------- | ------- | ------------------------------------ | ----------------------------------------------------------------- |
| `quality-<variant>`   | 0–1     | `generateQuote`, via an LLM judge    | Right after generation, off the user's critical path              |
| `sentiment-<variant>` | ±1      | `sentimentScorer` (one run per vote) | On every `quote/vote.cast` event                                  |
| `reacted-<variant>`   | boolean | `reactionScorer` (deferred)          | After a wait window — `true` if any vote landed, `false` = apathy |

How scores tie back to the experiment:

- **`quality`** is a LLM-judged perceived quality metric that provides a baseline of _"is this **probably** a decent quote?"_
- **`sentiment`** writes one score per vote, no matter how long after a quote was generated. This provides us a real _"did **people** actually like this?"_ value that we can compare to the **quality** to understand how well our judge is working.
- **`reacted`** is an "after-the-fact" check to see whether or not a quote generated any engagement within its first five minutes. If it has, then we mark score it as `reacted: true`. If there are no votes, then we know that the quote wasn't high enough quality to generate engagement.

## Getting Started

```bash
pnpm install
pnpm run dev
```

Copy `.env.example` to `.dev.vars` and fill in the keys for local development.

## Building for production

```bash
pnpm run build
```

## Styling

This project uses [Tailwind CSS](https://tailwindcss.com/).

## Linting & formatting

This project uses [Biome](https://biomejs.dev/):

```bash
pnpm run lint
pnpm run format
pnpm run check
```

## Deploy to Cloudflare Workers

This app targets Cloudflare Workers (not Pages) via `@cloudflare/vite-plugin` in `vite.config.ts` and `wrangler.jsonc`.

### 1) Log in to Cloudflare

```bash
npx wrangler login
```

### 2) Create the KV namespace used by the app

```bash
npx wrangler kv namespace create QUOTES
```

Copy the ID from the command output and update `wrangler.jsonc`:

```jsonc
"kv_namespaces": [
  {
    "binding": "QUOTES",
    "id": "<PRODUCTION_NAMESPACE_ID>"
  }
]
```

### 3) Set worker secrets

```bash
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put INNGEST_EVENT_KEY
npx wrangler secret put INNGEST_SIGNING_KEY
```

Do not set `INNGEST_DEV` in production.

### 4) Deploy

```bash
npm run deploy
```

Your worker URL will be:

```text
https://demotivational-quotes.<your-subdomain>.workers.dev
```

### 5) Sync the deployed app in Inngest Cloud

In Inngest Cloud (production environment), hit the sync endpoint:

```text
curl -X PUT https://demotivational-quotes.<your-subdomain>.workers.dev/api/inngest
```

At this point you should be able to go to your URL and start generating quotes! As your generations and votes come through, you'll be able to see your Inngest experiment and scoring dashboards updating to reflect the data now flowing through 🤘
