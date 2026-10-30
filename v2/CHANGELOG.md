# Changelog

## v2.10: "Does AI mention you?" measurement model (dimensions-v1)

### What is measured now (automatic rules, per answer, stored with the label)
- Mention type: explicit business name, or an approved alias. Answers still AMBIGUOUS wait for a person.
- Recommendation strength: strong, qualified (conditional or for a use case), neutral, negative (warning), or none.
- Explicit list rank (only from a numbered list in the main answer) and prominence: high, medium, low.
- Mention order: first appearance among the tracked brands. This is not a ranking.
- Each configured competitor: mentioned, strength, rank, prominence, order.
- Head-to-head counts: competitor recommended but not you; both; you but no competitor; neither.
- Claim accuracy: a rate is shown only when there are CORRECT or INCORRECT claims. UNVERIFIABLE is never counted as correct.
- Intent: lexical requirement coverage of each question (a heuristic, shown as such).
- Citations: reported as "not available from provider" (no connected provider returns citations yet).

### Behaviour change
- A plain shortlist position is NEUTRAL, not RECOMMENDED. A recommendation needs endorsement or a conditional fit. This lowers the "recommended" count compared with v2.9 for the same answers.
- Labels are now label-rules-v2. Answers labeled before this version have no dimension data until the test is run again.

### Not built yet
- Implicit references (needs a semantic judge), a model-based intent judge, citation capture, and the validation dataset with precision and recall.

### API and screen
- New field: "dimensions" in the AI results and in the report (rates show count, denominator and percentage).
- AI results screen: "Measurement details" panel with the metrics, the brand table and the list of what is not measured yet.

## version 2 (on top of version 1, commit bbb427c)

### Checker fixes
- A3: a timeout or missing browser is shown as "Next step" (technical retry), not as "Needs" from the client.
- A4: the summary names the exact problem on each failing page (title, missing or repeated H1).
- A5: legal and policy pages (terms, privacy, creator agreement, copyright, cookies, refunds) are NOT_APPLICABLE.
- A6: the "not found" result lists the pages that were searched.
- A7: a missing price says whether it appears only after JavaScript runs, and whether the structured data lists a different price.
- A12: JSON-LD with template placeholders (DYNAMIC_URL, DYNAMIC_NAME, DYNAMIC_DESCRIPTION) is a FAIL.

### Wording
- "Needs:" is used only when the client must provide something. Technical retries say "Next step:".

### Business setup screen
- Required fields are marked with a red *.
- Fields with a problem get a red border and a message (shown after leaving the field or pressing save).
- "Fill all fields from my website": AI reads the homepage and fills empty fields (fields already typed are kept). Without an AI key, only page metadata is used and the screen says so.
- New endpoint: POST /api/facts/suggest (checks robots.txt first, reads one page, 15 second timeout).

### Question review
- Candidate questions are generated automatically the first time the screen opens for a business with no question set.
- Add, edit, and remove still work on every question.

### Tests
- 115 tests pass (110 from version 1 plus 5 new).
