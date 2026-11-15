// Synthetic demo cases. All patients, plans, providers and IDs are FICTIONAL.
// Policy text comes from real public CMS LCDs (see src/data/policies).

export interface SeedCase {
  id: string
  title: string
  subtitle: string
  familyId: string
  hero?: boolean
  denialText: string
  chartTitle: string
  chartText: string
  amount: number
  payer: string
  noticeDate: string
}

const mariaDenial = `SUNRISE HEALTH PLAN
Sunrise Senior Advantage (HMO) - a Medicare Advantage plan
P.O. Box 4410, Oakland, CA 94612

NOTICE OF DENIAL OF MEDICAL COVERAGE

Date of notice: October 6, 2026

Member: Maria Delgado
Member ID: SSA-88214077
Requesting provider: Dr. Priya Raman, MD - Bayview Endocrine Associates

Service requested: Continuous glucose monitor (Dexcom G7) with supplies
HCPCS: E2103 Non-adjunctive CGM receiver; A4239 Supply allowance for non-adjunctive CGM, 1 month
Diagnosis: E11.649 Type 2 diabetes mellitus with hypoglycemia without coma; Z79.4 Long term (current) use of insulin
Requested date of service: September 29, 2026
Amount: $1,284.00

We have denied your request for the service listed above.

Why we denied your request:
The requested continuous glucose monitor is not medically necessary. The member does not meet coverage criteria because the member is not performing blood glucose testing four or more times per day, and the member is not insulin-treated with multiple (three or more) daily administrations of insulin or a continuous subcutaneous insulin infusion pump. Per plan clinical guidelines, a CGM is covered only for members on intensive insulin therapy.

This decision was made by the Sunrise Health Plan Utilization Management department.

You have the right to ask Sunrise Senior Advantage to reconsider this decision. You must ask for a reconsideration within 65 calendar days from the date of this notice. If you or your doctor believe that waiting for a standard decision could seriously harm your health, you can ask for a fast (expedited) decision.`

const mariaChart = `BAYVIEW ENDOCRINE ASSOCIATES - PROGRESS NOTES
Patient: Maria Delgado   DOB: 03/14/1959   MRN: BEA-204417

--- Office visit 03/02/2019 (Dr. L. Chen) ---
Type 2 diabetes, diagnosed 2011. Managed with metformin 1000 mg twice daily.
Not on insulin at this time.
Fingerstick glucose testing 1-2 times daily.

--- Emergency department summary 08/30/2026 (Alameda General) ---
Arrived by ambulance. Point-of-care glucose 41 mg/dL.
Patient was confused and diaphoretic; husband found her unresponsive to questions and called 911.
Paramedics administered IV dextrose; mental status returned to baseline after treatment.
Assessment: Level 3 hypoglycemia requiring third-party assistance.

--- Office visit 09/15/2026, in person (Dr. Priya Raman, MD) ---
Chief complaint: follow-up after severe hypoglycemia; evaluation of diabetes control and need for CGM.
History: Type 2 diabetes mellitus since 2011, A1c 8.4% on 09/01/2026.
Current regimen: insulin glargine 22 units subcutaneously once daily at bedtime; metformin 1000 mg twice daily.
Patient checks fingerstick glucose twice daily (fasting and bedtime).
Reports two additional episodes of glucose below 54 mg/dL in September despite reducing glargine from 26 to 22 units.
Family history: mother with type 1 diabetes, used an insulin pump.
Exam: alert, oriented, no acute distress. Monofilament sensation intact bilaterally.
Assessment: E11.649 Type 2 DM with hypoglycemia without coma; Z79.4 long-term insulin use.
Plan: Prescribe Dexcom G7 CGM for non-adjunctive use in accordance with its FDA indications for use.
Plan: Patient and husband trained on CGM alerts; continue glargine 22 units; follow up in person in 3 months.

--- Order 09/22/2026 ---
Dexcom G7 CGM system (E2103) and monthly supplies (A4239). Ordering practitioner: Dr. Priya Raman, MD.`

const jamesDenial = `EVERGREEN HEALTH
Evergreen Medicare Advantage PPO
1200 Pine Street, Seattle, WA 98101

ORGANIZATION DETERMINATION - DENIAL

Notice date: October 20, 2026

Enrollee: James Whitaker
Enrollee ID: EVG-55102938
Provider: Northgate Sleep Center - Dr. Samuel Okafor, DO

Item requested: CPAP device (E0601) with heated humidifier (E0562)
Diagnosis: G47.33 Obstructive sleep apnea (adult)
Date of service: October 14, 2026
Amount: $1,860.00

Your request has been denied.

Reason for denial:
The medical records do not document a face-to-face clinical evaluation by the treating practitioner prior to the sleep test. In addition, the apnea-hypopnea index (AHI) of 12.4 events per hour does not meet the required threshold of greater than or equal to 15 events per hour.

Reviewed by: Clinical Review Team, Evergreen Health.

You may request a reconsideration of this decision. Your request must be received within 65 days of the date of this notice.`

