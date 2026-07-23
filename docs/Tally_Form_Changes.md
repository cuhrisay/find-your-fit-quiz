# Form / Airtable / Mailchimp changes to make (July 2026 revision)

The code in this repo already expects the new shape. These are the manual
edits to make in each tool, in order. Nothing is client-facing until the quiz
launches, so it's safe to do these live.

## 1. Tally form

1. **Pain question (Screen 3):** add the option **"Backs of my thighs /
   hamstrings"** to "Where is the pain?" — position it right after Buttocks.
2. **Delete three screens entirely:**
   - "Any pain that gets worse on a hard seat?" (old Screen 6)
   - "What have you already tried?" (old Screen 9)
   - "Recently had surgery, an accident, or a procedure?" (old Screen 12)
3. Check any Tally logic/jumps that referenced the deleted screens and remove
   or re-point them.
4. Leave everything else as-is (sex/age, country/state, free text, email all
   stay).

## 2. After editing — re-verify field IDs (required)

Send yourself a test submission and open the webhook payload (or Tally's
submission export):

- Confirm every `question_...` key in `lib/parseTally.js` `FIELD_MAP` still
  matches (Tally usually keeps keys when you edit options, but verify).
- Confirm the **exact option text** of the new thighs option matches the
  string in `VALUE_MAPS.painLocations` (`'Backs of my thighs / hamstrings'`) —
  the match is exact-text, punctuation and all.
- The old TODO still stands: re-verify the **weight** question's field key and
  bracket option texts against the live form (the code expects the 9-bracket
  wording, e.g. "151–169 lbs" with an en-dash).

## 3. Airtable

Delete these columns from the `Submissions` table (the code no longer writes
them): **Hard Seat Pain**, **What They've Tried**, **Recent Events**.

## 4. Mailchimp

- Merge fields are unchanged: `PRODUCT`, `FIRMNESS`, `SIZE`, `THICKNS`,
  `AIMSG`, `FNAME`.
- Note: for Simple Soother results, `SIZE` = "One Size" and `THICKNS` = "3\"" —
  make sure the email template reads fine with those values.
- Replace the three automation emails with the copy in
  `docs/Email_Sequence_v2.md` (fixes the "thein" typo, the `*|FIRMNESS|*` /
  `<<Firmness>>` mixed merge syntax in email 3, and the "a couple days ago"
  timing in email 2, and adds the benefit copy + testimonials Chrisie wanted).

## 5. Squarespace (pre-launch, pending Trudy)

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
