import { recognizeReceipt as baseline } from "./baselineOcr.js";
import { recognizeReceipt as improved } from "../src/browserOcr.js";
async function fileOf(src) { const blob = await (await fetch(src)).blob(); return new File([blob], src.split("/").pop(), { type: "image/jpeg" }); }
window.runOcr = async (which, src, area, alternate) => {
  const file = await fileOf(src);
  const started = performance.now();
  const fn = which === "baseline" ? baseline : improved;
  const r = await fn(file, 0, new AbortController().signal, () => {}, { area, alternate });
  return { text: r.text, confidence: Math.round(r.confidence), lines: r.lines ?? null, meta: r.meta ?? null, ms: Math.round(performance.now() - started) };
};
window.ready = true;
