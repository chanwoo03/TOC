export const meds = [
  {
    id: "tylenol",
    name: "타이레놀정 500mg",
    ingredient: "아세트아미노펜",
    type: "진통·해열제",
    emoji: "💊",
    source: "https://medlineplus.gov/druginfo/meds/a681004.html",
    guide: [
      "한 번 놓쳤다면 증상과 제품 설명서를 확인하세요.",
      "다음 복용을 위해 임의로 두 배 복용하지 마세요.",
      "다른 감기약에 같은 성분이 들어 있는지도 확인하세요.",
    ],
  },
  {
    id: "advil",
    name: "애드빌정",
    ingredient: "이부프로펜",
    type: "소염진통제",
    emoji: "💊",
    source: "https://medlineplus.gov/druginfo/meds/a682159.html",
    guide: [
      "필요할 때 먹는 약은 건너뛰었다고 반드시 문제가 생기지는 않아요.",
      "제품의 용법과 다음 복용 간격을 확인하세요.",
      "임의로 두 배 복용하지 마세요.",
    ],
  },
  {
    id: "zyrtec",
    name: "지르텍정",
    ingredient: "세티리진",
    type: "알레르기약",
    emoji: "🌿",
    source: "https://medlineplus.gov/druginfo/meds/a698026.html",
    guide: [
      "복용을 놓쳤다면 제품 또는 처방 지시를 확인하세요.",
      "임의로 두 배 복용하지 마세요.",
      "증상이 지속되면 전문가에게 문의하세요.",
    ],
  },
  {
    id: "thyroid",
    name: "갑상선 호르몬 약",
    ingredient: "레보티록신",
    type: "처방약",
    emoji: "🦋",
    source: "https://medlineplus.gov/druginfo/meds/a682461.html",
    guide: [
      "매일 일정하게 복용하도록 처방되는 약이에요.",
      "놓쳤을 때는 처방 지시를 확인하고 임의로 두 배 복용하지 마세요.",
      "칼슘·철분과의 복용 간격을 전문가에게 확인하세요.",
    ],
  },
  {
    id: "cholesterol",
    name: "콜레스테롤 약",
    ingredient: "심바스타틴",
    type: "처방약",
    emoji: "❤️",
    source: "https://medlineplus.gov/druginfo/meds/a692030.html",
    guide: [
      "반복해서 놓치지 않도록 복용 기록을 살펴보세요.",
      "놓쳤을 때 임의로 두 배 복용하지 마세요.",
      "자몽 섭취에 관한 제품별 주의사항을 확인하세요.",
    ],
  },
  {
    id: "doxy",
    name: "항생제",
    ingredient: "독시사이클린",
    type: "처방약",
    emoji: "🧫",
    source: "https://medlineplus.gov/druginfo/meds/a682063.html",
    guide: [
      "처방받은 복용 일정을 따르세요.",
      "놓쳤을 때 임의로 두 배 복용하지 마세요.",
      "칼슘·철분과의 복용 간격을 전문가에게 확인하세요.",
    ],
  },
  {
    id: "calcium",
    name: "칼슘 영양제",
    ingredient: "칼슘",
    type: "영양제",
    emoji: "🦴",
    source: "https://ods.od.nih.gov/factsheets/Calcium-HealthProfessional/",
    guide: [
      "한 번 놓쳤다고 임의로 두 배 섭취하지 마세요.",
      "제품에 표시된 하루 섭취량을 확인하세요.",
      "갑상선 약이나 일부 항생제와 함께 먹는지 확인하세요.",
    ],
  },
  {
    id: "iron",
    name: "철분 영양제",
    ingredient: "철분",
    type: "영양제",
    emoji: "🩸",
    source: "https://ods.od.nih.gov/factsheets/Iron-HealthProfessional/",
    guide: [
      "한 번 놓쳤다고 임의로 두 배 섭취하지 마세요.",
      "제품에 표시된 하루 섭취량을 확인하세요.",
      "갑상선 약이나 일부 항생제와 함께 먹는지 확인하세요.",
    ],
  },
  {
    id: "vitd",
    name: "비타민 D 영양제",
    ingredient: "비타민 D",
    type: "영양제",
    emoji: "☀️",
    source: "https://ods.od.nih.gov/factsheets/VitaminD-HealthProfessional/",
    guide: [
      "한 번 놓쳤다고 임의로 두 배 섭취하지 마세요.",
      "제품의 하루 섭취량을 확인하세요.",
      "복용 중인 약이 있다면 약사에게 함께 먹어도 되는지 확인하세요.",
    ],
  },
];
export const rules = [
  {
    a: "thyroid",
    b: "calcium",
    title: "갑상선 약 + 칼슘",
    detail:
      "칼슘이 레보티록신 흡수를 줄일 수 있어요. 복용 간격은 처방과 제품 안내를 확인하세요.",
    source: "https://medlineplus.gov/druginfo/meds/a682461.html",
  },
  {
    a: "thyroid",
    b: "iron",
    title: "갑상선 약 + 철분",
    detail:
      "철분이 레보티록신 흡수를 줄일 수 있어요. 복용 간격은 처방과 제품 안내를 확인하세요.",
    source: "https://medlineplus.gov/druginfo/meds/a682461.html",
  },
  {
    a: "doxy",
    b: "calcium",
    title: "항생제 + 칼슘",
    detail:
      "칼슘 보충제가 독시사이클린 흡수에 영향을 줄 수 있어요. 전문가에게 복용 간격을 확인하세요.",
    source: "https://medlineplus.gov/druginfo/meds/a682063.html",
  },
  {
    a: "doxy",
    b: "iron",
    title: "항생제 + 철분",
    detail:
      "철분 보충제가 독시사이클린 흡수에 영향을 줄 수 있어요. 전문가에게 복용 간격을 확인하세요.",
    source: "https://medlineplus.gov/druginfo/meds/a682063.html",
  },
  {
    a: "cholesterol",
    b: "grapefruit",
    title: "콜레스테롤 약 + 자몽",
    detail:
      "심바스타틴은 자몽과 상호작용할 수 있어요. 복용 중인 제품에 해당하는지 확인하세요.",
    source:
      "https://www.fda.gov/consumers/consumer-updates/grapefruit-juice-and-some-drugs-dont-mix",
  },
];
export const food = {
  id: "grapefruit",
  name: "자몽·자몽주스",
  ingredient: "자몽",
  type: "음식",
  emoji: "🍊",
};
export const initial = {
  items: [
    { id: "sample1", med: "thyroid", time: "08:00", active: true },
    { id: "sample2", med: "calcium", time: "20:00", active: true },
    { id: "sample3", med: "tylenol", time: "21:00", active: false },
  ],
  logs: [],
  custom: [],
  name: "나",
};
