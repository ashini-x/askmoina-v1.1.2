# Deployment checklist

1. Create/use a Cloudflare account.
2. Install Node.js LTS locally.
3. In this repository run `npm install`.
4. Run `npx wrangler login`.
5. Run `npx wrangler secret put GROQ_API_KEY` and enter the existing Groq key.
6. Run `npx wrangler secret put E2B_API_KEY` and enter the existing E2B key.
7. Run `npm run typecheck` and `npm test`.
8. Run `npm run deploy`.
9. Open the Worker `workers.dev` URL.
10. Test `/api/v1/health`.
11. Test `Hi`, a normal reasoning prompt, a current-information prompt, and a Python/math prompt.

The frontend uses a relative API base by default, so no CORS setup or separate frontend host is required for the first deployment.
