import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { dueItems, localDateKey, reminderKey } from "../src/reminders.js";
import { getReviewedRule } from "../src/safety.js";

test("100 products have valid ingredient and source relationships", () => {
  const data = JSON.parse(readFileSync(new URL("../src/catalog100.json", import.meta.url)));
  const productIds = new Set(data.products.map((product) => product.itemId));
  const ingredientIds = new Set(data.ingredients.map((ingredient) => ingredient.id));
  assert.equal(data.products.length, 100);
  assert.equal(productIds.size, 100);
  assert.equal(data.sourceNotices.length, 100);
  for (const product of data.products) {
    assert.ok(data.productIngredients.some((link) => link.itemId === product.itemId));
    assert.ok(data.sourceNotices.some((notice) => notice.itemId === product.itemId));
  }
  for (const link of data.productIngredients) {
    assert.ok(productIds.has(link.itemId));
    assert.ok(ingredientIds.has(link.ingredientId));
  }
});

test("a reminder waits for the scheduled time, survives a late page open, and never marks a dose taken", () => {
  const item = { id: "dose-1", med: "tylenol", time: "08:00", active: true };
  const data = { items: [item], logs: [], snoozes: {} };
  assert.deepEqual(dueItems(data, new Date(2026, 10, 11, 7, 59)), []);
  assert.deepEqual(dueItems(data, new Date(2026, 10, 11, 8, 0)), [item]);
  assert.deepEqual(dueItems(data, new Date(2026, 10, 11, 11, 0)), [item]);
  assert.deepEqual(data.logs, []);
});

test("recording or snoozing hides today's reminder until appropriate", () => {
  const now = new Date(2026, 10, 11, 8, 5);
  const date = localDateKey(now);
  const item = { id: "dose-2", med: "calcium", time: "08:00", active: true };
  const data = { items: [item], logs: [], snoozes: {} };
  data.snoozes[reminderKey(date, item.id)] = new Date(2026, 10, 11, 8, 15).toISOString();
  assert.deepEqual(dueItems(data, now), []);
  assert.deepEqual(dueItems(data, new Date(2026, 10, 11, 8, 15)), [item]);
  data.logs.push({ item: item.id, date, value: "taken" });
  assert.deepEqual(dueItems(data, new Date(2026, 10, 11, 8, 16)), []);
  data.logs[0].value = "skipped";
  assert.deepEqual(dueItems(data, new Date(2026, 10, 11, 8, 16)), []);
});

test("a source checked rule applies only to its reviewed pair", () => {
  const first = { id: "otc-a" };
  const second = { id: "otc-b" };
  const similar = { id: "otc-c" };
  const rules = [{
    a: first.id,
    b: second.id,
    source: "https://example.org/source",
    reviewStatus: "source_checked",
    reviewedOn: "2026-11-11",
  }];
  assert.equal(getReviewedRule(first, second, rules), rules[0]);
  assert.equal(getReviewedRule(first, similar, rules), null);
});
