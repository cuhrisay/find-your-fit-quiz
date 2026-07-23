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

## 2. The flow (13 screens, down from 16)

Removed in this revision: the standalone hard-seat-pain question (merged into
pain locations), "what have you already tried" (data-only, cut for friction),
and "recent surgery/accident" (its routing job is covered by the duration
question). Sex/age and country/state stay — they're skippable, low-friction,
and feed Meta-ads audience data, which is a stated goal of the quiz.

- **Screen 0 — Welcome.** Title, one line of what to expect, start button.
- **Screen 1 — How much do you weigh?** Nine brackets + "It's a gift / I don't
  know their weight" (gift fork → gift-card page, before anything else).
- **Screen 2 — How tall are you?** short / regular / tall.
- **Screen 3 — Where is the pain?** (multi-select) Tailbone, Sit bones,
  Rectal, Perineum, Genitals, Bladder/Urethra, Prostate, Hips, Buttocks,
  **Backs of my thighs / hamstrings** (new — carries the old hard-seat
  signal), Groin, Not sure/it changes.
- **Screen 4 — How long has this been going on?** Also drives the temporary
  Soother framing (under a month).
- **Screen 5 — Is your pain on one side?** Yes → custom-cutout conversation
  note (never a custom purchase recommendation).
- **Screen 6 — Firmer or softer?** Firm / Soft / Depends-not sure. On-screen
  break-in framing in Trudy's voice.
- **Screen 7 — Diagnosis?** (multi-select, optional) Feeds Soother
  disqualification + the AI's validation.
- **Screen 8 — Where will you mainly use it?** (multi-select).
- **Screen 9 — Do you find yourself needing a bigger seat / more space when
  you sit?** Drives 16"/18".
- **Screen 10 — Sex + age range** (optional, one screen) [data/marketing].
- **Screen 11 — Country, then state/region** [data/marketing].
- **Screen 12 — Anything else?** (free text, optional, prominent) — the box
  the AI reads. "Don't worry about being embarrassed — we've heard it all."
- **Screen 13 — Where should we send your results?** First name optional,
  email required. Redirects to results.html.

## 3. Routing tables

### Product
| Condition | Result |
|---|---|
| Pain includes tailbone, sit bones, rectal, hips, buttocks, thighs/hamstrings, groin, perineum, or prostate — or "not sure" | Twin Cheeks |
| Central only (bladder/urethra and/or genital ONLY) with no nerve/muscle-mechanism diagnosis | Simple Soother |
| Central only + duration under a month + no chronic diagnosis | Simple Soother with the **"this may be temporary, start with the lower-cost option"** framing (same product, different message) |
| Central only + a disqualifying diagnosis (pudendal neuralgia, PFD, vaginismus, pelvic girdle pain, endo, coccydynia, IC, prostatitis/CPPS) | Twin Cheeks |
| One-sided pain = Yes | Standard product + the custom-cutout conversation note. Custom is never the primary result. |

Soother results always include the fixed upgrade line: *"If this doesn't feel
like enough, Twin Cheeks is an easy upgrade — just let us know."*

**Soother specs are fixed** (per the live product page): 3" thick, one size,
firmness = Medium at 139 lbs and under, Firm at 140+. A Soother result never
routes through the Twin Cheeks firmness/thickness/size tables — those variants
don't exist on the Soother page.

### Firmness — weight bucket × preference (Twin Cheeks only)
| Weight | Firm pref | Soft pref | Not sure |
|---|---|---|---|
| Under 120 | Medium | Soft | Soft |
| 120–129 | Medium | Medium | Medium |
| 130–139 | Medium Plus | Medium | Medium |
| 140–150 | Medium Plus | Medium | Medium Plus |
| 151–169 | Medium Plus | Medium Plus | Medium Plus |
| 170–180 | Firm | Medium Plus | Medium Plus |
| 181–200 | Firm | Firm | Firm |
| 201–220 | Extra Firm | Firm | Firm |
| Over 220 | Extra Firm | Extra Firm | Extra Firm |

### Hard-seat signal
Selecting **buttocks, hips, or thighs/hamstrings** on the pain question is the
hard-seat-pain signal (the old standalone question is gone).

