# Find Your Fit — Structure v5 (July 2026)

Supersedes `CYA_Fit_Quiz_Structure_v4.md` (Downloads). v4 drifted from the code
because it lived outside the repo — this version lives in `docs/` next to
`lib/routing.js`, and the rule stands: **if the routing changes, this doc and
`routing.js` change together.**

The objective, restated so it stays the filter for every future addition:
**encourage people to buy while reducing returns, exchanges, and Trudy's daily
email/phone load.** Anything that doesn't serve that gets cut, not accumulated.

---

## 1. Design decision

**Code picks the cushion AND explains it. The AI only answers the free-text box.**

This is a tightening of v4's "code picks, AI explains." The AI (Groq) is now
called only when the person typed something into the optional free-text box,
and contributes exactly one paragraph: a warm response to what they wrote
(condition validation, PT nudge, mismatch flags, distress acknowledgment) plus
the distress classification. Everything else — the "why we recommend"
paragraph, every tradeoff/caveat explanation, the break-in and returns copy,
the crisis-line block, the support links — is fixed template text in
`lib/composeMessage.js`, keyed off `routing.js`'s output. The reasoning shown
to the customer is therefore guaranteed to match what the routing actually
did; the old prompt's accumulated anti-hallucination patches are gone because
the failure mode is gone.

An empty free-text box = no AI call at all. Fully deterministic result.

## 2. The flow (12 screens)

Removed over the revisions: the standalone hard-seat-pain question (merged into
pain locations), "what have you already tried" and "recent surgery/accident"
(the duration question covers the routing), the "is your pain on one side?"
question (August 2026 — irrelevant now that custom cutouts aren't offered),
and country/state/province (August 2026 — turned out to be collected for no
live purpose; this codebase has no Meta ads integration for it to feed).
Sex/age stays — skippable, low-friction, feeds Meta-ads data.

**Email is no longer asked anywhere in this flow (August 2026).** The quiz
submits and redirects to results.html right after the free-text screen; email
is collected separately, afterward, on the results page itself — see §5 and
the README's "Privacy design" section for why that split matters.

- **Screen 0 — Welcome.** Title, one line of what to expect, start button.
- **Screen 1 — Consent.** "I agree to share this information with Cushion
  Your Assets under the Privacy Policy below," required, unchecked by
  default. Sits here specifically because it must come before any
  health-related question, not just before submission (August 2026 privacy
  pass — see README).
- **Screen 2 — How much do you weigh?** Nine brackets + "It's a gift / I don't
  know their weight" (gift fork → gift-card page, before anything else).
- **Screen 3 — How tall are you?** short / regular / tall.
- **Screen 4 — Where is the pain?** (multi-select) Tailbone, Sit bones,
  Rectal, Perineum, Genitals, Bladder/Urethra, Prostate, Hips, Buttocks,
  Backs of my thighs / hamstrings, Groin, Not sure/it changes. Drives product
  (central-only → Soother candidate) and the hard-surface signal (sit bones /
  hips / buttocks / thighs → Extra Cush candidate, never Low Profile).
- **Screen 5 — How long has this been going on?** Gates the Soother (over 2 yr
  never; 6mo–2yr only if recovering) and drives the temporary framing.
- **Screen 6 — Firmer or softer?** Firm / Soft / Depends-not sure. On-screen
  break-in framing in Trudy's voice.
- **Screen 7 — Diagnosis?** (multi-select, optional) Gates the Soother +
  drives condition-specific result copy.
- **Screen 8 — Where will you mainly use it?** (multi-select).
- **Screen 9 — Do you find yourself needing a bigger seat / more space when
  you sit?** Drives 16"/18".
- **Screen 10 — Sex + age range** (optional, one screen) [data/marketing].
- **Screen 11 — Anything else?** (free text, optional, prominent) — the box
  the AI reads. "Don't worry about being embarrassed — we've heard it all."
  Quiz submits here and redirects to results.html.

## 3. Routing tables (rewritten August 2026 with Trudy's product-logic pass)

### Product — Twin Cheeks (default) vs Simple Soother
The Simple Soother is offered only when ALL of these hold:
1. **Every** reported pain location is **central**: groin, genital, bladder/urethra,
   or rectal. A tight cluster of these is fine; any non-central location (tailbone,
   sit bones, hips, buttocks, thighs, **perineum, prostate**) → Twin Cheeks.
2. **No condition implying wider pain.** Soother-incompatible → Twin Cheeks:
   pudendal neuralgia, pelvic floor dysfunction, endometriosis, pelvic girdle pain,
   coccydynia, vaginismus, prostatitis/CPPS. Soother-compatible: vulvodynia,
   **interstitial cystitis**, recovering-from-surgery, "something else", no diagnosis.
3. **Duration isn't long-established:** over 2 years → never Soother; 6 months–2 years
   → only if recovering-from-surgery/childbirth (temporary even if slow to heal);
   under 6 months → fine.
4. **No confident need for more room** (`needsMoreSpace !== 'yes'`) — the Soother is a
   single fixed size, so it can't serve someone who needs the 18". (August 2026,
   Chrisie/Claude — not yet run past Trudy.) When this is the only thing blocking
   Soother, the Twin Cheeks result says so plainly: pain pattern alone would have
   pointed to the cheaper Soother, but they got bumped to Twin Cheeks for space. A
   "not sure" on space does NOT bump — only a confident "yes" does.

