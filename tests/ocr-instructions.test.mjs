import assert from "node:assert/strict";
import { test } from "node:test";
import { recognizedInstructionRows } from "../src/ocrInstructions.js";

test("extracts only the printed amount, frequency and duration on a compact line", () => {
  const line = "약 이름 200mg 0.5정씩3회7일분";
  assert.deepEqual(recognizedInstructionRows(line), [{ line, dose: "0.5정", frequency: "3회", days: "7일분" }]);
});

test("preserves ranges and explicit daily wording on independent lines", () => {
  const first = "1회 1~2캡슐, 1일 2회";
  const second = "복용 기간: 7일";
  assert.deepEqual(recognizedInstructionRows(first + "\n" + second), [
    { line: first, dose: "1~2캡슐", frequency: "1일 2회", days: undefined },
    { line: second, dose: undefined, frequency: undefined, days: "복용 기간: 7일" },
  ]);
});

test("ignores product strength, pack counts and unclear OCR characters", () => {
  assert.deepEqual(recognizedInstructionRows("예시제품 500mg 30정\n알수없는 l정씩3O회\n2026-11-22\n1회 또는 2회"), []);
});