### Extra Cush 3" (a Twin Cheeks variant: soft top layer over an Extra Firm base)
| Hard-seat pain | Band | Preference | Result |
|---|---|---|---|
| Yes | Firm or Extra Firm | Soft/cushy | **Extra Cush primary** (displayed firmness: Extra Firm — the only fabric it exists in) |
| Yes | Firm or Extra Firm | Firm or not sure | Keep their firm cushion; **Extra Cush "also consider"** note (the real-world pattern: people order Firm/Extra Firm, find it very firm on sore buttocks/hips/thighs, wish they'd known). Suppressed when car/travel/public use is selected. |
| Yes | Medium or below | any | No Extra Cush mention at all |
| No | any | any | No Extra Cush mention at all |

Extra Cush + travel/car selected → keep Extra Cush, flag the doesn't-fold
tradeoff plainly. Never silently swap; never suggest Low Profile to a
hard-seat-pain sufferer (it wouldn't hold up for them — mentioning it only
adds confusion).

### Thickness (Twin Cheeks)
| Trigger | Result |
|---|---|
| Default (including car at regular/short height) | Regular 2" |
| Travels often / needs compact | Low Profile 1.5" — **same firmness as Regular, no bump** (confirmed by Trudy directly, July 2026 — see note below). LP only exists in Medium/Medium Plus/Firm. Soft-preference tradeoff flagged (less depth = less give, regardless of firmness label). Band outside LP's range → stay Regular with the "wouldn't hold up" note. |
| Tall (5'11"+) + car | Low Profile 1.5" (same firmness, no bump) |
| Short (5'2"−) + car | Regular + booster-cushion note |
| Hard-seat pain + wants compact | **Regular** — support need beats compactness want; Low Profile never mentioned |
| Size is 18" | Low Profile is **never** available regardless of firmness/travel — 18" only comes in Regular or Extra Cush 3" (confirmed by Trudy). Falls back to Regular with its own note; a Low Profile 16" is offered as a second-cushion companion for the road when travel is also a stated need. |

**Why no bump (Trudy, July 2026, resolving an apparent contradiction with the
call):** on the call she said going shorter needs going firmer for the same
support; asked directly with a concrete example ("Medium Plus Regular — Firm
Low Profile?") she said "the same as the regular cushion." Both are true
because they're describing different things — **thickness** (how much foam
there is to compress into) is what produces perceived softness/give;
**firmness rating** is what prevents bottoming out. Low Profile has less
depth, so it inherently gives less regardless of its firmness label — it
doesn't need a firmer label to compensate, it just has less cushioning. This
is also why Extra Cush is a soft top layer over an *Extra Firm* base (depth
for give, firmness for support), and why hard-seat-pain sufferers stay on
Regular instead of Low Profile — they need depth, not a firmness adjustment.

**Deliberately not implemented:** Trudy also said "a Low Profile Firm may
still work as an Extra Firm" for people under (not over) 220 lbs who'd
otherwise need Extra Firm — a hedged substitute at Low Profile's firmness
ceiling. Given the hedge ("may") and that this is exactly the weight range
most likely to bottom out, the code keeps routing these people to Regular
Extra Firm rather than offering the uncertain Low Profile substitute. Worth
knowing about, not worth the added complexity.

### Size
| Trigger | Result |
|---|---|
| "Yes, I need more space" | 18" — trusted, with a light gut-check note + the stay-in-place/extra-inch explanation + waitlist copy |
| Anything else | 16". Wheelchair/recliner + heavier build → "double-check whether your seat runs wide" note. |

### Second cushion — only when uses genuinely oppose
- 18" + wheelchair + travel → no pairing (the wheelchair travels with them); note only.
- 18" + travel (recliner, or no particular stay-put context) → Low Profile 16"
  pairing suggested if their band allows it — since 18" never comes in Low
  Profile, this is the only way to serve the travel need at all.
- Extra Cush also-consider (table above).
- Everything else → one cushion, no also-consider. One confident answer is the default.

## 4. Result copy — always shown, code-generated
- Break-in: "our cushions come firm and soften over time."
- Returns: 14 days + email-for-extension.
- 18" only: waitlist note + the extra-inch/stay-in-place explanation.
- Every result ends with the guide / blog / provider-directory / support-email block.

## 5. Data log (Airtable)
All structured answers + free text + routed result + composed message. Email
in its own column, kept separable from aggregate pulls (process discipline on
the Airtable side). Removed columns: Hard Seat Pain, What They've Tried,
Recent Events. Sex/age/country/state retained for marketing (Meta ads) stats.

## 6. Distress handling (not optional)
Unchanged in substance. Groq classifies free text into none /
general_struggle / crisis and writes only a one-sentence acknowledgment; the
988 crisis-line block and all support links are fixed HTML from
`composeMessage.js`. The two tiers must never be conflated. Test both
deliberately before launch.

## 7. Resolved by Trudy, July 2026 (written follow-up after the call)

1. **Weight/firmness table** — asked to reconcile the quiz's numbers with the
   site's, Trudy said to leave the site as-is ("we should probably leave it
   the same as the brochure"). Read as: the site's overlapping bands (e.g.
   Medium Plus 130–180, Firm 170–200) are the intentionally loose
   customer-facing display; the quiz's firmness-preference question is
   exactly "how to know when to go up or down" within that overlap. No code
   change — the routing table already does this. The old open item about the
   201–220 lb / Extra Firm mismatch is resolved this way, not by changing the
   number.
2. **Extra Cush is Extra Firm only** — confirmed directly ("The 3" is only
   Extra Firm, Extra Cush"). She'd like a 2.5" Firm Extra Cush eventually —
   noted for the product roadmap, not the current quiz.
3. **Low Profile's real use case** — confirmed: travel, very tall/short
   people, long drives/flights, or people who can't tolerate firmness (who
   need more *depth*, i.e. Regular or Extra Cush, not a thinner cushion).
   Matches the existing hard-seat-pain-stays-on-Regular rule.
4. **Low Profile firmness: no bump** — see the Thickness table above. Directly
   confirmed with a concrete example; this reverses a rule that was
   previously (and reasonably) built from the call transcript.
5. **18" never comes in Low Profile** — "18 is made in regular and 3\" but
   not low profile." Now enforced as a hard availability constraint (see
   Thickness table).

## 8. Still open — awaiting Trudy

1. **Custom-cutout history** — check the real inbox history (cya-inbox-research)
   before permanently locking "never a first purchase."
2. **Product-page consolidation** — fold Low Profile and 18" into the Twin
   Cheeks page as variants (planned; the quiz's two order links — Twin Cheeks
   and Simple Soother — assume this happens before launch). While doing it,
   align variant names with quiz output: the quiz says "Extra Cush 3\"", the
   shop dropdown says "Extra Firm Cushy 3\"" — pick one.
3. **Phone number** — after launch, replace call/contact prompts on product
   pages with the Find Your Fit quiz link; keep the number on the contact
   page only.