Soother framing: **temporary** ("central and recent, a smart lower-cost start") when
recent or recovering; otherwise **central_only** ("you only reported central pain").
Every Soother result includes the upgrade line: *"If this doesn't feel like enough,
Twin Cheeks is an easy upgrade."* If they also travel, note it's not the best for travel.

**Soother specs are fixed:** 3" thick, one size, **Medium under 140 lbs / Firm 140+**.
On the cusp (130–150) the firmness preference breaks the tie (too firm can hurt, too
soft won't hold). A Soother result never touches the Twin Cheeks tables below.

### Firmness — weight bucket × preference (Twin Cheeks only)
| Weight | Firm pref | Soft pref | Not sure |
|---|---|---|---|
| Under 120 | Medium | Soft | Soft |
| 120–129 | Medium | Medium | Medium |
| 130–139 | Medium Plus | Medium | Medium |
| 140–150 | Medium Plus | Medium | Medium Plus |
| 151–169 | Medium Plus | Medium Plus | Medium Plus |
| 170–180 | Firm | *(Extra Cush)* | Medium Plus |
| 181–200 | Firm | *(Extra Cush)* | Firm |
| 201–220 | Extra Firm | *(Extra Cush)* | Firm |
| Over 220 | Extra Firm | *(Extra Cush)* | Extra Firm |

*Soft preference at 170+ promotes to Extra Cush (displayed as Extra Firm) — see below.*

### Extra Cush 3" (Extra Firm base + cushy top; the ONLY fabric is Extra Firm)
The point of the Extra Cush: firm/extra-firm seats are *hard* and hurt people who
can't tolerate a hard surface — the cushy top fixes that. It only makes sense at
**weight ≥ 170** (below that, weight-based firmness is Medium-ish anyway — no hardness
problem). At 170+, firmness preference drives it:

| Preference (at 170+) | Result |
|---|---|
| **Cushy** | **Extra Cush primary.** Note offers "prefer no added height? Regular's also great." |
| **Firm** | **Regular firm/extra-firm.** IF they also report hard-surface pain (sit bones / hips / buttocks / thighs) → "consider Extra Cush, it softens the firm feel (adds height)." No hard-surface pain → plain Regular. |
| **Not sure** | **Regular**, with "torn between firm and cushy? Extra Cush gives both (adds height)." |

Hard-surface pain = **sit bones, hips, buttocks, thighs/hamstrings** (these force
Twin Cheeks and mean Low Profile is never offered). PN on its own does **not** trigger
an Extra Cush nudge (only cushy preference or actual hard-surface pain do). Extra Cush
always carries a height caveat, plus a car caveat (SUV/minivan/adjustable seat, else
Regular for a small car) or a travel caveat (bulkier to pack). 18" + Extra Cush is a
valid combo (18" comes in Regular and Extra Cush).

### Low Profile 1.5" (Trudy: bump the firmness UP — reverses the July "no bump")
- **Firmness bumps up one band** from the weight-based level (shorter foam has to be
  firmer to hold the same weight), **capped at Firm** — LP isn't made in Extra Firm.
  This naturally yields "Medium LP only for very light people" (under-120 Soft → Medium).
- **Never over 200 lbs** — the foam isn't supportive enough (Trudy: the Medium LPs come
  back almost every time). **Never for hard-surface pain.** **Never in 18".**
- **LP primary** only when travel/compact is the dominant need (they travel and have no
  stationary use — desk/home/recliner/wheelchair) and they qualify.
- Otherwise **Regular is primary** and LP is offered as a **companion** for travel, or
  for driving if they're tall and want less height. Over-200 + wanted compact → Regular
  + "a Low Profile wouldn't hold you up at your weight."

### Size — 16" default, 18" on a confident "yes"
- "Yes, I need more space" → **18"** with the honest wider-size explanation (which now
  folds in its own gut-check). **No stock/waitlist copy** — 18" is kept in stock; if a
  variant sells out, Squarespace's native product-page "notify me" handles it.
