import test from "node:test";
import assert from "node:assert/strict";
import { buildNativeNotifications, notificationDaysAhead } from "../src/nativeNotifications.js";

const catalog = [{ id: "sample", name: "시험 약", guide: ["첫 줄", "둘째 줄", "셋째 줄"] }];
const item = { id: "dose-1", med: "sample", time: "08:00", active: true };
const now = new Date(2026, 10, 23, 7, 30);

test("앱을 닫아도 사용할 수 있도록 앞으로 30일치 일회성 알림을 만든다", () => {
  const notices = buildNativeNotifications({ items: [item], logs: [], snoozes: {} }, catalog, now);
  assert.equal(notices.length, notificationDaysAhead);
  assert.equal(notices[0].extra.date, "2026-11-23");
  assert.equal(notices[0].schedule.at.getHours(), 8);
  assert.equal(notices[0].largeBody, "첫 줄\n둘째 줄\n셋째 줄");
  assert.equal(new Set(notices.map((notice) => notice.id)).size, notices.length);
});

test("오늘 복용 완료로 기록했다면 오늘 알림만 제외한다", () => {
  const notices = buildNativeNotifications({
    items: [item], logs: [{ item: item.id, date: "2026-11-23", value: "taken" }], snoozes: {},
  }, catalog, now);
  assert.equal(notices.length, notificationDaysAhead - 1);
  assert.equal(notices[0].extra.date, "2026-11-24");
});

test("10분 재알림은 미기록 상태에만 남는다", () => {
  const snoozes = { "2026-11-23:dose-1": new Date(2026, 10, 23, 7, 40).toISOString() };
  const pending = buildNativeNotifications({ items: [item], logs: [], snoozes }, catalog, now);
  assert.equal(pending.filter((notice) => notice.extra.kind === "snooze").length, 1);
  const recorded = buildNativeNotifications({
    items: [item], logs: [{ item: item.id, date: "2026-11-23", value: "skipped" }], snoozes,
  }, catalog, now);
  assert.equal(recorded.filter((notice) => notice.extra.kind === "snooze").length, 0);
});
