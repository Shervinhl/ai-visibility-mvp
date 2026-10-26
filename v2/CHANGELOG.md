# Changelog

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
