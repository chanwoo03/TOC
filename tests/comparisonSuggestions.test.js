import assert from "node:assert/strict";
import test from "node:test";
import { getComparisonSuggestions } from "../src/safety.js";

test("recommendations include only reviewed pairs or exact ingredient overlap", () => {
  const first = { id: "a", itemId: "1", name: "첫 약", ingredientNames: ["성분 A"] };
  const reviewed = { id: "b", name: "검토된 약" };
  const same = { id: "c", itemId: "3", name: "같은 성분 약", ingredientNames: ["성분 A"] };
  const mentioned = {
    id: "d", itemId: "4", name: "원문에만 나온 약", ingredientNames: ["성분 D"],
    notice: { cautionOriginal: "첫 약" },
  };
  const rules = [{ a: "a", b: "b", reviewStatus: "source_checked", source: "https://example.org", reviewedOn: "2026-11-11" }];
  const result = getComparisonSuggestions(first, [first, same, mentioned, reviewed], rules);
  assert.deepEqual(result.map(({ product }) => product.id), ["b", "c"]);
  assert.equal(result[0].rule, rules[0]);
  assert.deepEqual(result[1].sharedIngredients, ["성분 A"]);
});
