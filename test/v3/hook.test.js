'use strict';
// Plan 2b Task 8 — PreToolUse hook .claude/hooks/guard-reports.js (spec §6.2 ชั้น 1 · R10)
// repo ปลอมในโฟลเดอร์ชั่วคราว (มี build.js + reports/) — ไม่แตะ reports/ จริง
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const t = require('./_t.js')('hook');
const HOOK = path.join(__dirname, '..', '..', '.claude', 'hooks', 'guard-reports.js');
const H = require(HOOK);

const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'v3-hook-'));
const REP = path.join(repo, 'reports');
fs.writeFileSync(path.join(repo, 'build.js'), '// fake repo root\n');
fs.mkdirSync(REP);
const other = fs.mkdtempSync(path.join(os.tmpdir(), 'v3-hook-other-'));   // มีโฟลเดอร์ชื่อเดียวกันแต่ไม่ใช่ repo (ไม่มี build.js)
const OTHER_REP = path.join(other, 'reports');
fs.mkdirSync(OTHER_REP);
const bash = (command, cwd) => H.decide({ tool_name: 'Bash', tool_input: { command }, cwd: cwd || repo });
const file = (tool_name, p) => H.decide({ tool_name, tool_input: tool_name === 'NotebookEdit' ? { notebook_path: p } : { file_path: p }, cwd: repo });

