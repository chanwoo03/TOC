const number = String.raw`[0-9]{1,3}(?:[.,][0-9]{1,2})?`;
const quantity = String.raw`${number}(?:\s*[~–-]\s*${number})?\s*(?:캡슐|캅셀|밀리리터|방울|정|포|매|mL)`;
const start = String.raw`(?<![\p{L}\p{N}.,~–-])`;
const compact = new RegExp(String.raw`${start}(${quantity})\s*씩\s*((?:1\s*일\s*)?[0-9]{1,2}\s*회)(?:\s*([0-9]{1,3}\s*일\s*분)(?![\p{L}\p{N}]))?(?![0-9회])`, "iu");
const perDose = new RegExp(String.raw`${start}(?:1\s*회\s*(?:투약량\s*[:：]?\s*)?(${quantity})(?![\p{L}\p{N}])|(${quantity})\s*씩(?![가-힣]))`, "iu");
const daily = /(?<![\p{L}\p{N}])(?:1\s*일|하루)\s*[0-9]{1,2}\s*회(?![\p{L}\p{N}])/u;
const duration = /(?<![\p{L}\p{N}.,~–-])(?:[0-9]{1,3}\s*일\s*분|복용\s*기간\s*[:：]?\s*[0-9]{1,3}\s*일)(?![\p{L}\p{N}])/u;

export function recognizedInstructionRows(text) {
  const lines = [...new Set(text.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean))];
  return lines.flatMap((line) => {
    const joined = line.match(compact);
    const single = joined ? null : line.match(perDose);
    const dose = joined?.[1] ?? single?.[1] ?? single?.[2];
    const frequency = joined?.[2] ?? line.match(daily)?.[0];
    const days = joined?.[3] ?? line.match(duration)?.[0];
    if (!dose && !frequency && !days) return [];
    return [{ line, dose, frequency, days }];
  });
}
