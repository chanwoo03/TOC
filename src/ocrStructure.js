// OCR 줄 목록을 약 봉투 구조(제목 · 약별 이름/설명/효능/복용 지시 · 기타 · 불확실)로 정리한다.
// 원칙: OCR 원문을 그대로 보존하고, 원문에 없는 값은 만들지 않는다. 사용자가 고친 값은 edits 에 따로 둔다.
import { recognizedInstructionRows } from "./ocrInstructions.js";

export const UNCERTAIN_LINE = 70; // 줄 신뢰도가 이보다 낮으면 "확인 필요"
export const UNCERTAIN_WORD = 60; // 단어 신뢰도가 이보다 낮으면 그 단어를 흐린 글자로 표시

const FORM = String.raw`(?:연질캡슐|캡슐|캡술|캡슬|캅슐|캅셀|캡셀|칼셀|현탁액|시럽|과립|점안액|액|연고|크림|겔|패취|패치|정)`;
const STRENGTH = String.raw`\d+(?:[.,]\d+)?\s*(?:밀리그램|밀리그람|마이크로그램|mg|㎎|mcg|g|그램|mL|ml|밀리리터|%)`;
const NAME = new RegExp(String.raw`^[가-힣A-Za-z][가-힣A-Za-z0-9·\-]{0,30}?${FORM}(?:\s*${STRENGTH}|\s*\d+(?:[.,]\d+)?[가-힣A-Za-z]{0,6})?(?:\s*\([^)]{0,30}\)?)?(?:…|\.{2,3})?$|^[가-힣A-Za-z][가-힣A-Za-z0-9·\-]{1,30}${STRENGTH}(?:…)?$`, "u");
const DESCRIPTION_START = /^(?:백색|흰색|힌색|황색|노란색|연한|진한|분홍|적색|빨간|주황|갈색|청색|파란|녹색|초록|회색|회백색|무색|투명|하양|흰|미황|담황|내용물|원형|장방형|타원형|삼각형|오각형|육각형|팔각형|마름모|반원형|사각형)/u;
const HEADER_WORDS = ["약품사진", "약품명", "투약량", "횟수", "일수", "주의사항", "약품 사진", "약 품 명"];
const TITLE = /복\s*약\s*안\s*내|조\s*제\s*약|약\s*봉\s*투|복용\s*안내/u;
const FORM_FIXES = [[/캡술|캡슬|캅슐|칼셀/gu, "캡슐"]];

const hangulRun = /[가-힣]{2,}/u;
const symbols = /[^\p{L}\p{N}\s]/gu;

/** 잡음(의미 있는 글자가 거의 없는 줄)인지. */
export function isNoise(text) {
  const trimmed = text.trim();
  if (trimmed.length < 2) return true;
  if (!hangulRun.test(trimmed) && !/\d\s*(?:회|일|정|mg|씩)/u.test(trimmed)) return true;
  const symbolCount = (trimmed.match(symbols) ?? []).length;
  return symbolCount / trimmed.replace(/\s/gu, "").length > 0.45;
}

