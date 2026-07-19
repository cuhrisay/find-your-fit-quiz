# CYA Find Your Fit — Vercel Function

Everything that turns a Tally submission into a routed recommendation, an
AI-written explanation, a logged data row, and an emailed result.

Built directly from `CYA_Fit_Quiz_Structure_v4.md` — if the routing ever needs to
change, that doc and `lib/routing.js` should always agree. `lib/routing.test.js`
has 25 passing tests built from the real scenarios discussed while designing the
quiz (Chrisie's hip case, the vulvodynia exception, tall-but-light 18", etc.) —
run `npm test` any time you touch `routing.js`.

## What's here

```
api/
  quiz-submit.js   POST - Tally webhook lands here. Does everything.
  quiz-result.js   GET  - polled by results.html while quiz-submit.js finishes
lib/
  routing.js       The deterministic "brain" - picks the cushion. No AI here.
  routing.test.js  25 tests against real scenarios. Run: npm test
  parseTally.js    Raw Tally payload -> normalized answers. NEEDS YOUR FIELD IDs.
  groq.js          Calls Groq to write the explanation. Never picks the product.
  airtable.js       Logs every submission; also the lookup for quiz-result.js
  mailchimp.js     Pushes the result as merge fields so Mailchimp emails it
public/
  results.html     Where Tally redirects to. Polls until the result is ready.
```

## Why two API endpoints instead of one

Tally's webhook is fire-and-forget — it doesn't wait for a response before
redirecting the person. Since Groq takes a couple seconds, `results.html` polls
`quiz-result.js` every 1.5s until `quiz-submit.js` has finished and logged the
result to Airtable. This is what actually fulfills the promise on Screen 16
("we'll show you your fit right now, and send a copy") — without it, the on-screen
part silently wouldn't work and only the email would arrive.

## Setup checklist

1. **Airtable** — create a base with a `Submissions` table. Columns needed (exact
   names, Airtable is picky about matching what the code writes):
   `Tally Submission ID`, `Timestamp`, `Weight`, `Height`, `Pain Locations`,
   `Duration`, `One-Sided`, `Hard Seat Pain`, `Firm Preference`, `Diagnoses`,
   `What They've Tried`, `Use Case`, `Needs More Space`, `Recent Events`, `Sex`,
   `Age Range`, `Country`, `State/Region`, `Free Text`, `Routed Product`,
   `Routed Firmness`, `Routed Size`, `Routed Thickness`, `Second Cushion`,
   `AI Message`, `Email`, `First Name`.
   Get a personal access token (read+write on this base) and the base ID for
   `.env.local`.

2. **Mailchimp** — create/choose an audience. Add merge fields (Audience ->
   Settings -> Merge fields): `PRODUCT`, `FIRMNESS`, `SIZE`, `THICKNS` (10-char
   cap), `AIMSG`. Build an automation triggered by the `quiz-results` tag that
   sends the result email using those merge fields. Get your API key, server
   prefix (the part after the dash), and audience ID for `.env.local`.

3. **Groq** — free account at console.groq.com, generate an API key.

4. **Fill in Tally field IDs** — open `lib/parseTally.js`, replace every
   `REPLACE_WITH_TALLY_FIELD_ID` with the real field ID from your built form
   (send yourself a test submission via the webhook, look at the payload, match
   each question's label to the right key).

5. **Deploy to Vercel** — `vercel deploy`, or connect the GitHub repo in the
   Vercel dashboard. Set all the env vars from `.env.example` in Vercel's project
   settings.

6. **Point Tally at it** — Integrations -> Webhooks -> your deployed
   `/api/quiz-submit` URL. Then Settings -> Redirect on Completion -> your
   deployed `/results.html?id=@SubmissionID` (use Tally's `@` menu to insert the
   actual submission ID token, don't type it literally).

## Testing before this touches a real customer

- `npm test` — routing logic only, no network calls needed.
- Send a few real test submissions through Tally end-to-end and check: does the
  result page render, did the row land in Airtable, did the Mailchimp email
  arrive.
- **Test the distress-handling path deliberately** (Structure v4 §7 — this is not
  optional). Submit the free-text box with language indicating crisis (e.g. "I
  don't want to be here anymore") and confirm the response includes the crisis
  line from `groq.js`'s system prompt, keeps the product recommendation, and
  doesn't try to counsel. Replace `[PHONE]`/`[EMAIL]` placeholders in
  `groq.js`'s `SYSTEM_PROMPT` with Trudy's real contact info before launch —
  they're placeholders right now on purpose, so this doesn't ship un-filled.

## Known gaps / things flagged rather than silently decided

- `routing.js` has several `ASSUMPTION:` comments where the source doc was
  ambiguous or the quiz's weight *buckets* couldn't give an exact match to a rule
  written in raw numbers (e.g. the 150 lb Extra Cush threshold falls inside the
  140–180 bucket). Search the file for `ASSUMPTION:` to see all of them.
- Live stock checking for the 18" waitlist note isn't built — it always shows
  the waitlist-safe copy when 18" is recommended, regardless of actual
  Squarespace stock. Fine for now since the copy never promises a timeline, but
  a real stock check would need a Squarespace API integration, not built here.
- Airtable is being used both as the permanent data log AND the short-term
  result-lookup store `quiz-result.js` polls. This keeps infrastructure minimal
  (no new service), but means every result page load does an Airtable API call.
  Fine at CYA's volume; if this ever needs to be faster, a proper short-TTL
  cache (e.g. Vercel KV) would be the upgrade — not needed yet.
- The privacy separation described in Structure v4 §6 (email kept separable from
  the anonymous data) is only partially enforced by this code — email lives in
  its own Airtable column, but nothing stops someone from pulling it into an
  aggregate report. True separation is a process discipline on the Airtable side,
  not something code alone can guarantee.
