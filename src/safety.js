// A source notice describes one product. It is never turned into a pair warning
// by searching its text for another product or ingredient name.
export function getProductNotice(med) {
  if (!med?.itemId || !med.notice) return null;
  return {
    product: med.name,
    itemId: med.itemId,
    adverse: med.notice.adverseOriginal?.trim() || "",
    caution: med.notice.cautionOriginal?.trim() || "",
    source: med.source,
    modifiedOn: med.sourceModified,
  };
}

// Only data products with confirmed item IDs participate in exact-name overlap.
export function getSharedIngredients(first, second) {
  if (!first?.itemId || !second?.itemId || first.itemId === second.itemId)
    return [];
  const secondNames = new Set(second.ingredientNames || []);
  return (first.ingredientNames || []).filter((name) => secondNames.has(name));
}

// Rules are exact product/demo-item pairs. A new product is not covered merely
// because its displayed ingredient resembles a reviewed example.
export function getReviewedRule(first, second, rules) {
  if (!first || !second || first.id === second.id) return null;
  return (
    rules.find(
      (rule) =>
        rule.reviewStatus === "source_checked" &&
        rule.source &&
        rule.reviewedOn &&
        ((rule.a === first.id && rule.b === second.id) ||
          (rule.a === second.id && rule.b === first.id)),
    ) || null
  );
}

export function getReviewedRulesForItems(items, catalog, rules) {
  const activeIds = new Set(items.filter((item) => item.active).map((item) => item.med));
  const byId = new Map(catalog.map((med) => [med.id, med]));
  return rules.filter(
    (rule) =>
      activeIds.has(rule.a) &&
      activeIds.has(rule.b) &&
      getReviewedRule(byId.get(rule.a), byId.get(rule.b), [rule]),
  );
}