try {
  // ── file tools: ทุกไฟล์ใต้ reports/ (ไม่ใช่แค่ .json — กัน worker ถอยไปเขียน HTML) ──
  t(file('Write', path.join(REP, 'X.json')), 'Write reports/X.json (absolute) → deny');
  t(file('Edit', 'reports/X.html'), 'Edit reports/X.html (relative to cwd) → deny');
  t(file('MultiEdit', './reports/../reports/X.html'), 'MultiEdit with ./ and .. → deny');
  t(file('NotebookEdit', path.join(REP, 'n.ipynb')), 'NotebookEdit under reports/ → deny');
  t(!file('Write', path.join(repo, 'tools', 'x.js')), 'Write tools/x.js → allow');
  t(!file('Write', path.join(repo, 'reportsX', 'a.json')), 'segment "reportsX" is not reports → allow');
  t(!file('Write', path.join(OTHER_REP, 'a.json')), 'reports/ of a folder without build.js → allow (R10)');
  t(!file('Write', undefined) && !H.decide({ tool_name: 'Read', tool_input: { file_path: path.join(REP, 'X.json') }, cwd: repo }), 'no path / Read tool → allow');

  // ── Bash: ต้องปฏิเสธ ──
  const DENY = [
    'echo {} > reports/X.json', 'echo x >> reports/X.html', 'printf x>reports/X.json', 'echo x &> reports/X.json', 'echo x 1>reports/X.json',
    "cat > reports/X.json <<'EOF'\n{}\nEOF",
    'cp /tmp/a.json reports/X.json', 'mv a.json reports', 'cp -t reports a.json', 'cp --target-directory=reports a.json', 'rsync -a a/ reports/',
    'ln -s /tmp/a reports/X.json', 'install -m644 a reports/X.json', 'dd if=/tmp/a of=reports/X.json',
    'tee reports/X.json < /tmp/a', 'echo x | tee -a reports/X.json', "sed -i '' 's/a/b/' reports/X.html", "sed -i.bak 's/a/b/' reports/X.html",
    "perl -pi -e 's/a/b/' reports/X.html", 'rtk proxy cp a reports/X.json', 'rtk git status --short > reports/ZZHOOK2.json',
    'git status > reports/X.json', 'FOO=1 cp a reports/X.json', 'sudo tee reports/X.json', 'env A=1 tee reports/X.json',
    "bash -c 'echo x > reports/X.json'", 'sh -c "cp a reports/X.json"',
    `node -e "require('fs').writeFileSync('reports/X.json','{}')"`, `python3 -c "open('reports/X.json','w').write('x')"`,
    'echo x > "$CLAUDE_PROJECT_DIR/reports/X.json"', `echo x > ${REP}/X.json`, 'echo ok && echo x > reports/X.json', 'true; cp a reports/',
    'echo $(cat /tmp/a > reports/X.json)',
  ];
  for (const c of DENY) t(bash(c), `deny: ${JSON.stringify(c)}`);
  // ── Bash: ต้องผ่าน (Review Focus 3 — ข้อความที่แค่ "ดูเหมือน" การเขียน) ──
  const ALLOW = [
    'git mv reports/A.html reports/A.json', 'git add reports/X.json', 'git checkout -- reports/X.html', 'rm reports/X.json', 'rm -f reports/ZZHOOK*.json',
    'grep -n foo reports/X.html | head', 'cp reports/X.html /tmp/', 'cat reports/X.json', 'ls reports/ > /tmp/list', 'wc -l reports/*.html',
    'node tools/report.js save X > /tmp/log 2>&1', 'node tools/report.js save X', 'node tools/apply-edits.js X reports/X.html',
    'git commit -m "fix > reports/x"', "git commit -m 'a >> reports/b'", 'echo "a > reports/x"', 'echo reports/x 2>&1',
    "node tools/apply-edits.js X <<'EOF'\n<div class=\"a\">x</div> > reports/y\nEOF",
    'sed -n 1p reports/X.html', 'diff reports/a.json /tmp/b.json', 'rtk git status --short reports/', 'rtk proxy git status --short reports/ .work .queue',
    `node -e "console.log(require('fs').readFileSync('reports/X.json','utf8').length)"`, 'echo hi > /tmp/x', 'cp a /tmp/reports.json',
    `echo x > ${path.join(OTHER_REP, 'a.json')}`,
  ];
  for (const c of ALLOW) t(!bash(c), `allow: ${JSON.stringify(c)} (got ${JSON.stringify(bash(c))})`);

  // ── lexer / heredoc units ──
  t.eq(H.lex('a "b c" d\\ e>f').map((x) => x.v), ['a', 'b c', 'd e', '>', 'f'], 'lex: quotes, escapes, glued redirect');
  t.eq(H.lex('x 2>&1 y').map((x) => x.v), ['x', '2>&1', 'y'], 'lex: 2>&1 is one op');
  t.eq(H.stripHeredocs("a <<'EOF'\nbody > reports/x\nEOF\nb"), "a <<'EOF'\nb", 'stripHeredocs: body removed, marker line kept');
  t.eq(H.stripHeredocs('cat <<< "x"\nnext'), 'cat <<< "x"\nnext', 'stripHeredocs: here-string is not a heredoc');

  // ── process contract: exit 0 เสมอ · deny = JSON บน stdout · ผ่าน/พัง = ไม่พิมพ์ ──
  const spawn = (input) => spawnSync(process.execPath, [HOOK], { input, encoding: 'utf8' });
  { const r = spawn(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'echo {} > reports/X.json' }, cwd: repo }));
    const o = r.status === 0 && r.stdout ? JSON.parse(r.stdout) : {};
    t(o.hookSpecificOutput && o.hookSpecificOutput.hookEventName === 'PreToolUse' && o.hookSpecificOutput.permissionDecision === 'deny'
      && o.hookSpecificOutput.permissionDecisionReason.startsWith(H.REASON), 'spawn deny → exit 0 + permissionDecision deny JSON with the reason'); }
  { const r = spawn(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git mv reports/A.html reports/A.json' }, cwd: repo }));
    t(r.status === 0 && r.stdout === '', 'spawn allow → exit 0, no output'); }
  { const r = spawn('not json {{{'); t(r.status === 0 && r.stdout === '', 'garbage stdin → fail-open (exit 0, no output)'); }
  { const r = spawn(''); t(r.status === 0 && r.stdout === '', 'empty stdin → fail-open'); }
  t(H.REASON.includes('node tools/report.js save') && H.REASON.includes('เขียนตรงไม่ได้'), 'REASON points to report.js save (docs/hook-setup.md greps for เขียนตรงไม่ได้)');
} finally { fs.rmSync(repo, { recursive: true, force: true }); fs.rmSync(other, { recursive: true, force: true }); }
t.done();
