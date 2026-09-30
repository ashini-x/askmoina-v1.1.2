# AskMoina production architecture

## Browser

The approved custom UI lives entirely in `frontend/` and has no model/API credentials.

## Worker

`src/index.ts` is the public edge entrypoint. It serves static assets from the same Worker and exposes:

- `GET /api/v1/health`
- `POST /api/v1/chat/stream`

## Application flow

1. Validate and sanitize the incoming prompt.
2. Live Search is always enabled.
3. Tier 1 calls Groq with the selected Logical / Auto / Creative profile.
4. If Tier 1 emits Python, E2B Sandbox verification runs.
5. Tier 2 performs the Precision Audit as a streaming Groq request.
6. SSE phase events and Groq delta frames are sent to the browser.
7. The frontend animates only the current phase; it never fabricates backend phases.

## Secrets

`GROQ_API_KEY` and `E2B_API_KEY` are Worker secrets. Never put them in frontend files or `wrangler.jsonc`.
