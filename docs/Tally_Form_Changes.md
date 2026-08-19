# Form / Airtable / Mailchimp changes to make

The code in this repo already expects the new shape. These are the manual
edits to make in each tool. Nothing is client-facing until the quiz launches,
so it's safe to do these live.

## 1. Tally form (August 2026)

1. **Remove the "Is your pain on one side?" question** (you already did this).
   Nothing in the code reads it anymore.
2. That's the only structural change this round. The pain question already has
   "Backs of my thighs / hamstrings", and the hard-seat / what-you've-tried /
   recent-events screens were already removed in the prior round.

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
