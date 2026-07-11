export const meta = {
  name: 'analyze-wave',
  description: 'รันเวฟวิเคราะห์หุ้น: worker 1 ตัว/หุ้น แบบ sequential พร้อมคุม effort ต่อ worker (default medium)',
  whenToUse: 'controller ใช้แทน Agent tool เมื่อต้องการตั้ง effort ให้ worker (งาน mechanical เช่น UPDATE-LIGHT) — args = { stocks: [{label, prompt, model?, effort?}], effort?, model? } · prompt เตรียมจาก _template/agent-prompt.md · กติกาเวฟ ≤3 / push per-wave อยู่ที่ controller (docs/orchestration.md §5)',
  phases: [{ title: 'Analyze' }],
}

// sequential ตามกติกา CLAUDE.md §3 — ห้าม parallel (เคยพัง rate limit ทั้งเวฟใน W19–W21)
const stocks = (args && args.stocks) || []
if (!Array.isArray(stocks) || !stocks.length) {
  return { error: 'ต้องส่ง args.stocks = [{label, prompt, model?, effort?}] — prompt เต็มจาก _template/agent-prompt.md' }
}
const waveEffort = (args && args.effort) || 'medium'
const waveModel = (args && args.model) || 'sonnet'

phase('Analyze')
const results = []
for (const s of stocks) {
  if (!s || !s.prompt || !s.label) { results.push({ label: (s && s.label) || '?', ok: false, error: 'ไม่มี prompt/label' }); continue }
  const r = await agent(s.prompt, {
    label: s.label,
    phase: 'Analyze',
    model: s.model || waveModel,     // escalate ตัวยาก: ส่ง model:"opus" มากับตัวนั้น
    effort: s.effort || waveEffort,  // งาน mechanical = medium พอ · ตัวยาก override เป็น high
  })
  results.push({ label: s.label, ok: r != null, report: r })
  log(`${s.label} ${r != null ? 'เสร็จ' : 'FAIL (agent ถูกข้าม/ตาย — controller ทำ inline แทน)'} (${results.length}/${stocks.length})`)
}

return {
  done: results.filter((r) => r.ok).map((r) => r.label),
  failed: results.filter((r) => !r.ok).map((r) => r.label),
  results,
}
