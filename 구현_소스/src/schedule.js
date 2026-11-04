export const mealOptions = [
  { key: "morning", label: "아침", exampleTime: "08:00" },
  { key: "lunch", label: "점심", exampleTime: "12:30" },
  { key: "evening", label: "저녁", exampleTime: "19:00" },
  { key: "bedtime", label: "취침 전", exampleTime: "22:00" },
];

// 약 봉투의 시간대 단어만 후보로 찾습니다. 어느 약의 지시인지는 판단하지 않습니다.
export function detectMealSlots(text) {
  const normalized = String(text || "").replace(/\s+/g, " ");
  return mealOptions
    .filter(({ key }) => {
      if (key === "morning") return /아침|조식/.test(normalized);
      if (key === "lunch") return /점심|중식/.test(normalized);
      if (key === "evening") return /저녁|석식/.test(normalized);
      return /취침\s*전|자기\s*전/.test(normalized);
    })
    .map(({ key, label, exampleTime }) => ({
      key,
      label,
      time: exampleTime,
      selected: true,
    }));
}
