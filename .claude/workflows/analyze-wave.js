export const meta = {
  name: 'analyze-wave',
  description: 'รันวิเคราะห์หุ้น 1 ตัว/run (บังคับในโค้ด) พร้อมคุม effort/model ของ worker — รันหลาย run ขนานได้',
  whenToUse: 'controller ใช้แทน Agent tool เมื่อต้องการตั้ง effort ให้ worker (งาน mechanical เช่น UPDATE-LIGHT) — args = { stocks: [{label, prompt, model?, effort?}], effort?, model? } · prompt เตรียมจาก _template/agent-prompt.md · ★ `stocks[]` ต้องมี **1 ตัวเสมอ** — ข้อห้ามจริงคือ "หลายหุ้นใน 1 run" ไม่ใช่ "หลาย run" · **รันหลาย run ขนานกันได้** (1 หุ้น/run) แต่จำนวนที่ขนานเป็นดุลพินิจ เจอ rate limit ให้หาร N ครึ่ง · ก่อนขนานต้อง: controller pre-assign สีแบรนด์เอง (seeds.json race) + verify/push รายแบตช์ (docs/orchestration.md §4–5)',
  phases: [{ title: 'Analyze' }],
}

// args อาจมาเป็น JSON string (เรียกผ่าน Skill tool / controller stringify) — เกิดจริง 12 ก.ค. ล้มทั้ง 3 call จน fallback ไป Agent tool แบบไม่มี effort control
let a = args
if (typeof a === 'string') { try { a = JSON.parse(a) } catch (e) { a = null } }
const stocks = (a && a.stocks) || []
// ★ ข้อห้ามจริง = "หลายหุ้นใน 1 run" (เลขปนข้ามหุ้น — ตัวร้าย #1) — เดิมเป็นแค่ข้อความใน whenToUse (docs-audit S13) ตอนนี้บังคับ
if (Array.isArray(stocks) && stocks.length > 1) {
  return { error: `stocks[] ต้องมี 1 ตัวเสมอ (ได้ ${stocks.length}) — spawn หลาย run ขนานแทน (CLAUDE.md §3.3)` }
}
if (!Array.isArray(stocks) || !stocks.length) {
  return { error: 'ต้องส่ง args.stocks = [{label, prompt, model?, effort?}] (object หรือ JSON string ก็ได้) — prompt เต็มจาก _template/agent-prompt.md' }
}
const waveEffort = (a && a.effort) || 'medium'
const waveModel = (a && a.model) || 'sonnet'

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
