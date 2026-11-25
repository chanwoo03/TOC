import assert from "node:assert/strict";
import test from "node:test";
import {
  buildNativeNotifications,
  notificationId,
} from "../src/nativeNotifications.js";

test("native reminders follow active schedules and keep stable IDs", () => {
  const data = {
    items: [
      { id: "morning", med: "a", time: "08:15", active: true },
      { id: "paused", med: "b", time: "19:00", active: false },
    ],
    logs: [],
    snoozes: {},
  };
  const catalog = [
    { id: "a", name: "예시 약", guide: ["첫째 안내", "둘째 안내", "셋째 안내"] },
    { id: "b", name: "다른 약" },
  ];
  const before = JSON.stringify(data);
  const notifications = buildNativeNotifications(data, catalog, new Date(2026, 10, 18, 7));
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].id, notificationId("morning"));
  assert.deepEqual(notifications[0].schedule.on, { hour: 8, minute: 15 });
  assert.equal(notifications[0].extra.kind, "daily");
  assert.match(notifications[0].largeBody, /첫째 안내\n둘째 안내\n셋째 안내/);
  assert.equal(JSON.stringify(data), before);
});

test("recorded doses suppress snooze but do not mark a recurring dose complete", () => {
  const now = new Date(2026, 10, 18, 8, 5);
  const item = { id: "dose", med: "a", time: "08:00", active: true };
  const data = {
    items: [item],
    logs: [],
    snoozes: { "2026-11-18:dose": new Date(2026, 10, 18, 8, 15).toISOString() },
  };
  const catalog = [{ id: "a", name: "예시 약" }];
  assert.equal(buildNativeNotifications(data, catalog, now).length, 2);
  data.logs.push({ item: "dose", date: "2026-11-18", value: "taken" });
  const after = buildNativeNotifications(data, catalog, now);
  assert.equal(after.length, 1);
  assert.equal(after[0].extra.kind, "daily");
});
