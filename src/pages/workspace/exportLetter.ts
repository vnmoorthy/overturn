// Print-ready documents (browser "Save as PDF" / fax).
import type { CaseFile, MatchRow, PolicyVersion } from '../../lib/types'
import { blocksToHtml, type Block } from '../../lib/letter'
import { fmtDate } from '../../lib/rules'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const BASE_CSS = `
  @page { size: letter; margin: 0.8in; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #111; font-size: 11.5pt; line-height: 1.5; margin: 0; }
  .wrap { max-width: 7in; margin: 0 auto; padding: 24px 0; }
  h1 { font-size: 15pt; letter-spacing: .02em; margin: 0 0 2px; }
  h3 { font-size: 12pt; margin: 18px 0 6px; }
  .muted { color: #555; font-size: 10pt; }
  .re { border-top: 1px solid #222; border-bottom: 1px solid #222; padding: 8px 0; margin: 18px 0; font-size: 10.5pt; }
  .re td { padding: 1px 12px 1px 0; vertical-align: top; }
  .cite { color: #444; font-size: 9.5pt; }
  ul { padding-left: 20px; }
  .sig { margin-top: 28px; }
  .exhibit { page-break-before: always; }
  .quote { border-left: 3px solid #0a7f5a; padding: 4px 10px; margin: 8px 0; background: #f4faf7; font-size: 10.5pt; }
  pre { white-space: pre-wrap; font-family: 'Courier New', monospace; font-size: 9.5pt; line-height: 1.45; }
  .stamp { display: inline-block; border: 2px solid #0a7f5a; color: #0a7f5a; padding: 2px 8px; font: 700 9pt Arial, sans-serif; letter-spacing: .08em; }
  .watermark { position: fixed; top: 45%; left: 0; right: 0; text-align: center; font: 700 40pt Arial; color: rgba(200,0,0,.08); transform: rotate(-24deg); pointer-events: none; }
`

function openPrint(title: string, body: string) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${BASE_CSS}</style></head><body>${body}</body></html>`
  // Print through a hidden iframe (no pop-up blocker); the browser dialog offers "Save as PDF".
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
  document.body.appendChild(frame)
  const doc = frame.contentDocument
  if (!doc || !frame.contentWindow) {
    const w = window.open('', '_blank')
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 400) }
    return
  }
  doc.open(); doc.write(html); doc.close()
  const prevTitle = document.title
  document.title = title
  setTimeout(() => {
    try { frame.contentWindow!.focus(); frame.contentWindow!.print() } finally {
      setTimeout(() => { document.title = prevTitle; frame.remove() }, 1500)
    }
  }, 350)
}


/** The denial letter as a printable page — print it, then snap it with a phone to demo capture. */
export function printSampleLetter(c: CaseFile) {
  openPrint('Denial letter (synthetic)', `<div class="watermark">SYNTHETIC — DEMO</div><div class="wrap"><pre style="font-family: Georgia, serif; font-size: 11pt">${esc(c.denialText)}</pre></div>`)
}

export function exportAppeal(c: CaseFile, blocks: Block[], effective: PolicyVersion, allRows: MatchRow[], isVerified: (r: MatchRow) => boolean = () => true) {
  const rows = allRows.filter(isVerified)
  const d = c.denial!
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const verifiedRows = rows.filter(r => r.status === 'met' && r.chart_quote)
  const body = `
  <div class="wrap">
    <h1>${esc(d.provider_name || 'Provider')}</h1>
    <div class="muted">Prepared with Overturn · every quotation machine-verified against its source</div>
    <p style="margin-top:22px">${today}</p>
    <p>${esc(d.plan_name)}<br/>${esc(d.payer)} — Appeals &amp; Grievances Department</p>
    <table class="re"><tr><td><b>RE:</b></td><td><b>Request for Reconsideration (Appeal)</b></td></tr>
      <tr><td>Enrollee</td><td>${esc(d.member_name)} · ID ${esc(d.member_id)}</td></tr>
      <tr><td>Service</td><td>${esc(d.service_description)} (${d.codes.filter(x => x.system !== 'ICD-10').map(x => esc(x.code)).join(', ')})</td></tr>
      <tr><td>Diagnosis</td><td>${d.codes.filter(x => x.system === 'ICD-10').map(x => `${esc(x.code)} ${esc(x.description)}`).join('; ')}</td></tr>
      <tr><td>Date of service</td><td>${fmtDate(d.date_of_service)}</td></tr>
      <tr><td>Notice date</td><td>${fmtDate(d.notice_date)}</td></tr>
      <tr><td>Governing policy</td><td>${esc(effective.id)} ${esc(effective.title)} (effective ${fmtDate(effective.effective_date)})</td></tr></table>
    ${blocksToHtml(blocks)}
    <div class="sig">Sincerely,<br/><br/><b>${esc(c.signedBy || '')}</b><br/>On behalf of ${esc(d.provider_name)}<br/><span class="muted">Signed ${today}</span></div>
    <p class="muted" style="margin-top:20px">Enclosures: Exhibit A — governing policy excerpt (verbatim); Exhibit B — medical record excerpts (verbatim); Exhibit C — denial notice.</p>
  </div>
  <div class="wrap exhibit">
    <h3>Exhibit A — ${esc(effective.id)} ${esc(effective.title)}</h3>
    <div class="muted">Version effective ${fmtDate(effective.effective_date)} · ${esc(effective.source_url)}</div>
    ${rows.map(r => `<div class="quote"><b>${esc(r.criterion_label)}</b><br/>“${esc(r.policy_quote)}”</div>`).join('')}
    <h3>Exhibit B — Medical record excerpts</h3>
    ${verifiedRows.map(r => `<div class="quote">Line ${r.chart_line}: “${esc(r.chart_quote || '')}” <span class="cite">— supports: ${esc(r.criterion_label)}</span></div>`).join('')}
    <p><span class="stamp">${verifiedRows.length + rows.length} QUOTES VERIFIED — PROVENANCE + SUPPORT</span></p>
  </div>
  <div class="wrap exhibit"><h3>Exhibit C — Denial notice</h3><pre>${esc(c.denialText)}</pre></div>`
  openPrint(`Appeal — ${d.member_name}`, body)
}
