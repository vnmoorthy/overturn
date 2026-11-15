# Overturn — 3-minute pitch storyboard

**Deck:** [`Overturn-pitch-deck.pptx`](Overturn-pitch-deck.pptx) (10 slides, Morph transitions, auto-playing staggered entrances — just press → once per slide).
**Pace:** ~150 words/minute. The script below is ~440 words. Bold = land it, pause after.
**Setup before you start:** open the deck in Slideshow mode on one screen; on a second tab have **https://vnmoorthy.github.io/overturn/#/case/maria-cgm** loaded (or `npm run dev`) in case judges ask for live proof.

| # | Time | Slide | What appears (motion) | What you say (verbatim) |
|---|---|---|---|---|
| 1 | **0:00 – 0:15** | **Title** — “Insurers deny care with rules *they’re not allowed to use.*” | Logo morphs in; headline fades up; denial-letter art zooms in with the green **OVERTURN IT** stamp; model chips cascade. | “In 2023, Medicare Advantage plans denied **3.2 million** requests for care. Insurers are denying care with rules **they’re not even allowed to use.** We built Overturn to quote their own rulebook back at them.” |
| 2 | **0:15 – 0:35** | **The problem** — “2.8 million denials a year *nobody fights*” | The three stats zoom in one by one (red → amber → green), then Maria’s story card fades up. | “Only **11.7%** of those denials were ever appealed — and when people did appeal, **82% won.** That’s about 2.8 million denials a year nobody fought. Meet Maria: 67, ambulance ride, blood sugar of 41 — and her plan denied her glucose monitor because she didn’t test four times a day. **Medicare deleted that rule in 2021.**” |
| 3 | **0:35 – 0:52** | **The insight** — “The rulebook is public. *Nobody has time to read it.*” | Three icon rows cascade; the policy time-travel screenshot slides in with the struck-through rule. | “Here’s the thing: the rules are public. Medicare Advantage plans are **legally bound** to Medicare’s coverage policies. But proving it means finding the right policy, the right version for the date of service, and quoting it against the chart. That’s an hour per appeal. Nobody has it.” |
| 4 | **0:52 – 1:10** | **The product** — “Six agents. Two minutes. *One verified appeal.*” | Six cards fade up left-to-right, top-to-bottom, each with its Gemini model. | “Overturn is six agents on Gemini. It reads the denial, finds the governing policy version, matches every criterion to a line in the chart, **verifies every quote twice**, checks the plan’s compliance, and drafts a signed appeal — in about two minutes.” |
| 5 | **1:10 – 1:40** | **Live demo** — “They denied her with a rule *CMS retired in 2021*” | Findings screenshot frames in; the three callouts zoom: **3** violations · **12/12** quotes verified · **6/6** criteria met. | “This is Maria’s real run. Gemini 4 read the policy, all three of its historical versions, and her chart in one pass. Two of the plan’s requirements were **retired by CMS** — in 2021 and 2023. The third appears in **no version of the policy at all.** And her chart meets all six criteria that actually apply — every quote verified verbatim.” *(Optional: switch to the app tab and click **Policy time-travel**.)* |
| 6 | **1:40 – 2:02** | **Trust** — “No unverified sentence *leaves the building*” | Four trust rows cascade; the tamper screenshot slides in with the red “Key 1 failed” banner. | “Healthcare can’t run on hallucinations. Key one is plain code: every quote must exist word-for-word in its source — **change one word and the export locks.** Key two is a skeptical Gemini auditor that catches real-but-wrong evidence, like her *mother’s* diabetes. Code decides every flag, a human signs, and everything is **hash-chained.**” |
| 7 | **2:02 – 2:15** | **Built on Gemini, end to end** | Model table fades in row by row; architecture diagram zooms; “Never breaks on stage” card. | “It’s Gemini end to end — 4 Hydrogen for long context, 3.8 Flash for multimodal intake, **3.8 Live** to rehearse the peer-to-peer call with the plan’s medical director, TTS for patients in English and Spanish — with fallback chains so it never breaks on stage.” |
| 8 | **2:15 – 2:35** | **Business** — “Software margins on *recovered revenue*” | Three metric cards zoom; the overturn-rate bar chart draws in. | “Our buyers are independent specialty practices and the billing firms that serve them. **Twelve dollars a verified appeal**, or 10–15% of recovered dollars. Inference costs cents — **over 90% gross margin.** And the public data is on our side: independent reviewers overturn **78%** of glucose-monitor denials.” |
| 9 | **2:35 – 2:47** | **Moat** — “Others write letters. *We prove them.*” | Comparison table fades in; Overturn’s green column reads first. | “Others generate letters. **We prove them** — compliance violations, double-verified quotes, policy time-travel. And every win and loss compounds into per-payer playbooks no template tool will ever have.” |
| 10 | **2:47 – 3:00** | **Ask** — “Every denial deserves an answer. *In the insurer’s own words.*” | Closing line zooms; milestones cascade; QR code to the live demo zooms in last. | “We’re raising a lean **$1.5 million seed**: ten billing firms, five thousand appeals, and a BAA-covered Vertex AI deployment in twelve months. Every denial deserves an answer — **in the insurer’s own words.** Scan the code and overturn one yourself. Thank you.” |

