export const sourceCatalog = "https://www.data.go.kr/data/15075057/openapi.do";
export const sourceDur = "https://nedrug.mfds.go.kr/searchDur";
export const sections = [
  ["efficacy", "효능·효과"],
  ["directions", "사용법"],
  ["warnings", "사용 전 경고"],
  ["precautions", "사용상 주의사항"],
  ["interactions", "함께 사용할 때 주의할 약·음식"],
  ["adverse_reactions", "이상반응"],
  ["storage", "보관법"],
];

export async function loadOfficialCatalog(signal) {
  const base = new URL(import.meta.env.BASE_URL + "data/easy-drug.json", document.baseURI);
  if (typeof DecompressionStream === "function") {
    try {
      const response = await fetch(base.href + ".gz", { signal });
      if (!response.ok) throw new Error("Compressed catalog unavailable");
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes[0] !== 31 || bytes[1] !== 139) return JSON.parse(new TextDecoder().decode(bytes));
      const decoded = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
      return await new Response(decoded).json();
    } catch (error) {
      if (signal.aborted) throw error;
    }
  }
  const response = await fetch(base, { signal });
  if (!response.ok) throw new Error("Catalog unavailable");
  return response.json();
}

export function normalize(value) {
  return String(value ?? "").normalize("NFKC").toLowerCase()
    .replace(/밀리그램|밀리그람/g, "mg")
    .replace(/마이크로그램|마이크로그람|[μµ]g/g, "mcg")
    .replace(/[^\p{L}\p{N}.]/gu, "");
}

export function ingredientParts(value) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    if ("([".includes(value[i])) depth++;
    if (")]".includes(value[i])) depth = Math.max(0, depth - 1);
    if (value[i] === "," && depth === 0) {
      parts.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  return [...parts, value.slice(start).trim()].filter(Boolean);
}

