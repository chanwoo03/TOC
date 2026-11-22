import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildIndex, candidateRows, comparisonHighlights, duplicateIngredients, hasComparisonNotice, noticeIndexes, searchProducts, sections, warnsAgainstSameIngredient, warningSuggestions } from "../src/catalog.js";
import { detectMealSlots } from "../src/schedule.js";
import { rules } from "../src/data.js";
import { getReviewedProductRule, isReviewedRule } from "../src/safety.js";

const { products } = JSON.parse(readFileSync(new URL("../public/data/easy-drug.json", import.meta.url)));
const index = buildIndex(products);

test("standalone notices cover all products and keep empty categories out of filtered results", () => {
  const groups = noticeIndexes(index);
  assert.deepEqual(Object.fromEntries(Object.entries(groups).map(([key, rows]) => [key, rows.length])), {
    precautions: 4718, warnings: 1164, interactions: 3277, adverse_reactions: 4496, all: 4729,
  });
  assert.equal(searchProducts(groups.precautions, "200300406")[0]?.name, "닥터베아제정");
  assert.deepEqual(searchProducts(groups.interactions, "200300406"), []);
});

test("reviewed cases are visible while only the documented codes trigger a pair warning", () => {
  assert.equal(rules.filter(isReviewedRule).length, 6);
  const aspirin = searchProducts(index, "200108429")[0];
  const advil = searchProducts(index, "200109769")[0];
  const otherAspirin = searchProducts(index, "198700431")[0];
  const rule = getReviewedProductRule(aspirin, advil, rules);
  assert.equal(rule.title, "아스피린프로텍트정 + 애드빌정");
  assert.equal(getReviewedProductRule(advil, aspirin, rules), rule);
  assert.equal(getReviewedProductRule(otherAspirin, advil, rules), null);
  assert.equal(getReviewedProductRule(aspirin, { ...advil, code: "202000001" }, rules), null);
  assert.equal(rules.filter((item) => /^otc-\d{9}$/.test(item.a) && /^otc-\d{9}$/.test(item.b)).length, 1);
});

test("plain comparison notes reflect explicit text and preserve conditions", () => {
  const tylenol = searchProducts(index, "202106092")[0];
  const geborin = searchProducts(index, "202107495")[0];
  assert.deepEqual(comparisonHighlights(tylenol), {
    avoidTogether: false, checkFirst: true, avoidAlcohol: false, stopForSymptoms: true,
  });
  assert.deepEqual(comparisonHighlights(geborin), {
    avoidTogether: true, checkFirst: true, avoidAlcohol: true, stopForSymptoms: true,
  });
  assert.ok(warnsAgainstSameIngredient(geborin, "아세트아미노펜"));
  assert.ok(!warnsAgainstSameIngredient(tylenol, "아세트아미노펜"));
  assert.deepEqual(comparisonHighlights({ sections: {
    interactions: "복용 중 음주 여부는 제품에 따라 다릅니다.",
    adverse_reactions: "증상이 나타나는 경우 복용을 중지하지 말고 의사 또는 약사와 상의하십시오.",
  } }), { avoidTogether: false, checkFirst: false, avoidAlcohol: false, stopForSymptoms: false });
});

test("compare excludes products without either source field while the full catalog keeps them", () => {
  assert.ok(!hasComparisonNotice({ sections: { adverse_reactions: "  ", interactions: null } }));
  assert.ok(hasComparisonNotice({ sections: { adverse_reactions: null, interactions: "원문 예시" } }));
  assert.ok(hasComparisonNotice({ sections: { adverse_reactions: "원문 예시", interactions: null } }));
  const doctorBeaje = searchProducts(index, "200300406")[0];
  assert.equal(doctorBeaje.name, "닥터베아제정");
  assert.ok(doctorBeaje.sections.precautions);
  assert.ok(!hasComparisonNotice(doctorBeaje));
  assert.deepEqual(searchProducts(index.filter(({ product }) => hasComparisonNotice(product)), "200300406"), []);
});

test("official export preserves all expected records and their full sections", () => {
  assert.equal(products.length, 4729);
  assert.equal(new Set(products.map(({ code }) => code)).size, 4729);
  assert.equal(products.filter(({ sections }) => sections.interactions).length, 3277);
  assert.ok(products.every((product) => sections.every(([key]) => key in product.sections)));
  assert.equal(searchProducts(index, "202106092")[0].code, "202106092");
  assert.ok(searchProducts(index, "아세트아미노펜").length > 1);
  assert.ok(searchProducts(index, "켄뷰코리아").length > 0);
});

test("OCR candidates reject conflicting strengths and keep independent rows", () => {
  const related = candidateRows(index, "타이레놀정 500mg\n모르는 내용\n타이레놀정 500mg");
  assert.equal(related.length, 1);
  assert.ok(related[0].products.length <= 3);
  assert.equal(related[0].products[0].code, "202106092");
  assert.ok(!related[0].products.some(({ name }) => /160|325|650/.test(name)));
  assert.deepEqual(candidateRows(index, "생년월일 1980-01-01"), []);
  assert.ok(candidateRows(index, "타이렐놀정 500mg")[0].products
    .some(({ code }) => code === "202106092"));
});

test("the presentation photo's capsule typo keeps strength choices open", () => {
  const [row] = candidateRows(index, "\n".repeat(70) + "뮤테란칼셀20009");
  assert.equal(row.line, "뮤테란칼셀20009");
  assert.deepEqual(new Set(row.products.map(({ code }) => code)), new Set(["198801525", "198801531"]));
  const [withStrength] = candidateRows(index, "뮤테란칼셀200mg");
  assert.deepEqual(withStrength.products.map(({ code }) => code), ["198801525"]);
});

test("comparison counts exact official ingredients and never double counts the same product", () => {
  const a = searchProducts(index, "202106092")[0], b = searchProducts(index, "201504877")[0];
  assert.deepEqual(duplicateIngredients([a, a]), []);
  assert.ok(duplicateIngredients([a, b]).some(({ ingredient }) => ingredient === "아세트아미노펜"));
});

test("OCR detects meal labels without choosing a time or using another line", () => {
  assert.deepEqual(detectMealSlots("1일 2회"), []);
  assert.deepEqual(detectMealSlots("타이레놀정 아침"), [{ key: "morning", label: "아침", time: "", selected: false }]);
});

test("second-product suggestions require an exact ingredient in either interaction source", () => {
  const fixture = (code, ingredients, interactions, adverse_reactions = "") => ({
    code, name: code, ingredients, sections: { interactions, adverse_reactions },
  });
  const first = fixture("first", "성분가", "성분나와 함께 사용할 때");
  const forward = fixture("forward", "성분나", "");
  const reverse = fixture("reverse", "성분다", "성분가를 참고");
  const substring = fixture("substring", "성분라", "새성분가와 성분가변형");
  const adverseOnly = fixture("adverse-only", "성분마", "", "성분가");
  const noEvidence = fixture("no-evidence", "성분가", "");
  const matches = warningSuggestions(buildIndex([first, forward, reverse, substring, adverseOnly, noEvidence]), first);
  assert.deepEqual(matches.map(({ product, source }) => [product.code, source.code]), [
    ["forward", "first"], ["reverse", "reverse"],
  ]);
});
