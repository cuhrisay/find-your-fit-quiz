# CYA Find Your Fit — Vercel Function

Everything that turns a Tally submission into a routed recommendation, a
composed explanation, a logged data row, and an emailed result.

Built from `docs/CYA_Fit_Quiz_Structure_v5.md` (which lives in this repo now,
specifically so it can't drift from the code the way v4 did) — if the routing
ever needs to change, that doc and `lib/routing.js` should always agree.
`lib/routing.test.js` has 100+ passing tests built from the real scenarios
discussed while designing the quiz (Chrisie's hip case, the vulvodynia
exception, tall-but-light 18", Chrisie's 210-lb Extra Cush example, etc.) —
run `npm test` any time you touch `routing.js`.

## How the message is built (July 2026 revision)

**Code picks the cushion AND explains it. The AI only answers the free-text
box.** Every "why we recommend" paragraph and every routing-note explanation
is a fixed template in `lib/composeMessage.js`, guaranteed to match what the
routing actually did. Groq is called only when the person typed something into
the optional free-text box — its single paragraph (validation, PT nudge,
distress acknowledgment) is appended to the deterministic message. An empty
box means no AI call at all: fully deterministic result, faster page, nothing
to hallucinate.

## What's here

```
api/
  quiz-submit.js   POST - Tally webhook lands here. Does everything.
  quiz-result.js   GET  - polled by results.html while quiz-submit.js finishes
lib/
  routing.js       The deterministic "brain" - picks the cushion. No AI here.
  routing.test.js  100+ tests against real scenarios. Run: npm test
  parseTally.js    Raw Tally payload -> normalized answers. NEEDS YOUR FIELD IDs.
  groq.js          Calls Groq ONLY to respond to the free-text box + classify distress.
  composeMessage.js Fixed templates for the whole result message. The only HTML emitter.
  airtable.js      Logs every submission; also the lookup for quiz-result.js
  mailchimp.js     Pushes the result as merge fields so Mailchimp emails it
public/
  results.html     Where Tally redirects to. Polls until the result is ready.
docs/
  CYA_Fit_Quiz_Structure_v5.md   The single source of truth for the quiz design.
  Tally_Form_Changes.md          Checklist of form/Airtable/Mailchimp edits to make.
  Email_Sequence_v2.md           Rewritten 3-email Mailchimp sequence copy.
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
   `Duration`, `One-Sided`, `Firm Preference`, `Diagnoses`,
   `Use Case`, `Needs More Space`, `Sex`,
   `Age Range`, `Country`, `State/Region`, `Free Text`, `Routed Product`,
   `Routed Firmness`, `Routed Size`, `Routed Thickness`, `Second Cushion`,
   `AI Message`, `Email`, `First Name`.
   (July 2026: `Hard Seat Pain`, `What They've Tried`, and `Recent Events` were
   removed along with their quiz screens — delete those columns if they exist.)
   Get a personal access token (read+write on this base) and the base ID for
   `.env.local`.

2. **Mailchimp** — create/choose an audience. Add merge fields (Audience ->
   Settings -> Merge fields): `PRODUCT`, `FIRMNESS`, `SIZE`, `THICKNS` (10-char
   cap), `AIMSG`. Build an automation triggered by the `quiz-results` tag that
   sends the result email using those merge fields. Get your API key, server
   prefix (the part after the dash), and audience ID for `.env.local`.
   **`AIMSG` is a short plain-text teaser only** (Mailchimp's "text" merge
   fields cap out around 255 characters - a hard platform limit) — the full
   formatted message with headings/links only lives on the results page. Add
   the "For More Support" section (guide/blog/provider-directory/support
   email) as **static content directly in the email template itself**, not
   through a merge field, since it's identical on every send anyway.

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
  arrive. Send one WITH free text and one WITHOUT — the without-free-text case
  should never call Groq (check the Vercel function logs).
- **Test the distress-handling path deliberately** (Structure v5 §6 — this is not
  optional). Groq classifies the free text into `distressTier` ("none" / "crisis" /
  "general_struggle") and only writes plain acknowledgment prose — the actual 988
  crisis line and the guide/blog/provider-directory "For More Support" section are
  fixed, code-generated HTML (`lib/composeMessage.js`), not something the AI has to
  reproduce correctly. Still worth testing both tiers end-to-end:
  - Submit the free-text box with crisis-level language (e.g. "I don't want to be
    here anymore") and confirm the response includes the 988 crisis line, keeps the
    product recommendation, and doesn't try to counsel.
  - Submit the free-text box with general emotional-struggle language (e.g. "I
    feel discouraged and alone in this") and confirm it does NOT show the crisis
    line — the two tiers should never be conflated. The guide/blog/provider-directory
    "For More Support" section appears on every result regardless of tier.

## Known gaps / things flagged rather than silently decided

- **Awaiting Trudy's confirmation** (see Structure v5 "Still open"): the
  Extra-Cush-is-Extra-Firm-only reasoning, and reconciling the product page's
  overlapping weight/firmness copy ("Extra Firm — 200 lbs and up") with the
  routing table's 201–220 → Firm from her call guidance.
- `routing.js` still has `ASSUMPTION:` comments where a judgment call was made —
  search the file for `ASSUMPTION:` to see them.
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
