# Medicare LCD policy texts (verbatim)

Public-domain text from Medicare Local Coverage Determinations (LCDs), copied from the CMS
Medicare Coverage Database (MCD). There is one JSON file per policy version. Every
`sections[].text` is taken from the LCD's **Coverage Indications, Limitations, and/or Medical
Necessity** field, and every `criteria[].quote` is an exact substring of the section it names.

Retrieved 2026-11-14.

| File | LCD | Version | Effective | Ends / retired | Source |
|---|---|---|---|---|---|
| `L33822-current.json` | L33822 Glucose Monitors | v70 (current) | 2024-10-01 | none | https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=33822&ver=70 (API: https://api.coverage.cms.gov/v1/data/lcd?lcdid=33822&ver=70) |
| `L33822-2023-01.json` | L33822 Glucose Monitors | v48 (historical) | 2023-01-01 | revision ended 2023-04-15 | https://localcoverage.cms.gov/mcd_archive/view/lcd.aspx?lcdInfo=33822:48 |
| `L33822-2020.json` | L33822 Glucose Monitors | v26 (historical) | 2020-01-01 | revision ended 2021-07-17 | https://localcoverage.cms.gov/mcd_archive/view/lcd.aspx?lcdInfo=33822:26 |
| `L33718-current.json` | L33718 Positive Airway Pressure (PAP) Devices for the Treatment of Obstructive Sleep Apnea | v52 (current) | 2024-01-01 | none | https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=33718&ver=52 (API: https://api.coverage.cms.gov/v1/data/lcd?lcdid=33718&ver=52) |
| `L38801-current.json` | L38801 Facet Joint Interventions for Pain Management (Noridian JE + JF) | v23 (current) | 2026-04-16 | none | https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=38801&ver=23 (API: https://api.coverage.cms.gov/v1/data/lcd?lcdid=38801&ver=23) |
| `L38803-retired.json` | L38803 Facet Joint Interventions for Pain Management (Noridian JF) | v17 (retired) | 2025-07-17 | retired 2026-04-16 | https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=38803&ver=17 (API: https://api.coverage.cms.gov/v1/data/lcd?lcdid=38803&ver=17) |

Revision-history wording in `revision_notes` comes from
`https://api.coverage.cms.gov/v1/data/lcd/revision-history?lcdid=<id>&ver=<ver>`.

## Things to know before using these

- **The current L33822 effective date is not when the CGM rules changed.** Version 70's revision
  effective date is 10/01/2024, but that revision only updated the A4271 code description. The
  current CGM criteria wording ("insulin-treated" or "problematic hypoglycemia", plus in-person or
  Medicare-approved telehealth visits) has applied since 04/16/2023.
- **The L33822 history has three stages:**
  - v26, through 07/17/2021: testing four or more times a day with a BGM, plus three or more
    daily insulin *injections* or a *Medicare-covered* CSII pump.
  - v31 to v48, 07/18/2021 to 04/15/2023: no testing requirement, but still three or more daily
    *administrations* or a CSII pump.
  - v55 and later, from 04/16/2023: any insulin treatment, or problematic hypoglycemia.

  The exact wording of each revision is in `revision_notes`. In the MCD Archive, versions 27 to 30
  do not exist, so v26 is the version that was in force before 07/18/2021.
- **v26 wording differs from common paraphrases.** It says "has been using a BGM and performing
  frequent (four or more times a day) testing". It does not say "blood glucose monitor (BGM)". It
  says "daily injections of insulin or a Medicare-covered continuous subcutaneous insulin infusion
  (CSII) pump". The wording "administrations" only appears from 07/18/2021.
- **L33718 says "in-person", not "face-to-face".** The 01/01/2020 revision replaced "face-to-face"
  with "in-person" (see `revision_notes`). The "12 week trial" wording appears only in the
  re-qualification paragraph.
- **L38803 is retired.** It was retired on 04/16/2026 and merged into L38801, which now covers both
  Noridian JE and JF. Use `L38801-current.json` for current dates of service.
  `L38803-retired.json` is kept so lookups by the old ID still work.
- **The facet LCD has no 4-week conservative-care rule.** The criterion actually reads "Pain
  present for minimum of 3 months with documented failure to respond to noninvasive conservative
  management (as tolerated)".
- **Published typography is kept as-is.** This includes curly quotes and apostrophes (’ “ ”), en
  dashes (–), `≥` and `<`. A verifier that compares model output to this text should normalize
  quotes, dashes and whitespace on both sides before testing for a substring. Superscript citation
  numbers in L38801/L38803 appear inline (for example "facet injections.1").
- **Section s7 of the facet files is not one contiguous block.** It is a selection of Definitions
  entries. Each paragraph is verbatim, and they are joined with a blank line. Every other section
  is one contiguous slice of the source text.

## How the text was produced and verified

1. **Fetching.** Current versions were fetched from the CMS Coverage API (`/v1/data/lcd`, using
   the bearer token from `/v1/metadata/license-agreement`). The live MCD page was also fetched for
   each one. Historical L33822 versions came from the CMS MCD Archive (`localcoverage.cms.gov`),
   from the `lblCoverageIndication` element.
2. **Converting HTML to text.** The conversion keeps every character of the source. It only
   collapses whitespace, as a browser does, and writes out list markers (`1.`, `A.`, `a.`, `i.`,
   `I.`, `-`) from the HTML list types and `start` values.
3. **Character check.** After stripping whitespace and the added list markers, the converted text
   was checked against the source HTML's text, character for character. All six sources matched.
4. **Cross-source check.** For each current LCD, the text converted from the API was compared with
   the text converted from the live MCD page. They were identical for L33822, L33718, L38801 and
   L38803.
5. **Section check.** Each `sections[].text` was checked to be a contiguous slice of the converted
   source (or, for facet s7, a set of verbatim paragraphs).
6. **Quote check.** A Node script checked that each `criteria[].quote` is an exact substring of
   its section. All 93 quotes passed. To re-run the quote check:

```sh
node -e 'const fs=require("fs"),p="src/data/policies/";let bad=0;for(const f of fs.readdirSync(p).filter(f=>f.endsWith(".json"))){const d=JSON.parse(fs.readFileSync(p+f,"utf8"));const s=Object.fromEntries(d.sections.map(x=>[x.id,x.text]));for(const c of d.criteria)if(!(s[c.section]||"").includes(c.quote)){bad++;console.log(f,c.id)}}console.log(bad?"FAIL":"OK")'
```

## Fields

The required schema is `id`, `title`, `type`, `contractor`, `version_label`, `effective_date`,
`retired_date`, `source_url`, `retrieved`, `sections[]`, `criteria[]` and `revision_notes[]`.

Some fields were added:

- `version_number`
- `original_effective_date`
- `revision_ending_date`, the last day a historical version was in force
- `source_api_url`
- `verbatim`, which is `true` in every file
- `notes`
- `related_policy_article`
- `revision_history_source`
- `criteria[].number`, the criterion's numbering in the LCD
- `replaces` / `replaced_by`, which link L38801 and L38803