**If you’re short on time:** merge slides 7 into 6 (“…and it’s Gemini end to end, with fallback chains so it never breaks.”) and skip slide 9’s second sentence. That buys 20 seconds.

---

## The 5-minute Q&A — likely questions and crisp answers

| Question | Answer |
|---|---|
| **“Isn’t this just RAG / a letter generator? Epic and Waystar do letters.”** | “They generate letters. We prove them. Overturn finds the plan’s own compliance violations — retired rules, criteria that exist in no policy, ignored pathways — and every quote passes two independent checks before export. No one else time-travels the policy to the date of service.” |
| **“What if the model hallucinates a quote?”** | “It can’t ship. The model isn’t allowed to type quotations — it emits citation tokens we expand from verified text. Key 1 is deterministic exact-match code; if one word is off, the row turns red and export locks. You can try it: the **Tamper** button.” |
| **“Why Medicare Advantage first?”** | “Because the rulebook is legally binding there — 42 CFR 422.101(b) — and public. 3.2 million denials a year, 82% overturn rate on appeal, 65-day deadline. Then commercial plans with public clinical policy bulletins.” |
| **“How do you know your odds are right?”** | “We don’t invent them. We show the real overturn rate from 42,710 California independent medical reviews, with n on screen, labeled as a public prior until our own outcome data replaces it.” |
| **“HIPAA?”** | “The demo is synthetic data, browser-only. Production runs Gemini on Vertex AI under a Google Cloud BAA, with the key server-side on Cloud Run, and SOC 2 Type I in year one.” |
| **“Who pays and why now?”** | “Independent practices and billing firms, per appeal or on contingency. Why now: CMS-4201-F (2024) binds MA plans to Medicare criteria and forces internal criteria public; CMS-0057-F requires specific denial reasons from 2026; and long-context models can finally read a full policy history and cite it verifiably.” |
| **“What’s the moat?”** | “A versioned graph of every coverage policy plus every biller decision and outcome — a system of judgment that gets sharper per payer with each appeal.” |
| **“Does the voice rehearsal really work?”** | “Yes — open P2P rehearsal: Gemini 3.8 Live plays the plan’s medical director and only concedes when you cite the governing criterion and the chart evidence.” |

---

## 10-minute live demo — run of show

Use **https://vnmoorthy.github.io/overturn/** (or `npm run dev`). If the free tier is slow, press **Instant replay** — it replays a genuine recorded Gemini run and is labeled “cached run”.

| Time | Do | Say |
|---|---|---|
| 0:00 | **Overview** → point at 3.2M / 11.7% / 81.7%. | The problem in three numbers. |
| 0:45 | Click **Overturn a denial live** (Maria). Open **Agent trace** (sidebar) so the room watches every Gemini call and any automatic fallback. | “Six agents, live, on the free tier.” |
| 2:15 | The **OVERTURN IT** stamp lands. Read the green banner: 6/6 criteria, 12 quotes, 3 violations. | |
| 2:30 | **What the plan said** card → two requirements marked *retired*, one *not in any version*. Click **Policy time-travel**. | “CMS deleted this rule in July 2021. The plan still uses it.” |
| 3:30 | **Evidence board** → click *Insulin-treated*: policy sentence and chart line 18 glow side by side. | “Every claim has two receipts.” |
| 4:15 | Click **Tamper a quote** → red, export locked, closest-sentence diff. **Restore.** Click **Swap evidence** → Key 2: “different person” (her mother). **Restore.** | “Change one word and it refuses to ship.” |
| 5:30 | **Findings** tab — violations with regulation citations; deadline countdown. | “Code decides every flag. The biller confirms.” |
| 6:15 | **Confirm all verified** → **Appeal letter** → point at green quotes → sign → **Export fax-ready PDF**. | “A human signs. Nothing leaves unverified.” |
| 7:15 | **Patient view** → Español → **Listen**. | “Maria hears it in her language.” |
| 7:45 | **P2P rehearsal** → Start call → argue with the medical director (cite L33822 and chart line 13). | “Gemini Live plays the plan’s doctor.” |
| 9:00 | **Worklist** → $ in queue, expected recoverable, payer playbook. **Audit trail** → Verify chain → Simulate tamper → red. | “Every decision is hash-chained.” |
| 9:45 | Back to **Overview**. | “Every denial deserves an answer — in the insurer’s own words.” |

**Backups:** James (CPAP — ignored the AHI 5–14 pathway) and Linda (facet — demanded 6 months / 12 weeks that no LCD requires) are one click away on the Overview.
