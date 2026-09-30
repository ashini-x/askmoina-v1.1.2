# Migration from Streamlit / FastAPI

This version intentionally removes the Streamlit UI and the FastAPI/Cloud Run requirement.

## Retained behavior

- `openai/gpt-oss-120b` via Groq
- Logical / Auto / Creative mode profiles
- Live Search always on
- E2B available whenever Python is emitted by Tier 1
- Security Guard forbidden-pattern checks
- Tier 1 synthesis
- Tier 2 Precision Audit
- SSE phase events and streamed response deltas

## Replaced

- Streamlit widgets → static frontend
- Streamlit BidiComponent → same-origin Worker API
- Python Groq SDK → direct HTTPS call to Groq
- `duckduckgo-search` Python package → HTTP search implementation
- Python E2B SDK → E2B JavaScript Code Interpreter SDK
- FastAPI → Cloudflare Worker fetch handler

The legacy repositories should remain archived until parity testing is complete.