- Otherwise **16"**. Wheelchair/recliner + heavier build + not tall → "your seat may run
  wide, the 18" might fit better" note.
- **"Not sure" + a supporting signal** (heavier weight bucket, OR reported thigh/hamstring
  pain — a seat-width complaint in disguise) → 16" with a gentle "worth a look" nudge
  toward 18". Weight/thigh pain are proxies, not proof, so they only ever shape the
  ambiguous "not sure" case — a confident "no" is never second-guessed, and a confident
  "yes" is never overridden by body metrics either. (August 2026, Chrisie/Claude.)

### Second cushion — a Low Profile companion, only when it genuinely helps
- 18" + travel + wheelchair → no pairing (the chair travels with them); note only.
- 18" + travel (otherwise) → Low Profile 16" companion if eligible; else a tradeoff note.
- Regular + travel (or tall + driving) + LP-eligible → Low Profile 16" companion.
- Everything else → one cushion. One confident answer is the default.

## 4. Result copy — always shown, code-generated

### Message anatomy (July 2026 rework — every input the customer gives must
### surface somewhere in the message; nothing they told us gets ignored)
| Quiz input | Where it appears in the result |
|---|---|
| Pain locations | Named in the "Why We Recommend" sentence and the email teaser |
| Diagnosis | Woven into the "Why" sentence AND gets its own condition-specific mechanism paragraph — never a generic "we hear about it" line |
| Weight + firmness preference | "We set your firmness at X…" line (special either/or wording at 140–150; skipped when Extra Cush / Low Profile explain their own firmness) |
| Use: travel/compact | Low Profile note (primary or companion), or "too heavy for LP" note |
| Use: driving | Extra Cush car caveat, Low Profile-for-driving companion, or the default "Regular is our car pick, adjust your seat for the height" line |
| Use: wheelchair/recliner | Wide-seat check note; wheelchair + 18" + travel pairing note |
| Needs more space | 18" wider-size explanation (with built-in gut-check). No stock/waitlist copy. |
| Duration | Temporary-vs-central Soother framing |
| Free text | The one AI paragraph (only when non-empty) |

**CLAIM-SAFETY RULES (Chrisie, July 2026 — firm, not stylistic).** These
apply to every piece of result copy, condition text especially:
- **Never** say the cushion treats, cures, is "designed for", or was "made
  for" any condition. It *relieves pressure* — that is the ceiling of the
  claim. Describe what it mechanically does and let that stand.
- **Never** rank ("#1"/"number one"). PN, tailbone pain/coccydynia, male
  prostatitis, and vulvodynia are "one of the most common" things people
  come to us about — say exactly that, no ranking.
- **The real mechanism** (Trudy's call + Chrisie's own hip-pain experience):
  relieving sitting pressure lets a tight pelvic floor relax, and *that
  relaxation* is what eases pain — including referred pain felt somewhere the
  cushion never directly touches (hips, thighs, buttocks). So **do not** say
  "pressure off exactly where it hurts" — it's wrong for referred pain and
  makes people go "but I don't have pain there." The "Why We Recommend"
  sentence uses the universal pelvic-floor framing for exactly this reason.

**Condition-specific mechanism text** (`DIAGNOSIS_TEXT` in composeMessage.js):
each named diagnosis gets a paragraph connecting the condition to what the
cushion mechanically does — PN/coccydynia/prostatitis/vulvodynia lead with
"one of the most common things people come to us about"; prostatitis uses
Trudy's sitting-pressure/pelvic-floor-tension point without denying the
diagnosis; endo uses the referred-pain mechanism (Chrisie's own case). All
pressure-relief/relaxation language, never cure or "designed for". Vulvodynia
and recovering-from-surgery use product-neutral wording since they can appear
on Soother results.

**18" copy rules** (per Chrisie): it IS wider — say so, never "isn't a bigger
cushion." Never compare against a 16" experience they haven't had. It folds
like every other cushion — it's just a large piece to carry, not a
"stay-in-place, not travel" product.

### Fixed blocks
- Break-in: "our cushions come firm and soften over time."
- Returns: 14 days + email-for-extension.
- Break-in note now also says a new cushion takes getting used to (different way of sitting).
- 18" only: the wider-size explanation (no stock/waitlist copy — 18" is kept in stock).
- Every result ends with the guide / blog / provider-directory / support-email block.

