import assert from "node:assert/strict";
import { test } from "node:test";
import { dueItems, localDateKey, reminderKey } from "../src/reminders.js";

test("a missed schedule remains visible after a late page open", () => {
  const item = { id: "morning", med: "example", time: "08:00", active: true };
  const data = { items: [item], logs: [], snoozes: {} };
  assert.deepEqual(dueItems(data, new Date(2026, 10, 23, 7, 59)), []);
  assert.deepEqual(dueItems(data, new Date(2026, 10, 23, 19, 0)), [item]);
  assert.deepEqual(data.logs, []);
});

test("a saved snooze survives reload and recorded doses stop the reminder", () => {
  const item = { id: "evening", med: "example", time: "08:00", active: true };
  const date = localDateKey(new Date(2026, 10, 23, 8, 5));
  const saved = JSON.stringify({
    items: [item],
    logs: [],
    snoozes: { [reminderKey(date, item.id)]: new Date(2026, 10, 23, 8, 15).toISOString() },
  });
  const restored = JSON.parse(saved);
  assert.deepEqual(dueItems(restored, new Date(2026, 10, 23, 8, 10)), []);
  assert.deepEqual(dueItems(restored, new Date(2026, 10, 23, 8, 15)), [item]);
  restored.logs.push({ item: item.id, date, value: "taken" });
  assert.deepEqual(dueItems(restored, new Date(2026, 10, 23, 8, 16)), []);
});
