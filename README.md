# AskMoina — Cloudflare Edition

A standalone AskMoina web application: static frontend + Cloudflare Worker API, with no Streamlit runtime.

## Runtime architecture

- `frontend/` — the approved AskMoina UI.
- `src/` — Cloudflare Worker backend and orchestration.
- Groq — `openai/gpt-oss-120b`.
- Live Search — always enabled.
- E2B Sandbox — always available; invoked when Tier 1 emits a Python code block.
- Tier 2 — precision audit streamed back to the browser.
- SSE — real phase events and response deltas.

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars
# add GROQ_API_KEY and E2B_API_KEY to .dev.vars
npm run typecheck
npm test
npm run dev
```

## Deploy

Authenticate Wrangler once:

```bash
npx wrangler login
```

Set secrets:

```bash
npx wrangler secret put GROQ_API_KEY
npx wrangler secret put E2B_API_KEY
```

Then deploy:

```bash
npm run deploy
```

The same Worker serves the static frontend and `/api/*` routes.

## Security

API keys are Worker secrets and are never shipped to the browser. Do not commit `.dev.vars` or other secret-bearing files.
