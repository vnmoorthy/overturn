# Overturn — hackathon submission kit

Everything the Berkeley × DeepMind form asks for, ready to paste.

| Field | Value |
|---|---|
| Track | **Google AI Studio** (Online Track) — all intelligence runs on the Gemini API via an AI Studio key |
| Hosted prototype | https://vnmoorthy.github.io/overturn/ |
| Code repository | https://github.com/vnmoorthy/overturn |
| Pitch deck | [`deck/Overturn-pitch-deck.pptx`](../deck/Overturn-pitch-deck.pptx) · storyboard [`deck/STORYBOARD.md`](../deck/STORYBOARD.md) |

---

## One-pager: the team

> *Fill in before submitting — judges weigh pedigree.*

**Team:** _Your name(s), role(s)_
**Pedigree:** _school / prior companies / relevant experience (healthcare, billing, AI, startups)_
**Why us:** _one sentence on your unfair insight into denials (personal experience, family, prior work)_
**Contact:** _email · LinkedIn · GitHub: @vnmoorthy_

---

## One-pager: the idea and prototype

**Overturn quotes the insurer’s own rulebook back at them.**

**Problem.** In 2023, Medicare Advantage plans denied 3.2 million prior-authorization requests. Only 11.7% were appealed — yet 81.7% of appeals were overturned (KFF). Roughly 2.8 million denials a year go unchallenged because building an appeal is a research job: find the governing coverage policy, find the version in effect on the date of service, match each criterion to the chart, and quote both precisely. Meanwhile denials routinely cite requirements Medicare retired years ago, or criteria that exist in no policy — even though MA plans are legally bound to Medicare’s criteria (42 CFR § 422.101(b)).

**Solution.** Drop in a denial letter and chart notes (PDF, scan or phone photo). In about two minutes Overturn:
1. reads the denial (Gemini 3.8 Flash, multimodal, strict JSON schema);
2. routes to the governing CMS LCD and pins the version in effect on the date of service (real, verbatim CMS text, every archived version);
3. matches every criterion to a specific chart line in one long-context pass (Gemini 4 Hydrogen);
4. verifies every quote twice — **Key 1:** deterministic exact-match provenance; **Key 2:** an independent Gemini auditor checking the evidence truly supports the criterion (catches wrong date, wrong side, negation, wrong person);
5. runs a deterministic compliance engine: retired requirements (policy time-travel), criteria found in no version (§ 422.101(b)(6)), ignored alternative pathways, record contradicts the denial, missing specific reasons, reviewer credentials, the 65-day deadline;
6. drafts a token-cited appeal the model cannot fabricate quotes in; a human signs; a fax-ready PDF with verbatim exhibits exports only when every gate is green.

Plus: **P2P rehearsal** with Gemini 3.8 Live playing the plan’s medical director; a **patient view** in English/Spanish read aloud by Gemini TTS; **honest odds** from 42,710 real independent medical reviews (CA DMHC) with similar cases via Gemini Embedding 2; a **worklist** ranked by dollars × odds with per-payer playbooks; a **SHA-256 hash-chained audit trail**.

**Google tools used.** Gemini API via Google AI Studio key — `gemini-4-hydrogen`, `gemini-3.8-flash`, `gemini-3.5-flash`, `gemini-3.8-live` (Live API, real-time voice), `gemini-3.8-flash-tts`, `gemini-embedding-2`; `@google/genai` SDK (structured outputs with `responseJsonSchema`, thinking levels, Live API). Every call runs through per-task model fallback chains. Production path: Cloud Run + Gemini on Vertex AI under a Google Cloud BAA.

**Business.** Independent specialty practices and the billing/RCM firms that serve them. $12 per verified appeal or 10–15% contingency on recovered dollars; ~$0.10–0.40 inference per appeal → >90% gross margin. Moat: a versioned graph of coverage policies plus every biller decision and outcome — a system of judgment that compounds into per-payer playbooks. Raising $1.5M seed.

**Status.** Working end-to-end prototype, deployed for $0 on GitHub Pages. Three demo cases with real CMS policy text and synthetic patients; any new denial for CGMs, PAP devices or facet-joint procedures runs live.

---

## 2-minute pitch video — script (team intro + elevator pitch)

| Time | Shot | Line |
|---|---|---|
| 0:00 | Face to camera | “Hi, I’m ___. In 2023, Medicare Advantage plans denied 3.2 million requests for care. Fewer than one in eight was appealed — and four out of five appeals won.” |
| 0:15 | Slide 2 (Maria card) | “Maria, 67, was denied a glucose monitor after an ambulance ride for a blood sugar of 41 — because she didn’t test four times a day. Medicare deleted that rule in 2021.” |
| 0:30 | Face to camera | “The rulebook is public, and these plans are legally bound to it. Nobody has time to read it. So we built Overturn.” |
| 0:40 | Screen: workspace run | “Six Gemini agents read the denial, find the exact Medicare policy version, match every criterion to the chart, and verify every quote twice — then draft the appeal.” |
| 1:00 | Screen: findings + time-travel | “For Maria it found two retired rules and one that exists in no policy at all.” |
| 1:15 | Screen: tamper test | “And it can’t hallucinate: change one word in a quote and the export locks.” |
| 1:30 | Slide 8 | “We sell to independent practices and billing firms — twelve dollars an appeal, over ninety percent margin.” |
| 1:45 | Face to camera | “About 2.8 million denials a year go unfought. Overturn answers every one — in the insurer’s own words.” |

## 1-minute demo video (“Playcast”) — shot list

Vertical-friendly, captions burned in, hook in the first 2 seconds (this runs as a paid social ad).

| Time | Screen | Caption |
|---|---|---|
| 0:00 | Denial letter with red **DENIED** stamp | “Her insurer denied this using a rule Medicare deleted in 2021.” |
| 0:04 | Click **Overturn a denial live**; agent rail lights up step by step | “Watch AI read the denial, the policy and her chart.” |
| 0:14 | **OVERTURN IT** stamp lands | “2 retired rules. 1 rule that doesn’t exist. 12 quotes verified.” |
| 0:20 | Policy time-travel modal — struck-through rule | “Here’s the receipt: removed July 18, 2021.” |
| 0:28 | Evidence board — policy sentence ↔ chart line glow | “Every claim, side by side with the source.” |
| 0:36 | Tamper → red, export locked | “Change one word? It refuses to send.” |
| 0:44 | Letter signed → fax PDF | “A signed appeal in two minutes.” |
| 0:52 | Overview stats | “2.8 million denials a year go unfought. Overturn them.” |
| 0:58 | Logo + URL | vnmoorthy.github.io/overturn |