export function buildIndex(products) {
  return products.map((product) => ({
    product,
    name: normalize(product.name),
    stem: normalize(product.name.split(/[（(]/u)[0]),
    ingredients: normalize(product.ingredients),
    manufacturer: normalize(product.manufacturer),
  }));
}

export function searchProducts(index, query) {
  const text = normalize(query);
  if (!text) return index.map(({ product }) => product);
  return index.flatMap(({ product, name, ingredients, manufacturer }) => {
    const rank = product.code === text || name === text ? 5 : name.startsWith(text) ? 4
      : name.includes(text) ? 3 : ingredients.includes(text) ? 2 : manufacturer.includes(text) ? 1 : 0;
    return rank ? [{ product, rank }] : [];
  }).sort((a, b) => b.rank - a.rank || a.product.name.localeCompare(b.product.name, "ko"))
    .map(({ product }) => product);
}

export function hasComparisonNotice({ sections }) {
  return Boolean(sections.adverse_reactions?.trim() || sections.interactions?.trim());
}

export const noticeTopics = [
  ["precautions", "사용할 때 주의"],
  ["warnings", "사용 전 경고"],
  ["interactions", "같이 먹을 때 주의"],
  ["adverse_reactions", "부작용"],
];

export function noticeIndexes(index) {
  const groups = Object.fromEntries(noticeTopics.map(([field]) => [field, []]));
  groups.all = [];
  for (const entry of index) {
    let included = false;
    for (const [field] of noticeTopics) {
      if (entry.product.sections[field]?.trim()) {
        groups[field].push(entry);
        included = true;
      }
    }
    if (included) groups.all.push(entry);
  }
  return groups;
}

export function comparisonHighlights({ sections }) {
  const interactionLines = (sections.interactions ?? "").split(/\r?\n/).map((line) => line.trim());
  return {
    avoidTogether: interactionLines.some((line) => /함께 복용하지 마십시오\.?$/u.test(line)),
    checkFirst: interactionLines.some((line) =>
      /(?:복용하는 환자(?:는|은)|함께 복용\s*(?:시|하는 경우))\s*의사 또는 약사와 상의하십시오\.?$/u.test(line)),
    avoidAlcohol: interactionLines.some((line) => /^복용 중(?:에|에는)?\s*음주하지 마십시오\.?$/u.test(line)),
    stopForSymptoms: /(?:나타나는 경우|나타나면)\s*복용을\s*(?:즉각|즉시)\s*중지하고\s*의사 또는 약사와 상의하십시오\.?\s*$/u
      .test(sections.adverse_reactions ?? ""),
  };
}

export function warnsAgainstSameIngredient({ sections }, ingredient) {
  return (sections.interactions ?? "").split(/\r?\n/).some((line) => {
    const text = line.trim();
    return (text.startsWith(ingredient + "을 포함하는 다른 제품") || text.startsWith(ingredient + "를 포함하는 다른 제품")) &&
      /함께 복용하지 마십시오\.?$/u.test(text);
  });
}

function warningIngredients(product) {
  return ingredientParts(product.ingredients).flatMap((ingredient) => {
    const term = ingredient.normalize("NFKC").trim();
    if ((term.match(/\p{L}/gu) ?? []).length < 3) return [];
    const literal = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const suffix = "(?:이나|에게|에서|으로|과|와|을|를|이|가|은|는|의|에|로|도|만)?";
    const match = new RegExp("(?<![\\p{L}\\p{N}])" + literal + suffix + "(?![\\p{L}\\p{N}])", "iu");
    return [{ ingredient, match }];
  });
}

export function warningSuggestions(index, first) {
  if (!first) return [];
  const firstTerms = warningIngredients(first);
  const firstNotice = first.sections.interactions?.normalize("NFKC") ?? "";
  return index.flatMap(({ product }) => {
    if (product.code === first.code) return [];
    const candidateNotice = product.sections.interactions?.normalize("NFKC") ?? "";
    const firstMentions = firstNotice && warningIngredients(product).find(({ match }) => match.test(firstNotice));
    const candidateMentions = candidateNotice && firstTerms.find(({ match }) => match.test(candidateNotice));
    if (firstMentions) return [{ product, ingredient: firstMentions.ingredient, source: first }];
    if (candidateMentions) return [{ product, ingredient: candidateMentions.ingredient, source: product }];
    return [];
  }).sort((a, b) => a.product.name.localeCompare(b.product.name, "ko"));
}

function closeToken(left, right) {
  if (left.length === right.length) {
    return [...left].filter((char, i) => char !== right[i]).length <= 1;
  }
  if (Math.abs(left.length - right.length) !== 1) return false;
  const [shorter, longer] = left.length < right.length ? [left, right] : [right, left];
  let i = 0;
  while (shorter[i] === longer[i] && i < shorter.length) i++;
  return shorter.slice(i) === longer.slice(i + 1);
}

function strength(text) {
  return [...text.matchAll(/(\d+(?:\.\d+)?)(mg|mcg|ml|g)(?![a-z])/g)].map((match) => match[0]);
}

const dosageForm = /(?:캡슐|현탁액|시럽|과립|점안액|연고|크림|패취|정(?=\d|$))/;

export function candidateRows(index, text) {
  const distinct = new Set();
  return text.slice(0, 6000).split(/\r?\n/).flatMap((raw) => {
    const line = raw.trim().slice(0, 160);
    // Normalize capsule lettering before a strength. Leave unclear numbers and units untouched.
    const readableLine = line.replace(/(?:칼셀|캅셀|캡셀|캅슐)(?=\s*\d)/gu, "캡슐");
    const normalized = normalize(readableLine);
    if (normalized.length < 3 || distinct.has(normalized)) return [];
    distinct.add(normalized);
    const tokens = readableLine.match(/[가-힣A-Za-z][가-힣A-Za-z\d.]{2,24}/gu)?.map(normalize) ?? [];
    const lineStrength = strength(normalized);
    const form = normalized.match(dosageForm)?.[0];
    const matches = index.flatMap(({ product, name, stem }) => {
      const wholeStem = (stem.length >= 4 && normalized.includes(stem)) || (stem.length >= 3 && normalized === stem);
      const prefix = stem.match(/^[가-힣a-z]{3,}/u)?.[0];
      const literal = prefix && tokens.some((token) => token.length >= 3 &&
        (token.startsWith(prefix) || prefix.startsWith(token)));
      const medicationToken = prefix && prefix.length >= 4 && tokens.some((token) =>
        token.length >= 4 && closeToken(token, prefix));
      if (!wholeStem && !literal && !medicationToken) return [];
      const productStrength = strength(name);
      const productForm = stem.match(dosageForm)?.[0];
      const conflictingStrength = lineStrength.length && productStrength.length &&
        !lineStrength.some((part) => productStrength.includes(part));
      if (conflictingStrength || (form && productForm && form !== productForm)) return [];
      const score = (wholeStem ? 10 : literal ? 5 : 2) +
        (lineStrength.some((part) => productStrength.includes(part)) ? 3 : 0) + (form && productForm === form ? 1 : 0);
      return [{ product, score }];
    }).sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name, "ko"))
      .slice(0, 3).map(({ product }) => product);
    return matches.length ? [{ line, products: matches }] : [];
  });
}

export function duplicateIngredients(products) {
  const byIngredient = new Map();
  for (const product of products) {
    for (const ingredient of ingredientParts(product.ingredients)) {
      const token = normalize(ingredient);
      const entry = byIngredient.get(token) ?? { ingredient, products: new Map() };
      entry.products.set(product.code, product.name);
      byIngredient.set(token, entry);
    }
  }
  return [...byIngredient.values()].filter(({ products }) => products.size > 1);
}
