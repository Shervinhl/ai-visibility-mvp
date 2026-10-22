# Besignitics Engine 1 (Handbook v1.0)

- `backend/` Express audit service. `server.ts` plus `engine/` (core, signals-a, signals-b, signals-c).
- `frontend/` React + Tailwind page (`src/App.tsx`).

Run: `npm install`, `npx playwright install chromium` (optional, for E1.08/E1.09), `npm run build`, `npm start` in `backend/`.

Audit history is written to `backend/data/audit-history.json` (not committed).
Evaluator version: engine1-eval-2026.10.1. Each release is a commit on this branch.