## 5. Data log (Airtable)
All structured answers + free text + routed result + composed message. No
email or name — Airtable is keyed only by the opaque Tally submission ID
(August 2026 privacy pass). Mailchimp is now the sole place an email connects
to a recommendation. No-longer-written columns: Hard Seat Pain, What They've
Tried, Recent Events, One-Sided, Email, First Name, Country, State/Region.
Country/state were dropped the same round as email/name — turned out they
were never wired into any Meta ads integration (there isn't one in this
codebase), so nothing live depended on them. Sex/age retained for Meta-ads
stats.

The webhook itself (`api/quiz-submit.js`) verifies Tally's `Tally-Signature`
header against `TALLY_SIGNING_SECRET` when that env var is set, so the
endpoint isn't open to arbitrary POSTs once configured.

A required consent screen was added right after the welcome screen (before
any health question) — "Consent Given" (yes/no) is logged per submission as
proof the checkbox was checked, not just relied on as a UI-only gate.

**Email capture moved to the results page (August 2026).** The quiz no longer
asks for email at all - `quiz-submit.js` stores an `Email Summary` teaser
(the same short text that used to go straight to Mailchimp) on every
submission regardless of whether anyone ever gives an email. If they later
use the "email me my results + 10% off" form on results.html,
`api/quiz-capture-email.js` looks the record up by submission ID, reads that
stored teaser back out, and pushes it to Mailchimp then - the first and only
time identity connects to the recommendation for that person, and entirely
their choice whether it happens at all.

## 6. Distress handling (not optional)
Unchanged in substance. Groq classifies free text into none /
general_struggle / crisis and writes only a one-sentence acknowledgment; the
988 crisis-line block and all support links are fixed HTML from
`composeMessage.js`. The two tiers must never be conflated. Test both
deliberately before launch.

## 7. Resolved by Trudy (product-logic pass, August 2026)

1. **Custom cutout + one-sided question — dropped.** Custom cutouts aren't
   offered by the quiz at all; the "is your pain on one side?" question is gone.
2. **Low Profile firmness: bump UP** — reverses the July "no bump." Trudy
   confirmed with a concrete example that the shorter foam needs to be a level
   firmer to support the same weight. Capped at Firm; never over 200 lb.
3. **Extra Cush min weight 150 → 170**, and it's driven by cushy preference (the
   hard-firm-seat problem only exists at 170+). Firm-preference people only get
   an Extra Cush *nudge* if they have hard-surface pain; unsure people get an
   "offers both" nudge. PN alone doesn't trigger it. It's Extra Firm only.
4. **Simple Soother eligibility broadened + gated** — central-only pain
   (groin/genital/bladder/rectal; perineum & prostate excluded), no
   condition implying wider pain (IC now compatible; prostatitis/vaginismus not),
   duration not long-established. Firmness Medium <140 / Firm 140+ with a cusp
   tiebreak. This is why the Soother now actually shows up.
5. **18" kept in stock** — removed the always-on waitlist note. Squarespace's
   native product-page "notify me" covers any future sell-out.
6. **Sit-bones language corrected** — weight rests on the cushy buttocks, NOT
   the sit bones (which sit just inside the channel, unloaded, so the pudendal
   nerve isn't compressed). Fixed everywhere.

Roadmap note (not built): Trudy wants a **2.5" Firm Extra Cush** eventually —
only the 3" Extra Firm exists today, so that's all the quiz offers.

## 8. Still open

1. **Product-page consolidation** — fold Low Profile and 18" into the Twin
   Cheeks page as variants (the quiz's two order links assume Twin Cheeks +
   Simple Soother only). Align the variant name "Extra Firm Cushy 3\"" with the
   quiz's "Extra Cush 3\"".
2. **Product-page firmness copy** — make it agree with the quiz so a customer
   never gets two different answers.
3. **Phone number** — after launch, replace call/contact prompts on product
   pages with the quiz link; keep the number on the contact page only.
4. **Soother/space gate + "not sure" size nudge (§3)** — implemented August
   2026 from Chrisie's own read of the gap (Soother is one-size, so it
   shouldn't be offered to someone who confidently needs the 18"), not yet
   run past Trudy. Logic and copy are live and tested; flag if she wants the
   thresholds (which weight buckets count as "heavier," whether thigh pain
   alone should be enough) adjusted.
