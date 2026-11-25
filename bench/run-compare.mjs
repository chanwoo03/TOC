// 기존 OCR(browserOcr 이전 버전) vs 개선 OCR 을 같은 사진으로 비교한다.
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { buildStructure, parseInstruction } from "../src/ocrStructure.js";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const gt = JSON.parse(fs.readFileSync(new URL("./set/gt.json", import.meta.url)));
const only = process.argv[2] ? process.argv[2].split(",") : Object.keys(gt);
const versions = (process.argv[3] ?? "baseline,improved").split(",");
const norm = (s) => String(s ?? "").normalize("NFKC").replace(/\s+/gu, "");
function edit(a, b) { const d = Array.from({ length: b.length + 1 }, (_, j) => j); for (let i = 1; i <= a.length; i++) { let prev = d[0]; d[0] = i; for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; } } return d[b.length]; }
function partial(gtText, line) { const a = norm(gtText), b = norm(line); if (!a) return 0; if (!b) return a.length;
  let prev = new Array(b.length + 1).fill(0); for (let i = 1; i <= a.length; i++) { const cur = [i]; for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; } return Math.min(...prev); }
function wordErr(gtText, line) { // 단어 단위 편집거리 (가장 가까운 줄 안에서)
  const a = gtText.trim().split(/\s+/u), b = line.trim().split(/\s+/u).filter(Boolean); if (!b.length) return a.length;
  let best = Infinity; for (let s = 0; s < b.length; s++) for (let e = s + 1; e <= b.length; e++) best = Math.min(best, edit(a, b.slice(s, e)));
  return Math.min(best, a.length); }
function gtLines(g) { return [g.title, ...g.meds.flatMap((m) => [m.name, m.description, m.effect, m.instruction])].filter(Boolean); }
function score(g, text, structure) {
  const lines = text.split(/\n/u).map((l) => l.trim()).filter(Boolean);
  const targets = gtLines(g);
  let ce = 0, cn = 0, we = 0, wn = 0;
  for (const t of targets) { cn += norm(t).length; ce += Math.min(norm(t).length, Math.min(...lines.map((l) => partial(t, l)), norm(t).length));
    wn += t.trim().split(/\s+/u).length; we += Math.min(...lines.map((l) => wordErr(t, l)), t.trim().split(/\s+/u).length); }
  const namesRead = g.meds.filter((m) => lines.some((l) => norm(l).includes(norm(m.name)))).length;
  const meds = structure.medicines;
  let nameOk = 0, instOk = 0, needsFix = 0;
  for (const m of g.meds) {
    const found = meds.find((s) => norm(s.name.text) === norm(m.name)) ?? meds.reduce((best, s) => (!best || partial(m.name, s.name.text) < partial(m.name, best.name.text)) ? s : best, null);
    const nameRight = found && norm(found.name.text) === norm(m.name);
    const want = parseInstruction(m.instruction);
    const got = found?.instruction ? { dose: found.instruction.dose ?? null, frequency: found.instruction.frequency ?? null, days: found.instruction.days ?? null } : null;
    const instRight = want && got && norm(want.dose) === norm(got.dose) && norm(want.frequency) === norm(got.frequency) && norm(want.days) === norm(got.days);
    if (nameRight) nameOk++; if (instRight) instOk++;
    needsFix += (nameRight ? 0 : 1) + (instRight ? 0 : 1);
  }
  const extra = Math.max(0, meds.length - g.meds.length);
  return { cer: ce / cn, wer: we / wn, namesRead, nameOk, instOk, meds: g.meds.length, found: meds.length, extra, needsFix, uncertain: structure.uncertain.length, dropped: structure.dropped.length };
}
const server = spawn("npx", ["vite", "--port", "5196", "--strictPort"], { cwd: new URL("..", import.meta.url).pathname, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 3500));
const browser = await chromium.launch(); const page = await browser.newPage();
await page.goto("http://localhost:5196/bench/compare.html"); await page.waitForFunction(() => window.ready, null, { timeout: 90000 });
const rows = [];
for (const name of only) for (const version of versions) {
  const file = fs.existsSync(new URL(`./set/${name}.jpg`, import.meta.url)) ? `${name}.jpg` : `${name}.png`;
  const r = await page.evaluate(([w, s]) => window.runOcr(w, s, null, false), [version, "/bench/set/" + file]);
  const structure = buildStructure({ text: r.text, confidence: r.confidence, lines: version === "baseline" ? undefined : r.lines });
  const s = score(gt[name], r.text, structure);
  const row = { image: name, variant: gt[name].variant, version, ms: r.ms, conf: r.confidence, ...s, meta: r.meta };
  rows.push({ ...row, text: r.text, structure: { medicines: structure.medicines.map((m) => ({ name: m.name.text, inst: m.instruction?.text ?? null, unc: m.name.uncertain })) } });
  console.log(JSON.stringify({ image: name, version, ms: r.ms, cer: +s.cer.toFixed(3), wer: +s.wer.toFixed(3), names: `${s.namesRead}/${s.meds}`, nameOk: s.nameOk, instOk: s.instOk, found: s.found, fix: s.needsFix, skew: r.meta?.skew, small: r.meta?.lowResolution }));
}
fs.writeFileSync(process.argv[4] ?? "/tmp/claude-0/compare.json", JSON.stringify(rows, null, 1));
await browser.close(); server.kill();