const jamesChart = `NORTHGATE SLEEP CENTER - CLINICAL RECORD
Patient: James Whitaker   DOB: 06/02/1968   MRN: NSC-88310

--- New patient visit 07/28/2026, in person (Dr. Samuel Okafor, DO) ---
Reason for visit: loud snoring, witnessed apneas, daytime fatigue.
Face-to-face clinical evaluation performed prior to sleep testing.
Epworth Sleepiness Scale score 14 (excessive daytime sleepiness).
Patient reports falling asleep while reading and during afternoon meetings.
BP 148/92. History of hypertension, on lisinopril 20 mg daily.
BMI 33.1, neck circumference 17.5 in, Mallampati IV.
Plan: home sleep apnea test (HSAT), Type III device.

--- Home sleep apnea test 08/12/2026 (interpreted by Dr. Okafor, board-certified in sleep medicine) ---
Total recording time 7.2 hours. AHI 12.4 events per hour. Oxygen nadir 84%.
Interpretation: mild obstructive sleep apnea.

--- Follow-up visit 09/30/2026 ---
Discussed results; patient wishes to start PAP therapy.
Patient and spouse educated on CPAP use, mask fitting, and humidifier care.
Order: CPAP E0601 with heated humidifier E0562, pressure 6-14 cm H2O auto.

--- Unrelated note 05/11/2024 ---
Brother diagnosed with severe obstructive sleep apnea, AHI 42.`

const lindaDenial = `HARBOR POINT HEALTH
Harbor Point Medicare Advantage (HMO-POS)
88 Harbor Blvd, San Diego, CA 92101

NOTICE OF MEDICARE DENIAL OF MEDICAL COVERAGE

Date: October 28, 2026

Member: Linda Park
Member ID: HPH-30177261
Provider: Coastal Spine & Pain - Dr. Elena Vasquez, MD

Service requested: Lumbar facet joint medial branch block, L4-L5 and L5-S1, right (CPT 64493, 64494)
Diagnosis: M47.816 Spondylosis without myelopathy or radiculopathy, lumbar region
Date of service: November 3, 2026
Amount: $2,450.00

We have denied coverage for this service.

Reason: Documentation does not demonstrate failure of conservative treatment. The medical record does not show that the member has had pain for at least 6 months, and does not show completion of 12 weeks of physical therapy.

A physician reviewer made this decision.

You have the right to request a reconsideration within 65 calendar days of the date of this notice.`

const lindaChart = `COASTAL SPINE & PAIN - PHYSICIAN NOTES
Patient: Linda Park   DOB: 11/20/1956   MRN: CSP-55018

--- Initial consult 08/04/2026 (Dr. Elena Vasquez, MD) ---
Axial low back pain, right greater than left, for 5 months (onset March 2026).
Pain is worse with extension and rotation; no radiation below the knee.
Pain intensity 7/10 on the numeric rating scale.
No neurologic deficits; straight leg raise negative bilaterally.
No signs of radiculopathy or neurogenic claudication.
Imaging: MRI lumbar spine 06/20/2026 shows facet arthropathy at L4-L5 and L5-S1, no stenosis.

--- Conservative care summary ---
Physical therapy 05/01/2026 - 06/26/2026 (8 weeks, home exercise program), no meaningful improvement.
Naproxen 500 mg twice daily for 10 weeks with minimal relief; chiropractic care declined.

--- Follow-up 10/13/2026 ---
Persistent axial pain 7/10; interferes with walking more than 15 minutes and with sleep.
Plan: diagnostic medial branch block, right L4-L5 and L5-S1.

--- Note 01/09/2025 ---
Left knee pain after a fall; resolved with rest.`

