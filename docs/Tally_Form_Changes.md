# Form / Airtable / Mailchimp changes to make

The code in this repo already expects the new shape. These are the manual
edits to make in each tool. Nothing is client-facing until the quiz launches,
so it's safe to do these live.

## 1. Tally form (August 2026)

1. **Remove the "Is your pain on one side?" question** (you already did this).
   Nothing in the code reads it anymore.
2. **Remove the email and first name questions** (previously Screen 13) —
   done. Email is now an optional step on the results page ("email me my
   results + 10% off") instead, handled by `api/quiz-capture-email.js`.
3. **Remove the country/state/province questions** — done. They were never
   actually wired into any Meta ads integration (this codebase has none), so
   nothing live depended on them; `lib/parseTally.js` no longer reads them.
4. The pain question already has "Backs of my thighs / hamstrings", and the
   hard-seat / what-you've-tried / recent-events screens were already removed
   in a prior round. The consent checkbox screen (right after "Begin Quiz",
   before any health question) is already in place from the privacy pass —
   no further change needed there.

## 2. After editing — re-verify field IDs (required)

Send yourself a test submission and open the webhook payload (Tally →
Integrations → Webhook → events log shows the exact JSON):

- Confirm every `question_...` key in `lib/parseTally.js` `FIELD_MAP` still
  matches (Tally usually keeps keys when you edit a form, but verify — the
  one-sided removal shouldn't shift the others, but check).
- Confirm option texts still match `VALUE_MAPS` exactly (punctuation and all),
  especially the weight brackets and the pain-location options.

## 3. Airtable

The `One-Sided` column is no longer written (safe to delete, or leave it — it
just won't populate on new rows). The earlier round already had you delete
`Hard Seat Pain`, `What They've Tried`, and `Recent Events`.

As of the August 2026 privacy pass, `Email` and `First Name` are also no
longer written — Airtable never receives identity now, only Mailchimp does.
Safe to delete both columns whenever convenient.

`Country` and `State/Region` are no longer written either (same round) —
turned out they were never wired into any Meta ads integration, so nothing
live depended on them. Safe to delete both columns too.

Add a new column: `Email Summary` (long text). Written at submit time
regardless of whether anyone ever gives an email — it's the short teaser
`quiz-capture-email.js` reads back later to hand Mailchimp, so it doesn't
need to reconstruct it from the raw answers after the fact.

## 4. Mailchimp

- Merge fields are unchanged: `PRODUCT`, `FIRMNESS`, `SIZE`, `THICKNS`,
  `AIMSG`, `FNAME`.
- Note: for Simple Soother results, `SIZE` = "One Size" and `THICKNS` = "3\"" —
  make sure the email template reads fine with those values.
- Replace the three automation emails with the copy in
  `docs/Email_Sequence_v2.md` (fixes the "thein" typo, the `*|FIRMNESS|*` /
  `<<Firmness>>` mixed merge syntax in email 3, and the "a couple days ago"
  timing in email 2, and adds the benefit copy + testimonials Chrisie wanted).

## 5. Webhook signing secret (recommended, not yet done)

Tally -> your form -> Integrations -> Webhooks -> the webhook -> generate a
signing secret, then add it as `TALLY_SIGNING_SECRET` in Vercel's env vars.
Right now `api/quiz-submit.js` will accept a POST from anyone who finds the
URL, not just Tally — this closes that gap. See `.env.example`.

## 6. Squarespace (pre-launch, pending Trudy)

- Consolidate Low Profile + 18" into the Twin Cheeks product page as variants
  (the quiz's order links assume two product pages only: Twin Cheeks and
  Simple Soother).
- While consolidating, align the variant name "Extra Firm Cushy 3\"" with the
  quiz's "Extra Cush 3\"" — pick one name and use it in both places.
- Once Trudy confirms the weight/firmness table, update the product-page
  firmness copy so it agrees with the quiz (no customer should get two
  different answers from the quiz and the page they order on).
- Replace "Not sure which to pick? Call us…" on product pages with a link to
  the Find Your Fit quiz; phone number moves to the contact page only.
