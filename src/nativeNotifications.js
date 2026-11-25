import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { isValidTime, localDateKey, reminderKey } from "./reminders.js";

const managed = "medisync";
// 복약 알림 전용 채널: 중요도 높음(화면 위 팝업·소리), 잠금 화면에서는 내용 숨김.
// 채널 설정은 한 번 만들면 앱에서 바꿀 수 없어서 새 이름으로 만든다.
export const doseChannel = "medisync-dose";
let channelReady;
function ensureChannel() {
  if (!isNativeApp() || Capacitor.getPlatform() !== "android") return Promise.resolve();
  channelReady ??= LocalNotifications.createChannel({
    id: doseChannel,
    name: "복약 알림",
    description: "복용 시간과 10분 뒤 다시 알림",
    importance: 4,
    visibility: 0,
    vibration: true,
    lights: true,
  }).catch(() => { channelReady = undefined; });
  return channelReady;
}
export const notificationDaysAhead = 30;

export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

// Notification IDs must remain stable so editing or deleting an item replaces its alarm.
export function notificationId(value, kind = "daily") {
  let hash = 2166136261;
  for (const character of `${kind}:${value}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 1) || 1;
}

export function buildNativeNotifications(data, catalog, now = new Date()) {
  const products = new Map(catalog.map((product) => [product.id, product]));
  const notifications = [];
  const usedIds = new Set();
  const recorded = new Set(
    (data.logs || [])
      .filter((log) => ["taken", "skipped"].includes(log.value))
      .map((log) => reminderKey(log.date, log.item)),
  );
  for (const item of data.items || []) {
    if (!item.active || !isValidTime(item.time)) continue;
    const product = products.get(item.med);
    const [hour, minute] = item.time.split(":").map(Number);
    const guide = Array.isArray(product?.guide) && product.guide.length >= 3
      ? product.guide.slice(0, 3)
      : ["약 봉투와 제품 안내의 복용 지시를 확인하세요.",
        "놓친 복용을 임의로 두 배 보충하지 마세요.",
        "복용 여부는 앱에서 직접 기록하세요."];
    // One-shot alarms let a completed dose cancel that day's reminder.
    // The rolling 30-day window is refilled whenever the app is opened.
    for (let offset = 0; offset < notificationDaysAhead; offset++) {
      const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
      const date = localDateKey(day);
      const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute);
      if (at <= now || recorded.has(reminderKey(date, item.id))) continue;
      const id = notificationId(`${date}:${item.id}`);
      if (usedIds.has(id)) continue;
      usedIds.add(id);
      notifications.push({
        id,
        title: `${product?.name || "약"} 복용 시간`,
        body: guide[0],
        largeBody: guide.join("\n"),
        schedule: { at, allowWhileIdle: true },
        channelId: doseChannel,
        extra: { owner: managed, itemId: item.id, date, kind: "daily" },
      });
    }
  }

  const today = localDateKey(now);
  for (const item of data.items || []) {
    if (!item.active || recorded.has(reminderKey(today, item.id))) continue;
    const until = Date.parse(data.snoozes?.[reminderKey(today, item.id)] || "");
    if (!Number.isFinite(until) || until <= now.getTime()) continue;
    const id = notificationId(`${today}:${item.id}`, "snooze");
    if (usedIds.has(id)) continue;
    usedIds.add(id);
    const product = products.get(item.med);
    notifications.push({
      id,
      title: `${product?.name || "약"} 다시 확인해 주세요`,
      body: "복용 여부를 앱에서 직접 기록해 주세요.",
      schedule: { at: new Date(until), allowWhileIdle: true },
      channelId: doseChannel,
      extra: { owner: managed, itemId: item.id, date: today, kind: "snooze" },
    });
  }
  return notifications;
}

export async function getNativeNotificationStatus() {
  if (!isNativeApp()) return { native: false, permission: "web", exact: "web" };
  const permission = await LocalNotifications.checkPermissions();
  const exact = Capacitor.getPlatform() === "android"
    ? await LocalNotifications.checkExactNotificationSetting()
    : { exact_alarm: "granted" };
  return { native: true, permission: permission.display, exact: exact.exact_alarm };
}

export async function requestNativeNotificationPermission() {
  if (!isNativeApp()) return false;
  const result = await LocalNotifications.requestPermissions();
  return result.display === "granted";
}

export async function openExactAlarmSettings() {
  if (!isNativeApp() || Capacitor.getPlatform() !== "android") return false;
  await LocalNotifications.changeExactNotificationSetting();
  return true;
}

// A short test lets the user check the phone's permission, sound and lock-screen
// behavior before relying on a medication reminder. It never records a dose.
export async function scheduleTestNotification(now = new Date()) {
  const status = await getNativeNotificationStatus();
  if (status.permission !== "granted") return { enabled: false };
  await ensureChannel();
  const id = notificationId("device-check", "test");
  await LocalNotifications.cancel({ notifications: [{ id }] });
  const at = new Date(now.getTime() + 15_000);
  const result = await LocalNotifications.schedule({
    notifications: [{
      id,
      title: "MediSync AI 알림 시험",
      body: "알림이 도착했어요. 실제 복용은 앱에서 직접 기록해 주세요.",
      schedule: { at, allowWhileIdle: true },
      isExactNotification: status.exact === "granted",
      channelId: doseChannel,
      extra: { owner: "medisync-test", kind: "test" },
    }],
  });
  return { enabled: true, at, warning: result.warning };
}

let syncQueue = Promise.resolve();

async function performSync(data, catalog) {
  const status = await getNativeNotificationStatus();
  if (!status.native) return { ...status, count: 0 };

  const pending = await LocalNotifications.getPending();
  const ours = pending.notifications.filter((notice) => notice.extra?.owner === managed);
  if (ours.length) await LocalNotifications.cancel({ notifications: ours.map(({ id }) => ({ id })) });
  if (status.permission !== "granted") return { ...status, count: 0 };
  await ensureChannel();

  const notifications = buildNativeNotifications(data, catalog).map((notice) => ({
    ...notice,
    isExactNotification: status.exact === "granted",
  }));
  if (!notifications.length) return { ...status, count: 0 };
  const result = await LocalNotifications.schedule({ notifications });
  return { ...status, count: notifications.length, warning: result.warning };
}

// Keep rapid edits in order; an older request must not overwrite a newer schedule.
export function syncNativeNotifications(data, catalog) {
  const next = syncQueue.catch(() => {}).then(() => performSync(data, catalog));
  syncQueue = next;
  return next;
}

export function onNativeNotificationTap(callback) {
  if (!isNativeApp()) return Promise.resolve(null);
  return LocalNotifications.addListener("localNotificationActionPerformed", callback);
}