export const HERO_CASES: SeedCase[] = [
  {
    id: 'maria-cgm', hero: true, familyId: 'L33822',
    title: 'Maria Delgado — Dexcom G7 CGM',
    subtitle: 'Denied with rules CMS retired in 2021 and 2023',
    denialText: mariaDenial, chartTitle: 'Bayview Endocrine — progress notes', chartText: mariaChart,
    amount: 1284, payer: 'Sunrise Senior Advantage', noticeDate: '2026-10-06',
  },
  {
    id: 'james-cpap', hero: true, familyId: 'L33718',
    title: 'James Whitaker — CPAP for sleep apnea',
    subtitle: 'Plan ignored the AHI 5–14 + symptoms pathway',
    denialText: jamesDenial, chartTitle: 'Northgate Sleep Center — clinical record', chartText: jamesChart,
    amount: 1860, payer: 'Evergreen Medicare Advantage', noticeDate: '2026-10-20',
  },
  {
    id: 'linda-facet', hero: true, familyId: 'L38801',
    title: 'Linda Park — lumbar medial branch block',
    subtitle: 'Plan demanded 6 months of pain and 12 weeks of PT',
    denialText: lindaDenial, chartTitle: 'Coastal Spine & Pain — physician notes', chartText: lindaChart,
    amount: 2450, payer: 'Harbor Point Medicare Advantage', noticeDate: '2026-10-28',
  },
]

// --------------------------------------------------------------------------
// Worklist generator: deterministic synthetic inbox built from the hero templates.
const FIRST = ['Ana', 'Robert', 'Grace', 'Luis', 'Helen', 'Marcus', 'Joy', 'Walter', 'Priya', 'Thomas', 'Mei', 'Frank', 'Rosa', 'Daniel', 'Ruth', 'Kenji', 'Carmen', 'Earl', 'Fatima', 'George', 'Irene', 'Victor']
const LAST = ['Morales', 'Bennett', 'Okoye', 'Ramirez', 'Sullivan', 'Hayes', 'Nguyen', 'Brooks', 'Iyer', 'Keller', 'Lin', 'Ortega', 'Diaz', 'Foster', 'Coleman', 'Sato', 'Reyes', 'Price', 'Hassan', 'Ward', 'Novak', 'Castillo']
const PLANS: [string, string][] = [
  ['SUNRISE HEALTH PLAN', 'Sunrise Senior Advantage (HMO)'],
  ['EVERGREEN HEALTH', 'Evergreen Medicare Advantage PPO'],
  ['HARBOR POINT HEALTH', 'Harbor Point Medicare Advantage (HMO-POS)'],
  ['GOLDEN MESA HEALTH', 'Golden Mesa Medicare Advantage (HMO)'],
  ['NORTHSTAR CARE', 'NorthStar Medicare Advantage Choice (PPO)'],
]

function seeded(i: number) { let x = Math.sin(i * 9301 + 49297) * 233280; return x - Math.floor(x) }
function iso(base: string, plusDays: number) { const d = new Date(base + 'T12:00:00'); d.setDate(d.getDate() + plusDays); return d.toISOString().slice(0, 10) }
function longDate(s: string) { return new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) }

export function generateWorklist(n = 22): SeedCase[] {
  const out: SeedCase[] = []
  for (let i = 0; i < n; i++) {
    const tpl = HERO_CASES[i % 3]
    const first = FIRST[i % FIRST.length], last = LAST[(i * 7) % LAST.length]
    const name = `${first} ${last}`
    const [payer, plan] = PLANS[Math.floor(seeded(i) * PLANS.length)]
    const notice = iso('2026-09-20', Math.floor(seeded(i + 3) * 50))
    const amount = Math.round((tpl.amount * (0.7 + seeded(i + 5) * 0.9)) / 10) * 10
    const memberId = `${payer.slice(0, 3)}-${String(10000000 + Math.floor(seeded(i + 9) * 89999999))}`
    const swapName = (t: string, oldName: string) => t.split(oldName).join(name).split(oldName.split(' ')[0]).join(first)
    const oldName = tpl.title.split(' — ')[0]
    let denialText = swapName(tpl.denialText, oldName)
    const lines = denialText.split('\n')
    lines[0] = payer; lines[1] = plan
    denialText = lines.join('\n')
      .replace(/(Date of notice|Notice date|Date): [A-Za-z]+ \d+, 2026/, `$1: ${longDate(notice)}`)
      .replace(/(Member|Enrollee) ID: [A-Z]+-\d+/, `$1 ID: ${memberId}`)
      .replace(/Amount: \$[\d,]+\.00/, `Amount: $${amount.toLocaleString('en-US')}.00`)
    const chartText = swapName(tpl.chartText, oldName)
    out.push({
      id: `wl-${i + 1}`, familyId: tpl.familyId,
      title: `${name} — ${tpl.title.split(' — ')[1]}`,
      subtitle: plan, denialText, chartTitle: tpl.chartTitle, chartText,
      amount, payer: plan, noticeDate: notice,
    })
  }
  return out
}