function cleanSegment(text) {
  return text.replace(/^[|｜¦:;,.·•\-_'"`~]+|[|｜¦:;,·•\-_'"`~]+$/gu, "").replace(/\s+/gu, " ").trim();
}

/**
 * 줄을 열 경계(큰 빈칸) 기준으로 나눈다.
 * 단어 위치가 있으면 단어 사이 간격으로, 없으면 연속 공백(2칸 이상)으로 나눈다. 조각마다 가장 낮은 단어 신뢰도를 붙인다.
 */
function segmentsOf(line) {
  const words = (line.words ?? []).filter((word) => word.text?.trim());
  if (words.length && words.every((word) => Number.isFinite(word.x0) && Number.isFinite(word.x1))) {
    const heights = words.map((word) => (word.y1 - word.y0) || 1).sort((a, b) => a - b);
    const height = heights[Math.floor(heights.length / 2)];
    // 단어가 줄 글자의 어디에 있는지 찾아 두고, 조각 글자는 원래 줄 글자에서 잘라 온다 (띄어쓰기 보존)
    let cursor = 0;
    const spans = words.map((word) => {
      const piece = word.text.trim();
      const start = line.text.indexOf(piece, cursor);
      if (start < 0) return null;
      cursor = start + piece.length;
      return [start, cursor];
    });
    const groups = [];
    let group = null;
    words.forEach((word, index) => {
      const gap = index ? word.x0 - words[index - 1].x1 : 0;
      if (!group || gap > height * 1.4) { group = { words: [], spans: [] }; groups.push(group); }
      group.words.push(word);
      group.spans.push(spans[index]);
    });
    return groups.map((item) => {
      const known = item.spans.filter(Boolean);
      const text = known.length === item.spans.length
        ? line.text.slice(known[0][0], known.at(-1)[1]) : item.words.map((word) => word.text.trim()).join("");
      return { raw: text, text: cleanSegment(text), confidence: Math.min(...item.words.map((word) => word.confidence)), words: item.words, box: unionBox(item.words) };
    }).filter((segment) => segment.text);
  }
  return line.text.split(/\s{2,}|\s(?=\[)|(?<=\])\s/u).map((part) => part.trim()).filter(Boolean)
    .map((part) => ({ raw: part, text: cleanSegment(part), confidence: line.confidence, words: [] }))
    .filter((segment) => segment.text);
}

/** 글자 상자들을 모두 덮는 상자 (원본 사진 비율 좌표). 상자가 없으면 null. */
function unionBox(words) {
  const boxes = words.map((word) => word.box).filter(Boolean);
  if (!boxes.length) return null;
  const left = Math.min(...boxes.map((box) => box.x)), top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width)), bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** 원문에 적힌 복용 지시만 읽는다. 단위나 숫자가 없으면 비워 둔다. */
export function parseInstruction(text) {
  const [strict] = recognizedInstructionRows(text);
  if (strict) return { dose: strict.dose ?? null, frequency: strict.frequency ?? null, days: strict.days ?? null };
  if (!/씩|회/u.test(text)) return null;
  const dose = text.match(/(?<![\d.])(\d+(?:\.\d+)?\s*(?:정|캡슐|캅셀|캡술|캡슬|포|mL|ml|방울)?)\s*씩/u)?.[1]?.replace(/\s/gu, "") ?? null;
  const frequencyMatch = text.match(/(?:(?:1\s*일|하루)\s*)?\d{1,2}\s*회/u);
  const frequency = frequencyMatch?.[0]?.replace(/\s/gu, "") ?? null;
  const after = frequencyMatch ? text.slice(frequencyMatch.index + frequencyMatch[0].length) : "";
  const days = after.match(/\d{1,3}\s*일\s*분?/u)?.[0]?.replace(/\s/gu, "") ?? null;
  if (!dose && !frequency) return null;
  return { dose, frequency, days };
}

function kindOf(segment) {
  const text = segment.text;
  const compact = text.replace(/\s/gu, "");
  if (HEADER_WORDS.some((word) => compact.includes(word.replace(/\s/gu, "")))) return "header";
  if (TITLE.test(text) && compact.length <= 20) return "title";
  if (/^\[.*\]?$|^\(.*효능|^.*\]$/u.test(text)) return "effect";
  if (parseInstruction(text)) return "instruction";
  if (DESCRIPTION_START.test(text) || /(?:코팅정|당의정|필름정|정제|캡슐제)$/u.test(compact)) return "description";
  if (NAME.test(compact) && !/의$/u.test(compact)) return "name";
  return "note";
}

function suggestionFor(text) {
  let fixed = text;
  for (const [pattern, replacement] of FORM_FIXES) fixed = fixed.replace(pattern, replacement);
  return fixed !== text ? { value: fixed, reason: "제형 글자 오인식 의심 (예: 캡술 → 캡슐)" } : null;
}

function splitName(text) {
  const strength = text.match(new RegExp(STRENGTH, "u"))?.[0]?.replace(/\s/gu, "") ?? null;
  const form = text.match(new RegExp(FORM, "u"))?.[0] ?? null;
  return { strength, form };
}

const centerY = (box) => box ? box.y + box.height / 2 : null;

/**
 * Tesseract 결과(줄 목록)를 구조화한다.
 * @param {{text:string, confidence:number, lines?:Array}} result
 */
export function buildStructure(result) {
  const sourceLines = result.lines?.length ? result.lines
    : result.text.split(/\r?\n/u).map((text) => ({ text, confidence: result.confidence ?? 0, words: [] }));
  const lines = [], dropped = [], headers = [], notes = [], medicines = [];
  let title = null;
  let current = null;
  const pending = [];

  sourceLines.forEach((source, index) => {
    const text = source.text.replace(/\s+$/u, "");
    if (!text.trim()) return;
    const id = "l" + (index + 1);
    const weakWords = (source.words ?? []).filter((word) => word.confidence < UNCERTAIN_WORD).map((word) => word.text);
    const line = {
      id, text: text.replace(/\s+/gu, " ").trim(), confidence: source.confidence ?? 0, box: source.box ?? null,
      words: source.words ?? [], weakWords, uncertain: (source.confidence ?? 0) < UNCERTAIN_LINE || weakWords.length > 0,
    };
    lines.push(line);
    if (isNoise(text)) { dropped.push({ lineId: id, text: line.text }); line.kind = "noise"; return; }
    const kinds = new Set();
    const segments = segmentsOf({ ...source, text }).filter((segment) => !isNoise(segment.text));
    const segmentKinds = segments.map(kindOf);
    const headerLine = segmentKinds.includes("header");
    // 표의 한 행(이름 칸 + [효능] 또는 복용 지시 칸)인데 이름 칸이 약 이름 꼴이 아니면(예: 지르텍평),
    // 첫 칸을 '흐릿한 약 이름 후보'로 본다. 글자는 바꾸지 않고 확인 필요로만 표시한다.
    const rowName = !headerLine && !segmentKinds.includes("name") && segments.length >= 2 &&
      segmentKinds[0] === "note" && segmentKinds.slice(1).some((kind) => kind === "effect" || kind === "instruction") &&
      /^[가-힣][가-힣A-Za-z0-9]{1,30}$/u.test(segments[0].text.replace(/\s/gu, ""));
    segments.forEach((segment, position) => {
      const guessed = rowName && position === 0;
      const kind = headerLine ? "header" : guessed ? "name" : segmentKinds[position];
      kinds.add(kind);
      const item = { lineId: id, text: segment.text, confidence: segment.confidence, uncertain: guessed || segment.confidence < UNCERTAIN_LINE, box: segment.box ?? line.box, ...(guessed ? { guessed: true } : {}),
        // 화면에서 흐린 글자만 표시하기 위한 글자별 신뢰도 (단어 위치가 있을 때만)
        glyphs: segment.words.length ? segment.words.map((word) => ({ text: word.text.trim(), weak: word.confidence < UNCERTAIN_WORD })) : null };
      if (kind === "header") headers.push(item);
      else if (kind === "title") { if (!title) title = item; else notes.push(item); }
      else if (kind === "name") {
        current = {
          id: "m" + (medicines.length + 1),
          name: { ...item, ...splitName(segment.text), suggestion: suggestionFor(segment.text) },
          details: [], effect: null, instruction: null,
        };
        medicines.push(current);
      } else if (kind === "instruction" || kind === "effect" || kind === "description") {
        const enriched = kind === "instruction" ? { ...item, ...parseInstruction(segment.text) } : item;
        if (current && (current.name.lineId === id || !line.box)) attach(current, kind, enriched);
        else pending.push({ kind, item: enriched });
      } else notes.push(item);
    });
    line.kind = [...kinds].join("+") || "noise";
  });

  // 같은 줄이 아닌 정보는 위치(세로 중심)가 가장 가까운 약에 붙인다. 위치가 없으면 앞의 약에 붙인다.
  for (const { kind, item } of pending) {
    const target = nearestMedicine(medicines, item, kind);
    if (target) attach(target, kind, item);
    else notes.push(item);
  }

  const uncertain = [
    ...medicines.flatMap((medicine) => [medicine.name, medicine.instruction].filter((field) => field?.uncertain)
      .map((field) => ({ medicineId: medicine.id, lineId: field.lineId, text: field.text }))),
  ];
  return {
    version: 1,
    rawText: result.text,
    confidence: result.confidence ?? null,
    title, medicines, notes, headers, dropped, lines, uncertain,
    edits: {}, confirmed: {},
  };
}

function attach(medicine, kind, item) {
  if (kind === "instruction") { if (!medicine.instruction) medicine.instruction = item; else medicine.details.push(item); }
  else if (kind === "effect") { if (!medicine.effect) medicine.effect = item; else medicine.details.push(item); }
  else medicine.details.push(item);
}

function nearestMedicine(medicines, item, kind) {
  if (!medicines.length) return null;
  const y = centerY(item.box);
  if (y === null) return medicines.at(-1);
  // 설명 줄은 이름 바로 아래에 있으므로 '자기보다 위에 있는' 가장 가까운 약에 붙인다.
  const candidates = medicines.filter((medicine) => medicine.name.box);
  if (!candidates.length) return medicines.at(-1);
  const scored = candidates.map((medicine) => {
    const top = medicine.name.box.y, height = Math.max(medicine.name.box.height, 0.01);
    const distance = kind === "description" ? (y >= top ? y - top : Infinity) : Math.abs(y - centerY(medicine.name.box));
    return { medicine, distance, height };
  }).sort((a, b) => a.distance - b.distance);
  const best = scored[0];
  return best.distance <= best.height * 4 ? best.medicine : null;
}

/** 사용자가 고친 값(edits)이 있으면 그 값, 없으면 OCR 값. */
export function fieldValue(structure, medicineId, field) {
  const edit = structure.edits[medicineId]?.[field];
  if (edit !== undefined) return edit;
  const medicine = structure.medicines.find((item) => item.id === medicineId);
  if (!medicine) return "";
  if (field === "name") return medicine.name.text;
  if (field === "instruction") return medicine.instruction?.text ?? "";
  if (field === "effect") return medicine.effect?.text ?? "";
  return "";
}

/** 고친 값을 원문과 따로 저장한 새 구조를 돌려준다. OCR 값과 같으면 고침 기록을 지운다. */
export function applyEdit(structure, medicineId, field, value) {
  const medicine = structure.medicines.find((item) => item.id === medicineId);
  const original = medicine ? fieldValue({ ...structure, edits: {} }, medicineId, field) : "";
  const nextFields = { ...(structure.edits[medicineId] ?? {}) };
  if (value.trim() === original.trim()) delete nextFields[field];
  else nextFields[field] = value.trim();
  const edits = { ...structure.edits, [medicineId]: nextFields };
  if (!Object.keys(nextFields).length) delete edits[medicineId];
  return { ...structure, edits, confirmed: { ...structure.confirmed, [medicineId]: false } };
}

/** 사용자가 직접 약을 추가할 때 (OCR 이 이름을 못 찾은 경우). 원문 줄이 없으므로 source 는 "user". */
export function addManualMedicine(structure, name = "") {
  const id = "u" + (structure.medicines.filter((item) => item.id.startsWith("u")).length + 1);
  const medicine = { id, source: "user", name: { lineId: null, text: "", confidence: null, uncertain: false, suggestion: null }, details: [], effect: null, instruction: null };
  return { ...structure, medicines: [...structure.medicines, medicine], edits: { ...structure.edits, [id]: { name } } };
}

export function removeMedicine(structure, medicineId) {
  const edits = { ...structure.edits };
  delete edits[medicineId];
  const confirmed = { ...structure.confirmed };
  delete confirmed[medicineId];
  return { ...structure, medicines: structure.medicines.filter((item) => item.id !== medicineId), edits, confirmed };
}

export function setConfirmed(structure, medicineId, value) {
  return { ...structure, confirmed: { ...structure.confirmed, [medicineId]: value } };
}

/** 등록 전에 확인할 것: 이름이 비었는지, 확인을 안 눌렀는지, 복용 지시가 없는지. */
export function validateMedicine(structure, medicineId) {
  const problems = [];
  const name = fieldValue(structure, medicineId, "name");
  if (!name.trim()) problems.push({ field: "name", level: "error", message: "약 이름이 비어 있어요." });
  if (!fieldValue(structure, medicineId, "instruction").trim()) {
    problems.push({ field: "instruction", level: "warning", message: "복용 지시를 찾지 못했어요. 봉투를 보고 시간을 직접 정해 주세요." });
  }
  const medicine = structure.medicines.find((item) => item.id === medicineId);
  const edited = structure.edits[medicineId] ?? {};
  if (medicine?.name.uncertain && edited.name === undefined && !structure.confirmed[medicineId]) {
    problems.push({ field: "name", level: "warning", message: "흐릿하게 읽힌 이름이에요. 봉투와 한 글자씩 대조해 주세요." });
  }
  if (!structure.confirmed[medicineId]) problems.push({ field: "confirm", level: "error", message: "봉투와 대조한 뒤 '확인했어요'를 눌러 주세요." });
  return problems;
}

/** 일정 등록에 넘길 최소 정보. 사진·전체 원문은 넘기지 않는다. */
export function registrationRecord(structure, medicineId) {
  const medicine = structure.medicines.find((item) => item.id === medicineId);
  const edited = structure.edits[medicineId] ?? {};
  return {
    name: fieldValue(structure, medicineId, "name").trim(),
    instruction: fieldValue(structure, medicineId, "instruction").trim(),
    ocrName: medicine?.name.text ?? "",
    nameEdited: edited.name !== undefined,
    instructionEdited: edited.instruction !== undefined,
    source: medicine?.source === "user" ? "user" : "ocr",
  };
}
