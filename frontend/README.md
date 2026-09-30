# AskMoina frontend

This folder is a static customer-facing UI. It is served by the same Cloudflare Worker as the API.

`config.js` intentionally leaves `API_BASE_URL` empty so production requests use the same origin:

`/api/v1/chat/stream`
