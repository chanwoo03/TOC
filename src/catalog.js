import snapshot from "./catalog100.json";

// Workbook relationships: PRODUCT -> PRODUCT_SUBSTANCE -> SUBSTANCE.
const ingredientById = new Map(
  snapshot.ingredients.map((ingredient) => [ingredient.id, ingredient.name]),
);
const ingredientIdsByProduct = new Map();
for (const link of snapshot.productIngredients) {
  const ids = ingredientIdsByProduct.get(link.itemId) || [];
  ids.push(link.ingredientId);
  ingredientIdsByProduct.set(link.itemId, ids);
}
const noticeByProduct = new Map(
  snapshot.sourceNotices.map((notice) => [notice.itemId, notice]),
);

// Keep the official item ID so similarly named products stay separate.
export const otcProducts = snapshot.products.map((product) => {
  const ingredientNames = (ingredientIdsByProduct.get(product.itemId) || [])
    .map((ingredientId) => ingredientById.get(ingredientId))
    .filter(Boolean);

  return {
    id: `otc-${product.itemId}`,
    itemId: product.itemId,
    name: product.displayName,
    officialName: product.officialName,
    ingredient: ingredientNames.join(", "),
    ingredientNames,
    type: `${product.category} · 일반약`,
    manufacturer: product.manufacturer,
    sourceModified: product.modifiedOn,
    source: product.sourceUrl,
    notice: noticeByProduct.get(product.itemId),
    emoji: "💊",
    guide: [
      "제품 설명서와 처방 지시에서 놓친 복용에 관한 내용을 확인하세요.",
      "확인되지 않은 상태에서 복용량이나 간격을 임의로 바꾸지 마세요.",
      "판단이 어렵다면 약사나 의료진에게 문의하세요.",
    ],
  };
});

// This detects an exact shared ingredient name. It does not judge safety.
export function sharedIngredientPairs(items, catalog) {
  const byId = new Map(catalog.map((med) => [med.id, med]));
  const selected = items
    .filter((item) => item.active)
    .map((item) => byId.get(item.med))
    .filter((med) => med?.itemId);
  const found = [];
  const seen = new Set();

  for (let i = 0; i < selected.length; i += 1) {
    for (let j = i + 1; j < selected.length; j += 1) {
      const first = selected[i];
      const second = selected[j];
      if (first.itemId === second.itemId) continue;
      const pairKey = [first.itemId, second.itemId].sort().join(":");
      if (seen.has(pairKey)) continue;
      const secondNames = new Set(second.ingredientNames);
      const shared = first.ingredientNames.filter((name) =>
        secondNames.has(name),
      );
      if (shared.length) {
        found.push({ first, second, ingredients: shared });
        seen.add(pairKey);
      }
    }
  }

  return found;
}
