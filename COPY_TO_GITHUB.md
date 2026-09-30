# AskMoina — GitHub copy instructions

This repository is the Cloudflare-native replacement for the previous Streamlit/FastAPI versions.

## Important

Do not merge this tree with the old Streamlit repository. Replace the contents of the new `askmoina` GitHub repository with this tree.

The repository root must contain:

- `frontend/`
- `src/`
- `tests/`
- `wrangler.jsonc`
- `package.json`
- `tsconfig.json`

No Streamlit files are needed.

## Before first deploy

Create Worker secrets (never commit them):

```bash
npx wrangler secret put GROQ_API_KEY
npx wrangler secret put E2B_API_KEY
```

Then:

```bash
npm install
npm run typecheck
npm test
npm run deploy
```

The deployed Worker serves both the frontend and the API. Open the returned `workers.dev` URL to load AskMoina.
