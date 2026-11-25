import assert from "node:assert/strict";
import { test } from "node:test";
import { addManualMedicine, applyEdit, buildStructure, fieldValue, isNoise, parseInstruction, registrationRecord, setConfirmed, validateMedicine } from "../src/ocrStructure.js";

const box = (y, x = 0.1) => ({ x, y, width: 0.3, height: 0.04 });

test("table rows read as one line become one medicine with effect and instruction", () => {
  const structure = buildStructure({ text: "", confidence: 90, lines: [
    { text: "조제약 복약안내", confidence: 92, box: box(0.05) },
    { text: "약품사진   약품명      복약안내     투약량/횟수/일수", confidence: 88, box: box(0.15) },
    { text: "베포타스틴정10밀리그램      [항알레르기약]     1정씩 2회 7일분", confidence: 91, box: box(0.25) },
    { text: "흰색의 원형 필름코팅정", confidence: 85, box: box(0.29) },
  ] });
  assert.equal(structure.title.text, "조제약 복약안내");
  assert.equal(structure.medicines.length, 1);
  const [medicine] = structure.medicines;
  assert.equal(medicine.name.text, "베포타스틴정10밀리그램");
  assert.equal(medicine.name.strength, "10밀리그램");
  assert.equal(medicine.effect.text, "[항알레르기약]");
  assert.deepEqual([medicine.instruction.dose, medicine.instruction.frequency, medicine.instruction.days], ["1정", "2회", "7일분"]);
  assert.equal(medicine.details[0].text, "흰색의 원형 필름코팅정");
  assert.equal(structure.headers.length, 4);
});

test("column-wise reading attaches instructions by vertical position, not by order", () => {
  const structure = buildStructure({ text: "", confidence: 70, lines: [
    { text: "레티라진정", confidence: 80, box: box(0.10) },
    { text: "베포탄정", confidence: 80, box: box(0.30) },
    { text: "1씩1일2회5일", confidence: 75, box: box(0.31, 0.6) },
    { text: "1씩1일1회5일", confidence: 75, box: box(0.11, 0.6) },
  ] });
  const [first, second] = structure.medicines;
  assert.equal(first.instruction.text, "1씩1일1회5일");
  assert.equal(second.instruction.text, "1씩1일2회5일");
  assert.equal(second.instruction.frequency, "1일2회");
  assert.equal(second.instruction.days, "5일");
});

test("keeps the raw text, drops noise and never invents missing values", () => {
  const raw = "rrr are\n-\n지르텍정\n(Hex";
  const structure = buildStructure({ text: raw, confidence: 50 });
  assert.equal(structure.rawText, raw);
  assert.equal(structure.medicines.length, 1);
  assert.equal(structure.medicines[0].instruction, null);
  assert.equal(structure.medicines[0].name.strength, null);
  assert.deepEqual(structure.dropped.map((item) => item.text), ["rrr are", "-", "(Hex"]);
});

test("low confidence words mark the field as uncertain and suggest form fixes without applying them", () => {
  const structure = buildStructure({ text: "", confidence: 60, lines: [
    { text: "아세틸시스테인캡술200밀리그램", confidence: 66, words: [{ text: "아세틸시스테인캡술200밀리그램", confidence: 52 }], box: box(0.2) },
  ] });
  const [medicine] = structure.medicines;
  assert.equal(medicine.name.text, "아세틸시스테인캡술200밀리그램");
  assert.equal(medicine.name.uncertain, true);
  assert.equal(medicine.name.suggestion.value, "아세틸시스테인캡슐200밀리그램");
  assert.equal(structure.uncertain.length, 1);
});

test("edits are kept apart from OCR values and validation blocks unconfirmed or empty names", () => {
  let structure = buildStructure({ text: "타이레놀정500밀리그람\n1정씩 3회 5일분", confidence: 90 });
  const id = structure.medicines[0].id;
  assert.equal(structure.medicines[0].instruction.text, "1정씩 3회 5일분");
  assert.ok(validateMedicine(structure, id).some((problem) => problem.field === "confirm"));
  structure = applyEdit(structure, id, "name", "타이레놀정500밀리그램");
  assert.equal(fieldValue(structure, id, "name"), "타이레놀정500밀리그램");
  assert.equal(structure.medicines[0].name.text, "타이레놀정500밀리그람");
  structure = setConfirmed(structure, id, true);
  assert.deepEqual(validateMedicine(structure, id), []);
  assert.deepEqual(registrationRecord(structure, id), {
    name: "타이레놀정500밀리그램", instruction: "1정씩 3회 5일분", ocrName: "타이레놀정500밀리그람",
    nameEdited: true, instructionEdited: false, source: "ocr",
  });
  structure = applyEdit(structure, id, "name", "타이레놀정500밀리그람");
  assert.equal(structure.edits[id], undefined);
  structure = addManualMedicine(structure, "");
  const manual = structure.medicines.at(-1).id;
  assert.ok(validateMedicine(structure, manual).some((problem) => problem.field === "name" && problem.level === "error"));
});

test("instruction parsing only reads what is printed", () => {
  assert.deepEqual(parseInstruction("0.5정씩 3회 7일분"), { dose: "0.5정", frequency: "3회", days: "7일분" });
  assert.equal(parseInstruction("백색의 원형 정제"), null);
  assert.equal(parseInstruction("30정"), null);
  assert.equal(isNoise("atte AUD"), true);
  assert.equal(isNoise("1정씩 3회"), false);
});

test("word positions split table columns while keeping the printed spacing inside a column", () => {
  const glyphs = (text, start) => [...text].map((ch, i) => ({ text: ch, confidence: 90, x0: start + i * 30, x1: start + i * 30 + 26, y0: 0, y1: 30 }));
  const name = glyphs("파모티딘정", 0);
  const effect = glyphs("[근이완제]", 400);
  const line = { text: "파모티딘정     [근이완제]", confidence: 90, words: [...name, ...effect], box: box(0.3) };
  const structure = buildStructure({ text: "", confidence: 90, lines: [line] });
  assert.equal(structure.medicines[0].name.text, "파모티딘정");
  assert.equal(structure.medicines[0].effect.text, "[근이완제]");
});

test("a table row with a misread form word still becomes an uncertain medicine without changing its text", () => {
  const structure = buildStructure({ text: "지르텍평     [항히스타인체]     1정씩 1회 5일분\n뮤테란캡술200일리그램", confidence: 80 });
  assert.deepEqual(structure.medicines.map((m) => m.name.text), ["지르텍평", "뮤테란캡술200일리그램"]);
  assert.equal(structure.medicines[0].name.uncertain, true);
  assert.equal(structure.medicines[0].name.guessed, true);
  assert.equal(structure.medicines[0].instruction.text, "1정씩 1회 5일분");
});
