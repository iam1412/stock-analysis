# ติดตั้ง hook กันเขียน `reports/*` ตรง (spec §6.2 ชั้น 1 · Plan 2b)

script: `.claude/hooks/guard-reports.js` (อยู่ใน repo แล้ว · เทส `test/v3/hook.test.js` อยู่ใน `npm run verify` ผ่าน `test/v3-test.js`)
ตัวบังคับจริง = ลายเซ็น `_sig` + gate E50 — hook เป็นแค่ชั้นเตือนเร็ว (fail-open: hook พัง = ปล่อยผ่าน)

## ⚠ paste เมื่อไร

**Plan 2b = ผลต่อ production ศูนย์:** script อยู่ใน repo แต่ยัง**ไม่ได้ต่อสาย** — `.claude/settings.json` ไม่ถูกแก้ใน 2b · การจบ 2b **ไม่ต้อง**ให้ hook ทำงานอยู่ (พิสูจน์ด้วย `--settings` ไฟล์ชั่วคราวข้างล่างเท่านั้น) · ไม่มีอะไรเปลี่ยนสำหรับ session ใดจนกว่าเจ้าของ paste

**paste พร้อม cutover ของ Plan 2c (เอกสาร worker โหมด v3 NEW) — ไม่ใช่ตอนจบ Plan 2b.** hook ปฏิเสธ Write/Edit **ทุกไฟล์** ใต้ `reports/` รวม `.html` ⇒ โหมด NEW ของ v2 (stock-analyzer STEP 5A "Write `reports/<SYMBOL>.html` เต็มใบ") จะถูกบล็อกทันทีที่ paste · UPDATE ของ v2 ผ่าน `node tools/apply-edits.js` (child process) ยังทำงานตามปกติ

## snippet (เจ้าของ paste เอง — Claude ไม่แก้ `.claude/settings.json`)

`.claude/settings.json` ทั้งไฟล์หลัง paste (คง `env` เดิมไว้ตามเดิม):

```json
{
  "env": {
    "CLAUDE_CODE_SUBAGENT_MODEL": "sonnet"
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit|NotebookEdit",
        "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/guard-reports.js\"" }]
      },
      {
        "matcher": "Bash",
        "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/guard-reports.js\"" }]
      }
    ]
  }
}
```

## พิสูจน์ใน `claude -p` process ใหม่ (controller ทำเอง — ไม่ใช่ implementer/worker · harness รันไม่ได้ = เจ้าของรันเอง)

settings และ CLAUDE.md โหลดตอนเริ่ม session ⇒ ต้องพิสูจน์ใน process ใหม่เสมอ · ใช้ `--settings` ไฟล์ชั่วคราว (ยังไม่ต้อง paste) · รันใน worktree ที่ไม่มีงานค้าง

**ถ้า controller รัน `claude -p` ใน harness ของตัวเองไม่ได้** (auth/TTY/classifier) หลักฐานตอนจบ 2b = `test/v3/hook.test.js` (stdin JSON → deny/allow) และ **ขั้นนี้เป็นของเจ้าของ**: รันคำสั่งข้างล่างใน terminal ของตัวเอง **ก่อน paste snippet ตอน cutover 2c** — เป็นทางเดียวที่พิสูจน์ว่า deny ชนะ hook `rtk` ระดับผู้ใช้ · ผลไม่ตรง "ผลที่ต้องได้" = อย่า paste แล้วแจ้ง Claude:

```bash
cd /Users/somchai.s/Downloads/stock-v3-plan2b
cat > /tmp/guard-settings.json <<'EOF'
{"hooks":{"PreToolUse":[
 {"matcher":"Write|Edit|MultiEdit|NotebookEdit","hooks":[{"type":"command","command":"node \"$CLAUDE_PROJECT_DIR/.claude/hooks/guard-reports.js\""}]},
 {"matcher":"Bash","hooks":[{"type":"command","command":"node \"$CLAUDE_PROJECT_DIR/.claude/hooks/guard-reports.js\""}]}]}}
EOF
claude -p --settings /tmp/guard-settings.json --permission-mode acceptEdits \
  --allowedTools "Bash(echo:*),Bash(git status:*)" --output-format stream-json --verbose \
  'Do these three steps and report each result verbatim: (1) use the Write tool to create reports/ZZHOOK.json containing {} ; (2) run the Bash command: echo {} > reports/ZZHOOK1.json ; (3) run the Bash command: git status --short > reports/ZZHOOK2.json' \
  > /tmp/hook-proof.jsonl
grep -c 'เขียนตรงไม่ได้' /tmp/hook-proof.jsonl
test ! -e reports/ZZHOOK.json && test ! -e reports/ZZHOOK1.json && test ! -e reports/ZZHOOK2.json && echo HOOK-OK
rm -f reports/ZZHOOK*.json /tmp/hook-proof.jsonl /tmp/guard-settings.json
rtk proxy git status --short reports/
```

ผลที่ต้องได้:
- `grep -c` ≥ 3 (เหตุผล deny ของทั้งสามขั้นอยู่ใน tool_result)
- `HOOK-OK`
- `git status --short reports/` ว่าง
- ขั้น (3) คือหลักฐาน **deny ชนะ** hook Bash ระดับผู้ใช้ `rtk-rewrite.sh` (ซึ่ง allow + `updatedInput` เป็น `rtk git status …`) — ถ้าไฟล์ `ZZHOOK2.json` เกิดขึ้น = ลำดับ hook ไม่เป็นอย่างที่คิด หยุดแล้วรายงาน

## ช่องโหว่ที่รู้ (ยอมรับ — `_sig`/E50 จับตอน verify/pre-push)

`xargs …` · `find … -exec` · สคริปต์ไฟล์ที่เขียนขึ้นเองแล้วรัน · `"$(…)"` ในเครื่องหมายคำพูดคู่ · child process ทุกตัว (`apply-edits`, `report.js` — ตั้งใจ) · **`cd` ภายในคำสั่งเดียวไม่ถูกติดตาม** — `cd reports && cat > X.html` หรือ `(cd reports; echo x > X.html)` **ผ่าน hook ได้ (ปฏิเสธขาด)** เพราะ hook resolve path สัมพัทธ์กับ cwd ของ session เท่านั้น → ชั้น 2 `_sig`/E50 จับไฟล์ที่ได้ตอน gate (verify/pre-push) · กลับกัน `cd` ออกไปที่อื่นก่อนเขียน `reports/…` สัมพัทธ์ = ปฏิเสธเกินได้ · cwd ของ session ที่**ค้างอยู่ใน** `reports/` จาก call ก่อน = ถูกจับ (ไม่ใช่ช่องโหว่)
