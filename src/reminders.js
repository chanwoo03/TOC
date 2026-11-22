// The browser keeps these dates in the user's local time zone.
export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isValidTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function reminderKey(date, itemId) {
  return `${date}:${itemId}`;
}

// A reminder stays visible after its scheduled time until the user records
// taken/skipped or asks to see it again later. No missed dose is assumed.
export function dueItems(data, now = new Date()) {
  const date = localDateKey(now);
  const currentMinute = now.getHours() * 60 + now.getMinutes();
  const recorded = new Set(
    (data.logs || [])
      .filter((log) => log.date === date && ["taken", "skipped"].includes(log.value))
      .map((log) => log.item),
  );

  return (data.items || [])
    .filter((item) => {
      if (!item.active || !isValidTime(item.time) || recorded.has(item.id))
        return false;
      const [hour, minute] = item.time.split(":").map(Number);
      if (hour * 60 + minute > currentMinute) return false;
      const until = Date.parse(data.snoozes?.[reminderKey(date, item.id)] || "");
      return !Number.isFinite(until) || until <= now.getTime();
    })
    .sort((first, second) => first.time.localeCompare(second.time));
}
