# AI Visibility Check v2

Evidence-based replacement for the Engine 1 weighted score. Engine 1 (`engine1/`) is untouched and still works.

Two questions, answered separately, with **no overall score**:

1. **Can AI read your site?** 12 technical checks (A1 to A12), each PASS, FAIL, NOT_ASSESSED or NOT_APPLICABLE, with evidence.
2. **Does AI mention you?** 20 to 40 frozen buyer questions, asked 3 times to two or more AI providers through their official APIs. Counts of MENTIONED and RECOMMENDED, plus CORRECT / INCORRECT / UNVERIFIABLE, with human review.

## Run it

Needs Node 22.13 or newer (Node 24 recommended).

1. Backend setup
   ```
   cd v2/backend
   npm install
   cp .env.example .env
   ```
2. Add at least two provider keys to `v2/backend/.env`, then start the backend (port 3000)
   ```
   npm run dev
   ```
3. Start the frontend in a second terminal (port 3001), then open http://localhost:3001
   ```
   cd v2/frontend
   npm install
   npm run dev
   ```

Optional, for check A3 (JavaScript rendering):
```
cd v2/backend
npm install playwright
npx playwright install chromium
```

Engine 1 also uses ports 3000 and 3001. Run one engine at a time, or set `V2_PORT` and `V2_API_URL`.

## Tests

```
cd v2/backend
npm test
npm run example:flowjin
```

`npm run example:flowjin` writes `v2/examples/flowjin-report.json`.

## Layout

| Folder | What it holds |
|---|---|
| `backend/src/checks` | Part A: fetcher (robots.txt, request cap, retries), robots and sitemap parsers, A1 to A12 |
| `backend/src/facts` | Part B1: fact list type and validation |
| `backend/src/questions` | Part B2/B3: question generation template, de-duplication, freeze rules |
| `backend/src/ai` | Part C: providers, runner, refusal rules, labels, counts and Wilson interval |
| `backend/src/retest` | Part D: before/after comparison |
| `backend/src/wording` | Part E: customer wording |
| `backend/src/db` | Part F: SQLite schema (node:sqlite) and data access |
| `backend/src/api` | Part G: Express endpoints and report |
| `backend/config/checks.config.json` | Thresholds; check version = base + hash of values |
| `frontend/src/screens` | The five screens |

## Rules built into the code

- Status words are only: PASS, FAIL, NOT_ASSESSED, NOT_APPLICABLE, MENTIONED, NOT_MENTIONED, RECOMMENDED, NOT_RECOMMENDED, CORRECT, INCORRECT, UNVERIFIABLE (AI attempts are VALID, REFUSAL, ERROR, TIMEOUT).
- Missing data is never PASS and never 0. NOT_ASSESSED and NOT_APPLICABLE always carry a reason and a next step (enforced by a database constraint).
- Fact lists, raw AI answers, check results and frozen question sets cannot be changed (database triggers). Changes create new versions.
- Comparisons are blocked unless both runs used the same frozen question-set version and identical provider settings.
- The checker fetches with GET only, names itself in the user-agent (`BesigniticsVisibilityCheck/2.0`), obeys robots.txt for every fetch, and stops at the request cap.
