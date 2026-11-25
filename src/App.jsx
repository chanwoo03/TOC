import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Apple, BookOpenText, CalendarCheck, Check, ChevronRight, Download, House,
  Pill, PillBottle, Plus, ScanText, Settings, Tablets, Upload,
} from "lucide-react";
import { meds, initial } from "./data.js";
import { detectMealSlots } from "./schedule.js";
import { buildIndex, duplicateIngredients, loadOfficialCatalog } from "./catalog.js";
import { CatalogPage, CatalogStatus, ComparePage, ProductPicker } from "./CatalogViews.jsx";
import { OcrPanel } from "./OcrPanel.jsx";
import { dueItems, localDateKey, reminderKey } from "./reminders.js";
import {
  getNativeNotificationStatus, isNativeApp, notificationDaysAhead,
  onNativeNotificationTap, openExactAlarmSettings,
  requestNativeNotificationPermission, scheduleTestNotification, syncNativeNotifications,
} from "./nativeNotifications.js";
const key = "medisync-react-v1",
  today = () => localDateKey(),
  id = () => Math.random().toString(36).slice(2);
const emptyProfile = { ...initial, items: [] };
const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const officialId = (product) => "mfds:" + product.code;
const navIcons = {
  "홈": House, "내 약": Pill, "의약품 정보": BookOpenText, "함께 먹기": Tablets,
  "복용 기록": CalendarCheck, "약 봉투 읽기": ScanText, "설정": Settings,
};
const navShort = { "의약품 정보": "의약품", "복용 기록": "기록", "약 봉투 읽기": "봉투 읽기" };
// 약 종류에 따라 아이콘과 색을 나눔: 처방약(초록) · 영양제(호박색) · 음식 · 그 밖의 약
function MedIcon({ med }) {
  const type = med?.type || "";
  const kind = type.includes("영양제") ? "supplement" : type === "음식" ? "food" : type.includes("처방") ? "rx" : "otc";
  const Icon = kind === "supplement" ? PillBottle : kind === "food" ? Apple : Pill;
  return <span className={"med-emoji med-" + kind} aria-hidden="true"><Icon size={20} strokeWidth={1.9} /></span>;
}
function App() {
  const [data, setData] = useState(() => {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v && Array.isArray(v.items) && Array.isArray(v.logs) ? { ...emptyProfile, ...v } : emptyProfile;
    } catch {
      return emptyProfile;
    }
  });
  const [tab, setTab] = useState("홈"),
    [modal, setModal] = useState(""),
    [chosen, setChosen] = useState(""),
    [time, setTime] = useState(""),
    [note, setNote] = useState(""),
    [customName, setCustomName] = useState(""),
    [customIng, setCustomIng] = useState(""),
    [date, setDate] = useState(today()),
    [suggestions, setSuggestions] = useState([]),
    [ocrInfo, setOcrInfo] = useState(null),
    [message, setMessage] = useState(""),
    [now, setNow] = useState(() => new Date());
  const [source, setSource] = useState({ state: "loading", products: [] });
  const [attempt, setAttempt] = useState(0);
  const [detail, setDetail] = useState(null);
  const [nativeStatus, setNativeStatus] = useState(null);
  const [nativeRefresh, setNativeRefresh] = useState(0);
  const retry = () => setAttempt((value) => value + 1);
  const index = useMemo(() => buildIndex(source.products), [source.products]);
  const allOfficial = useMemo(() => new Map(source.products.map((product) => [officialId(product), product])), [source.products]);
  const nativeCatalog = useMemo(() => [
    ...meds, ...(data.custom || []),
    ...source.products.map((product) => ({ ...product, id: officialId(product) })),
  ], [data.custom, source.products]);

  useEffect(() => {
    const controller = new AbortController();
    setSource({ state: "loading", products: [] });
    loadOfficialCatalog(controller.signal).then((result) => {
      if (!Array.isArray(result.products) || !result.products.length) throw new Error("catalog invalid");
      if (!controller.signal.aborted) setSource({ state: "ready", products: result.products });
    }).catch(() => {
      if (!controller.signal.aborted) setSource({ state: "error", products: [] });
    });
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => localStorage.setItem(key, JSON.stringify(data)), [data]);
  useEffect(() => {
    if (!isNativeApp()) return;
    let current = true;
    syncNativeNotifications(data, nativeCatalog)
      .then((status) => { if (current) setNativeStatus(status); })
      .catch(() => { if (current) setNativeStatus((previous) => ({ ...previous, error: "알림 예약을 확인할 수 없어요. 앱을 다시 열어 주세요." })); });
    return () => { current = false; };
  }, [data.items, data.logs, data.snoozes, nativeCatalog, nativeRefresh, localDateKey(now)]);
  useEffect(() => {
    if (!isNativeApp()) return;
    const refresh = () => {
      if (document.visibilityState === "visible") {
        setNow(new Date());
        setNativeRefresh((value) => value + 1);
      }
    };
    document.addEventListener("visibilitychange", refresh);
    let listener;
    let disposed = false;
    onNativeNotificationTap(() => {
      setTab("홈");
      setNow(new Date());
      setNativeRefresh((value) => value + 1);
    }).then((handle) => {
      if (disposed) handle?.remove();
      else listener = handle;
    }).catch(() => {});
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", refresh);
      listener?.remove();
    };
  }, []);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (isNativeApp()) return;
    if (!("Notification" in window) || Notification.permission !== "granted")
      return;
    for (const item of dueItems(data, now)) {
      const cycle = data.snoozes?.[reminderKey(today(), item.id)] || "first";
      const noticeKey = `medisync-alert-${reminderKey(today(), item.id)}-${cycle}`;
      if (sessionStorage.getItem(noticeKey)) continue;
      sessionStorage.setItem(noticeKey, "1");
      try {
        new Notification("MediSync AI 복약 알림", {
          body: `${item.time} 예정 · 복용 여부를 앱에서 직접 확인해 주세요.`,
        });
      } catch {
        // 화면 안의 복용 알림은 브라우저 시스템 알림이 실패해도 유지합니다.
      }
    }
  }, [data, now]);
  useEffect(() => {
    if (message) {
      const t = setTimeout(() => setMessage(""), 3500);
      return () => clearTimeout(t);
    }
  }, [message]);
  const find = (value) => {
    const official = allOfficial.get(value);
    return official
      ? { ...official, ingredient: official.ingredients, emoji: "💊", type: "식약처 일반의약품" }
      : [...data.custom, ...meds].find((item) => item.id === value)
        ?? { name: value?.startsWith("mfds:") ? "공식 제품 확인 중" : "확인할 수 없는 항목", ingredient: "확인 필요", emoji: "💊" };
  };
  const status = (item, d = today()) =>
    data.logs.find((l) => l.item === item && l.date === d)?.value;
  const active = data.items
    .filter((x) => x.active)
    .sort((x, y) => x.time.localeCompare(y.time));
  const due = dueItems(data, now);
  const dueIds = new Set(due.map((item) => item.id));
  const nowClock = now.toTimeString().slice(0, 5);
  const upcoming = active.find((x) => x.time >= nowClock && !status(x.id));
  const activeProducts = [...new Set(active.map((item) => item.med))].map((value) => allOfficial.get(value)).filter(Boolean);
  const duplicate = duplicateIngredients(activeProducts);
  const unlinked = active.filter((item) => !allOfficial.has(item.med)).length;
  const record = (item, value, d = today()) => {
    setData((p) => ({
      ...p,
      logs: [
        ...p.logs.filter((x) => !(x.item === item && x.date === d)),
        { item, date: d, value, at: new Date().toISOString() },
      ],
    }));
    setMessage(
      value === "taken" ? "복용 완료로 기록했어요." : "미복용으로 기록했어요.",
    );
  };
  // 휴대폰 앱: 알림 권한·정확한 알람이 꺼져 있으면 홈 맨 위에서 바로 켤 수 있게 함
  const nativeNeeds = isNativeApp() && nativeStatus?.native
    ? (nativeStatus.permission !== "granted" ? "permission" : nativeStatus.exact !== "granted" ? "exact" : "")
    : "";
  const allowNotifications = async () => {
    try {
      const allowed = await requestNativeNotificationPermission();
      setMessage(allowed ? "휴대폰 알림을 허용했어요."
        : "알림이 허용되지 않았어요. 휴대폰 설정 > 애플리케이션 > MediSync AI > 알림에서 켤 수 있어요.");
    } catch {
      setMessage("알림 권한을 확인하지 못했어요.");
    }
    setNativeRefresh((value) => value + 1);
  };
  const allowExactAlarms = async () => {
    try { await openExactAlarmSettings(); }
    catch { setMessage("휴대폰 설정에서 이 앱의 '알람 및 리마인더' 권한을 켜 주세요."); }
  };
  const openAdd = (med = "") => {
    setChosen(med);
    setTime("");
    setNote("");
    setModal("add");
  };
  const ocrDone = useRef(null);
  const openOcrReview = (product, line) => {
    setChosen(officialId(product));
    setSuggestions(detectMealSlots(line));
    setOcrInfo(null);
    ocrDone.current = null;
    setModal("ocr-review");
  };
  // 약 봉투 카드에서 '일정 만들기': e약은요 제품을 연결했으면 그 제품, 아니면 확인한 이름으로 직접 입력 약을 만든다.
  // 직접 입력 약은 시간까지 확인하고 등록할 때 만든다 (창을 닫으면 아무것도 저장하지 않음).
  const openOcrRecord = (record, product, done) => {
    setChosen(product ? officialId(product) : "ocr-pending");
    setSuggestions(detectMealSlots(record.instruction));
    setOcrInfo({ ...record, frequency: record.instruction.match(/(\d{1,2})\s*회/u)?.[1] ?? null });
    ocrDone.current = done;
    setModal("ocr-review");
  };
  const addOcrTime = () => setSuggestions((previous) => [...previous, {
    key: "custom-" + id(), label: "직접 정한 시간", time: "", selected: true,
  }]);

  const addOcrSchedule = () => {
    const confirmed = suggestions.filter((slot) => slot.selected);
    if (confirmed.length === 0) {
      setMessage("등록할 시간대를 하나 이상 선택해 주세요.");
      return;
    }
    if (
      confirmed.some((slot) => !clock.test(slot.time))
    ) {
      setMessage("복용 예정 시간을 확인해 주세요.");
      return;
    }
    const med = chosen === "ocr-pending" ? "custom" + id() : chosen;
    const edited = ocrInfo?.nameEdited ? " · 이름 직접 고침" : "";
    setData((previous) => ({
      ...previous,
      custom: chosen === "ocr-pending" ? [...previous.custom, {
        id: med,
        name: ocrInfo.name,
        ingredient: "성분 미확인",
        type: "약 봉투에서 등록",
        emoji: "💊",
        // 사진에서 읽은 이름과 사용자가 확인한 이름을 따로 남긴다 (사진·전체 원문은 저장하지 않음)
        ocr: { printedName: ocrInfo.ocrName || null, nameEdited: ocrInfo.nameEdited, instruction: ocrInfo.instruction || null },
        guide: [
          "약 봉투와 처방 지시를 확인하세요.",
          "놓친 복용은 의료진이나 약사에게 문의하세요.",
          "검증 자료가 없어 상호작용을 판단할 수 없습니다.",
        ],
      }] : previous.custom,
      items: [
        ...previous.items,
        ...confirmed.map((slot) => ({
          id: id(),
          med,
          time: slot.time,
          active: true,
          note: "약 봉투 확인: " + slot.label + edited,
        })),
      ],
    }));
    setModal("");
    ocrDone.current?.();
    ocrDone.current = null;
    setMessage(confirmed.length + "개의 복용 일정을 등록했어요.");
    if (nativeNeeds === "permission") allowNotifications();
  };

  const add = () => {
    if (!chosen) return setMessage("약을 먼저 선택해 주세요.");
    if (!clock.test(time)) return setMessage("실제 복용할 시각을 입력해 주세요.");
    setData((p) => ({
      ...p,
      items: [...p.items, { id: id(), med: chosen, time, active: true, note }],
    }));
    setModal("");
    setMessage("복용 일정에 추가했어요.");
    if (nativeNeeds === "permission") allowNotifications();
  };
  const addCustom = () => {
    if (!customName.trim()) return setMessage("제품명을 입력해 주세요.");
    const med = "custom" + id();
    setData((p) => ({
      ...p,
      custom: [
        ...p.custom,
        {
          id: med,
          name: customName.trim(),
          ingredient: customIng.trim() || "성분 미확인",
          type: "직접 입력",
          emoji: "💊",
          guide: [
            "제품 설명서와 처방 지시를 확인하세요.",
            "놓친 복용은 의료진이나 약사에게 문의하세요.",
            "검증 자료가 없어 상호작용을 판단할 수 없습니다.",
          ],
        },
      ],
    }));
    setChosen(med);
    setCustomName("");
    setCustomIng("");
    setMessage("직접 입력한 약의 상호작용은 확인되지 않았어요.");
  };
  const guide = (item) => {
    setChosen(item.med);
    record(item.id, "skipped");
    setModal("guide");
  };
  const snooze = (item) => {
    const until = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    setData((previous) => ({
      ...previous,
      snoozes: { ...previous.snoozes, [reminderKey(today(), item.id)]: until },
    }));
    setMessage(isNativeApp() ? "10분 뒤 휴대폰 알림으로 다시 확인할게요." : "10분 뒤 다시 확인할게요. 페이지를 열어 두세요.");
  };
  const tabs = [
    "홈",
    "내 약",
    "의약품 정보",
    "함께 먹기",
    "복용 기록",
    "약 봉투 읽기",
    "설정",
  ];
  const itemRow = (item, manage = false) => {
    const med = find(item.med),
      s = status(item.id);
    return (
      <div className="item" key={item.id}>
        <div className="time">{item.time}</div>
        <MedIcon med={med} />
        <div className="item-name">
          <b>{med.name}</b>
          <small>
            {med.ingredient} · {med.type}
            {item.note ? " · " + item.note : ""}
          </small>
        </div>
        <div className="actions">
          {manage ? (
            <>
              <label className="schedule-time-edit">
                알림 시각
                <input type="time" aria-label={med.name + " 알림 시각"} value={item.time}
                  onChange={(event) => {
                    const next = event.target.value;
                    if (!clock.test(next)) return;
                    setData((previous) => ({ ...previous,
                      items: previous.items.map((entry) => entry.id === item.id ? { ...entry, time: next } : entry),
                    }));
                    setMessage("알림 시각을 바꿨어요. 실제 복용 시각은 처방 지시를 확인하세요.");
                  }} />
              </label>
              <button
                className="sub-btn"
                onClick={() =>
                  setData((p) => ({
                    ...p,
                    items: p.items.map((x) =>
                      x.id === item.id ? { ...x, active: !x.active } : x,
                    ),
                  }))
                }
              >
                {item.active ? "알림 켬" : "알림 끔"}
              </button>
              <button
                className="text-danger"
                onClick={() => {
                  if (confirm("이 일정을 삭제할까요?"))
                    setData((p) => ({
                      ...p,
                      items: p.items.filter((x) => x.id !== item.id),
                      logs: p.logs.filter((x) => x.item !== item.id),
                    }));
                }}
              >
                삭제
              </button>
            </>
          ) : (
            <>
              <button
                className={"sub-btn " + (s === "taken" ? "done" : "")}
                onClick={() => record(item.id, "taken")}
              >
                {s === "taken" ? <><Check size={16} strokeWidth={2.4} aria-hidden="true" />복용 완료</> : "먹었어요"}
              </button>
              <button
                className="light-btn"
                onClick={() => snooze(item)}
                disabled={!dueIds.has(item.id)}
              >
                10분 뒤
              </button>
              <button className="light-btn" onClick={() => guide(item)}>
                {s === "skipped" ? "미복용 기록됨" : "복용하지 않음"}
              </button>
            </>
          )}
        </div>
      </div>
    );
  };
  return (
    <div className="app">
      <aside>
        <div className="logo">
          <span aria-hidden="true">약</span>
          <div>
            <b>
              MediSync <em>AI</em>
            </b>
            <small>복약 관리</small>
          </div>
        </div>
        <nav>
          {tabs.map((x) => (
            <button
              key={x}
              className={tab === x ? "current" : ""}
              aria-current={tab === x ? "page" : undefined}
              title={x}
              onClick={() => setTab(x)}
            >
              {React.createElement(navIcons[x], { size: 20, strokeWidth: 1.9, "aria-hidden": true })}
              <span className="nav-label">{x}</span>
              <span className="nav-short" aria-hidden="true">{navShort[x] || x}</span>
            </button>
          ))}
        </nav>
        <div className="aside-note">
          검증된 정보만 참고하고
          <br />
          복약 결정은 전문가와 상담하세요.
        </div>
      </aside>
      <main>
        <header>
          <div>
            MediSync AI <span>/ {tab}</span>
          </div>
          <div className="avatar">{data.name?.slice(0, 1) || "나"}</div>
        </header>
        <div className="content">
          {tab === "홈" && (
            <>
              {nativeNeeds && <section className="panel notice-board" aria-label="알림 설정">
                <h2>{nativeNeeds === "permission" ? "휴대폰 알림이 꺼져 있어요" : "알림이 늦게 올 수 있어요"}</h2>
                <p className="muted">{nativeNeeds === "permission"
                  ? "허용하지 않으면 복용 시간이 돼도 알림이 오지 않아요."
                  : "휴대폰의 '알람 및 리마인더' 권한을 켜야 정한 시각에 맞춰 알림이 와요."}</p>
                <button className="primary" onClick={nativeNeeds === "permission" ? allowNotifications : allowExactAlarms}>
                  {nativeNeeds === "permission" ? "알림 허용하기" : "알람 및 리마인더 켜기"}
                </button>
              </section>}
              {due.length > 0 && <section className="panel due-board" aria-label="복용 시간 알림">
                <div className="heading"><div>
                  <h2>복용 예정 시간 확인</h2>
                  <p>알림을 확인해도 복용 완료로 기록되지는 않아요.</p>
                </div></div>
                {due.map((item) => {
                  const med = find(item.med);
                  const lines = Array.isArray(med.guide) && med.guide.length >= 3
                    ? med.guide.slice(0, 3)
                    : ["이 제품의 복용 누락 대처는 현재 자료에서 확인되지 않았어요.",
                      "약 봉투·처방 지시와 제품 사용법을 확인하세요.",
                      "판단이 어렵다면 약사 또는 의료진에게 문의하세요."];
                  return <div className="due-item" key={item.id}>
                    <div><strong>{item.time} · {med.name}</strong><ol>{lines.map((line) => <li key={line}>{line}</li>)}</ol></div>
                    <div className="due-actions">
                      <button className="sub-btn" onClick={() => record(item.id, "taken")}>먹었어요</button>
                      <button className="light-btn" onClick={() => snooze(item)}>10분 뒤</button>
                      <button className="light-btn" onClick={() => guide(item)}>복용하지 않음</button>
                    </div>
                  </div>;
                })}
              </section>}
              <div className="hero">
                <div>
                  <small>{now.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" })}</small>
                  {upcoming ? <>
                    <p className="hero-label">다음 복용</p>
                    <h1 className="hero-next"><time>{upcoming.time}</time><span>{find(upcoming.med).name}</span></h1>
                  </> : <h1>{active.length ? "오늘 남은 복용 일정이 없어요" : "아직 등록한 복용 일정이 없어요"}</h1>}
                  <p>익숙한 제품명으로 찾고, 성분과 주의사항까지 확인하세요.</p>
                </div>
                <button className="primary" onClick={() => openAdd()}>
                  <Plus size={18} strokeWidth={2.2} aria-hidden="true" />약 추가하기
                </button>
              </div>
              <div className="stats">
                <div>
                  <span>오늘 복용 일정</span>
                  <strong>
                    {active.length}
                    <small>건</small>
                  </strong>
                  <p>활성화된 일정</p>
                </div>
                <div>
                  <span>복용 완료</span>
                  <strong>
                    {active.filter((x) => status(x.id) === "taken").length}
                    <small>건</small>
                  </strong>
                  <p>직접 완료로 기록</p>
                </div>
                <div>
                  <span>공식 주성분 중복</span>
                  <strong>
                    {duplicate.length}
                    <small>건</small>
                  </strong>
                  <p>등록한 항목 기준</p>
                </div>
              </div>
              <div className="columns">
                <section className="panel">
                  <div className="heading">
                    <div>
                      <h2>오늘 먹을 약</h2>
                      <p>알림 확인과 실제 복용은 따로 기록해요.</p>
                    </div>
                    <button
                      className="link-btn"
                      onClick={() => setTab("내 약")}
                    >
                      전체 보기
                    </button>
                  </div>
                  {active.length ? (
                    active.map((x) => itemRow(x))
                  ) : (
                    <div className="empty">
                      약을 추가해 복용 일정을 만들어 보세요.
                    </div>
                  )}
                </section>
                <section className="panel">
                  <div className="heading">
                    <div>
                      <h2>함께 먹기 주의</h2>
                      <p>공식 제품에 등록된 성분을 비교했어요.</p>
                    </div>
                  </div>
                  {duplicate.length ? duplicate.map(({ ingredient, products }) => (
                    <div className="warning" key={ingredient}><b>{ingredient}</b><p>{[...products.values()].join(" · ")}</p></div>
                  )) : <div className="info">같은 이름으로 등록된 공식 주성분을 찾지 못했어요. 제품별 주의사항은 함께 먹기에서 확인하세요.</div>}
                  <button
                    className="outline full"
                    onClick={() => setTab("함께 먹기")}
                  >
                    다른 조합 확인하기
                  </button>
                </section>
              </div>
              <section className="panel">
                <div className="heading">
                  <h2>복용 패턴 한눈에</h2>
                </div>
                <p className="muted">
                  {data.logs.filter(
                    (l) =>
                      l.value === "skipped" &&
                      l.date >=
                        new Date(Date.now() - 6 * 86400000).toLocaleDateString(
                          "sv-SE",
                        ),
                  ).length > 0
                    ? "최근 7일간 미복용 기록이 있어요. 자주 놓치는 시간대를 확인하고 알림 시간을 조정해 보세요. 실제 복용 시간 변경은 처방 지시를 먼저 확인하세요."
                    : "최근 7일간 미복용 기록이 없어요. 기록이 쌓이면 놓치기 쉬운 시간대를 살펴볼 수 있어요."}
                </p>
              </section>
              <section className="panel">
                <div className="heading">
                  <h2>최근 7일 기록</h2>
                </div>
                <div className="week">
                  {Array.from({ length: 7 }, (_, i) => {
                    const d = new Date();
                    d.setDate(d.getDate() - 6 + i);
                    const day = d.toLocaleDateString("sv-SE"),
                      n = data.logs.filter(
                        (l) => l.date === day && l.value === "taken",
                      ).length;
                    return (
                      <div key={day}>
                        <div className="bar">
                          <span
                            style={{
                              height: Math.max(12, Math.min(100, n * 32)) + "%",
                            }}
                          />
                        </div>
                        <b>{n}</b>
                        <small>
                          {
                            ["일", "월", "화", "수", "목", "금", "토"][
                              d.getDay()
                            ]
                          }
                        </small>
                      </div>
                    );
                  })}
                </div>
              </section>
            </>
          )}
          {tab === "내 약" && (
            <>
              <div className="page-title">
                <div>
                  <h1>내 약과 복용 일정</h1>
                  <p>대표 제품명을 먼저, 성분은 아래에 보여줘요.</p>
                </div>
                <button className="primary" onClick={() => openAdd()}>
                  <Plus size={18} strokeWidth={2.2} aria-hidden="true" />약 추가
                </button>
              </div>
              <section className="panel">
                <div className="heading">
                  <h2>등록된 일정 {data.items.length}건</h2>
                </div>
                {data.items.length ? (
                  data.items
                    .slice()
                    .sort((a, b) => a.time.localeCompare(b.time))
                    .map((x) => itemRow(x, true))
                ) : (
                  <div className="empty">등록한 일정이 없습니다.</div>
                )}
              </section>
              <div className="tip">
                ⓘ 같은 이름의 약도 함량·제형·복합성분이 다를 수 있어요. 실제
                제품과 약 봉투를 확인하세요.
              </div>
            </>
          )}
          {tab === "의약품 정보" && <CatalogPage index={index} selected={detail} onSelect={setDetail}
            onAdd={(product) => openAdd(officialId(product))} state={source.state} retry={retry} />}
          {tab === "함께 먹기" && <ComparePage index={index} activeProducts={activeProducts} unlinked={unlinked}
            state={source.state} retry={retry} />}
          {tab === "복용 기록" && (
            <>
              <div className="page-title">
                <div>
                  <h1>복용 기록</h1>
                  <p>완료, 미복용, 미기록 상태를 수정할 수 있어요.</p>
                </div>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="stats">
                <div>
                  <span>복용 완료</span>
                  <strong>
                    {
                      data.logs.filter(
                        (x) => x.date === date && x.value === "taken",
                      ).length
                    }
                    <small>건</small>
                  </strong>
                </div>
                <div>
                  <span>미복용</span>
                  <strong>
                    {
                      data.logs.filter(
                        (x) => x.date === date && x.value === "skipped",
                      ).length
                    }
                    <small>건</small>
                  </strong>
                </div>
                <div>
                  <span>전체 기록</span>
                  <strong>
                    {data.logs.length}
                    <small>건</small>
                  </strong>
                </div>
              </div>
              <section className="panel">
                <div className="heading">
                  <h2>{date} 복용 상태</h2>
                </div>
                {data.items.map((x) => {
                  const m = find(x.med),
                    s = status(x.id, date);
                  return (
                    <div className="history-row" key={x.id}>
                      <MedIcon med={m} />
                      <div>
                        <b>{m.name}</b>
                        <small>
                          {x.time} · {m.ingredient}
                        </small>
                      </div>
                      <span className={"badge " + (s || "")}>
                        {s === "taken"
                          ? "복용 완료"
                          : s === "skipped"
                            ? "미복용"
                            : "미기록"}
                      </span>
                      <select
                        aria-label={m.name + " 복용 상태"}
                        value={s || ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v) record(x.id, v, date);
                          else
                            setData((p) => ({
                              ...p,
                              logs: p.logs.filter(
                                (l) => !(l.item === x.id && l.date === date),
                              ),
                            }));
                        }}
                      >
                        <option value="">미기록</option>
                        <option value="taken">복용 완료</option>
                        <option value="skipped">미복용</option>
                      </select>
                    </div>
                  );
                })}
              </section>
              <div className="tip">
                ⓘ 기록은 현재 브라우저에만 저장돼요. 설정에서 백업할 수
                있습니다.
              </div>
            </>
          )}
          {tab === "약 봉투 읽기" && <OcrPanel index={index} state={source.state} retry={retry}
            onChoose={openOcrReview} onRegister={openOcrRecord} onManual={() => openAdd()} />}
          {tab === "설정" && (
            <>
              <div className="page-title">
                <div>
                  <h1>설정 및 데이터</h1>
                  <p>개인 정보는 {isNativeApp() ? "이 휴대폰" : "이 브라우저"}에만 저장돼요.</p>
                </div>
              </div>
              <section className="panel settings">
                <h2>표시 이름</h2>
                <input
                  value={data.name}
                  onChange={(e) =>
                    setData((p) => ({ ...p, name: e.target.value }))
                  }
                />
                {isNativeApp() ? <>
                  <h2>휴대폰 복약 알림</h2>
                  <p className="muted">알림 권한: {nativeStatus?.permission === "granted" ? "허용됨" : "허용 필요"} · 정확한 시각: {nativeStatus?.exact === "granted" ? "허용됨" : "설정 필요"} · 예약된 알림: {nativeStatus?.count ?? 0}건</p>
                  {nativeStatus?.error && <p className="muted">{nativeStatus.error}</p>}
                  <button className="outline" onClick={async () => {
                    try {
                      const allowed = await requestNativeNotificationPermission();
                      setMessage(allowed ? "휴대폰 알림을 허용했어요." : "알림 권한이 필요해요. 휴대폰 설정에서 허용할 수 있어요.");
                      setNativeRefresh((value) => value + 1);
                    } catch { setMessage("알림 권한을 확인하지 못했어요."); }
                  }}>휴대폰 알림 권한 요청</button>
                  <button className="outline" onClick={async () => {
                    try {
                      const status = await getNativeNotificationStatus();
                      setNativeStatus((previous) => ({ ...previous, ...status }));
                      if (status.permission !== "granted") return setMessage("먼저 휴대폰 알림을 허용해 주세요.");
                      await scheduleTestNotification();
                      setMessage(status.exact === "granted" ? "15초 뒤 시험 알림을 확인해 주세요." : "시험 알림을 예약했어요. 정확한 알람 설정이 꺼져 있으면 늦게 도착할 수 있어요.");
                    } catch { setMessage("시험 알림을 예약하지 못했어요."); }
                  }}>15초 시험 알림</button>
                  {nativeStatus?.exact !== "granted" && <button className="outline" onClick={async () => {
                    try { await openExactAlarmSettings(); } catch { setMessage("휴대폰 설정에서 이 앱의 '알람 및 리마인더' 권한을 확인해 주세요."); }
                  }}>정확한 알람 설정 열기</button>}
                  <p className="muted">앱이 닫혀도 향후 {notificationDaysAhead}일치 알림을 휴대폰에 예약합니다. 앱을 열면 다음 {notificationDaysAhead}일치를 다시 채웁니다. 권한 또는 배터리 설정에 따라 지연될 수 있으니 실제 기기에서 시험해 주세요. 알림을 눌러도 복용 완료로 기록되지는 않습니다.</p>
                </> : <>
                <h2>브라우저 알림</h2>
                <button
                  className="outline"
                  onClick={async () => {
                    if (!window.isSecureContext)
                      return setMessage("현재 HTTP 주소에서는 시스템 알림을 사용할 수 없어요. 홈 화면 알림은 사용할 수 있습니다.");
                    if (!("Notification" in window))
                      return setMessage(
                        "이 브라우저는 알림을 지원하지 않아요.",
                      );
                    const r = await Notification.requestPermission();
                    setMessage(
                      r === "granted"
                        ? "알림이 허용됐어요."
                        : "알림이 허용되지 않았어요.",
                    );
                  }}
                >
                  알림 권한 요청
                </button>
                <p className="muted">
                  페이지를 열어 둔 동안 예정 시간이 지난 미기록 약은 홈 화면에 계속 표시됩니다. 10분 뒤 다시 알림도 새로고침 후 유지됩니다. 브라우저 밖 알림은 HTTPS 또는 localhost에서 권한을 허용한 경우에만 사용할 수 있습니다.
                </p>
                </>}
                <h2>기록 백업</h2>
                <button
                  className="outline"
                  onClick={() => {
                    const blob = new Blob([JSON.stringify(data, null, 2)], {
                        type: "application/json",
                      }),
                      url = URL.createObjectURL(blob),
                      link = document.createElement("a");
                    link.href = url;
                    link.download = "MediSync-기록-" + today() + ".json";
                    link.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <Download size={17} aria-hidden="true" />기록 백업 파일 받기
                </button>
                <label className="outline import">
                  <Upload size={17} aria-hidden="true" />백업 파일 가져오기
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      f.text().then((t) => {
                        try {
                          const v = JSON.parse(t);
                          if (
                            !Array.isArray(v.items) ||
                            !Array.isArray(v.logs) ||
                            !Array.isArray(v.custom)
                          )
                            throw Error();
                          setData(v);
                          setMessage("기록을 가져왔어요.");
                        } catch {
                          setMessage("올바른 기록 파일이 아닙니다.");
                        }
                      });
                    }}
                  />
                </label>
                <h2>이 브라우저의 데이터</h2>
                <button
                  className="text-danger"
                  onClick={() => {
                    if (confirm("이 브라우저의 모든 복약 일정과 기록을 지울까요?"))
                      setData(emptyProfile);
                  }}
                >
                  저장 데이터 삭제
                </button>
              </section>
              <div className="tip">
                ⓘ 제품정보는 식약처 원문을 참고하세요. 복용 방법은 실제 처방과 제품 안내를 확인하세요.
              </div>
            </>
          )}
        </div>
      </main>
      {modal === "ocr-review" && (
        <div
          className="backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) setModal("");
          }}
        >
          <div className="modal">
            <div className="modal-title">
              <div>
                <h2>{chosen === "ocr-pending" ? ocrInfo?.name : find(chosen).name} 복용 시간 확인</h2>
              </div>
              <button onClick={() => setModal("")}>×</button>
            </div>
            <p className="muted">
              이 줄에서 읽힌 시간대도 실제로 선택한 약의 지시인지 원본을 확인하세요. 확인한 시간대를 선택하고 실제 복용할 시각을 직접 입력하세요.
            </p>
            {ocrInfo?.instruction && <div className="info ocr-instruction-note">
              <b>봉투에 적힌 복용 지시</b> {ocrInfo.instruction}
              {ocrInfo.frequency && <span> · 하루 {ocrInfo.frequency}번이면 시간을 {ocrInfo.frequency}개 정해 주세요. 앱이 시간을 대신 정하지 않아요.</span>}
            </div>}
            {chosen === "ocr-pending" && <p className="muted">e약은요에 연결하지 않은 약이라 성분과 함께 먹기 주의는 확인할 수 없어요.</p>}
            {suggestions.length > 0 ? (
              <div className="ocr-slots">
                {suggestions.map((slot) => (
                  <label className="ocr-slot" key={slot.key}>
                    <input
                      type="checkbox"
                      checked={slot.selected}
                      onChange={(event) =>
                        setSuggestions((previous) =>
                          previous.map((item) =>
                            item.key === slot.key
                              ? { ...item, selected: event.target.checked }
                              : item,
                          ),
                        )
                      }
                    />
                    <strong>{slot.label}</strong>
                    <input
                      type="time"
                      aria-label={slot.label + " 복용 예정 시간"}
                      value={slot.time}
                      onChange={(event) =>
                        setSuggestions((previous) =>
                          previous.map((item) =>
                            item.key === slot.key
                              ? { ...item, time: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </label>
                ))}
              </div>
            ) : (
              <div className="info">
                아침·점심·저녁·취침 전 표시를 찾지 못했어요. 시간을 직접 입력해
                주세요.
              </div>
            )}
            {ocrInfo && <button type="button" className="outline full" onClick={addOcrTime}>복용 시간 추가</button>}
            <div className="tip">
              ⓘ “1일 2회”만으로는 아침·저녁인지 알 수 없어 자동으로 정하지
              않습니다. 식전·식후 지시와 제품별 주의사항도 약 봉투에서 직접
              확인하세요.
            </div>
            <div className="modal-actions">
              {chosen !== "ocr-pending" && !ocrInfo && <button className="outline" onClick={() => openAdd(chosen)}>
                시간 직접 입력
              </button>}
              {ocrInfo && <button className="outline" onClick={() => setModal("")}>취소</button>}
              {suggestions.length > 0 && (
                <button className="primary" onClick={addOcrSchedule}>
                  확인 후 일정 등록
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {modal === "add" && (
        <div
          className="backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModal("");
          }}
        >
          <div className="modal">
            <div className="modal-title">
              <div>
                <h2>복용 일정 추가</h2>
              </div>
              <button onClick={() => setModal("")}>×</button>
            </div>
            <CatalogStatus state={source.state} retry={retry} />
            {source.state === "ready" && <ProductPicker index={index} selectedCode={allOfficial.get(chosen)?.code}
              onPick={(product) => setChosen(officialId(product))} />}
            {chosen && <p><b>선택 · {find(chosen).name}</b></p>}
            {data.custom.length > 0 && <details><summary>직접 입력해 둔 제품</summary>
              <div className="catalog-list">{data.custom.map((product) => <button key={product.id} type="button" className="rule"
                onClick={() => setChosen(product.id)}><MedIcon med={product} /><div><b>{product.name}</b><small>사용자가 입력한 정보</small></div><span aria-hidden="true"><ChevronRight size={18} /></span></button>)}</div>
            </details>}
            <details>
              <summary>목록에 없는 제품 직접 입력</summary>
              <input
                placeholder="제품명"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
              />
              <input
                placeholder="성분명 (알고 있을 때만)"
                value={customIng}
                onChange={(e) => setCustomIng(e.target.value)}
              />
              <button className="outline" onClick={addCustom}>
                직접 입력 항목 만들기
              </button>
            </details>
            <div className="form">
              <label>
                복용 예정 시간
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </label>
              <label>
                메모
                <input
                  placeholder="예: 식후, 처방대로"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button className="outline" onClick={() => setModal("")}>
                취소
              </button>
              <button className="primary" onClick={add}>
                일정 추가
              </button>
            </div>
          </div>
        </div>
      )}
      {modal === "guide" && (
        <div
          className="backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModal("");
          }}
        >
          <div className="modal guide">
            <div className="modal-title">
              <div>
                <h2>{find(chosen).name} · 놓쳤을 때</h2>
              </div>
              <button onClick={() => setModal("")}>×</button>
            </div>
            <p className="muted">
              미복용으로 기록했어요. 아래는 일반 정보이며 제품별 처방 지시가
              우선입니다.
            </p>
            <ol>
              <li>복용하지 않은 것으로 기록했어요.</li>
              <li>약 봉투와 제품의 사용법을 확인할 수 있어요.</li>
              <li>다음 복용이 궁금하면 약사나 의료진에게 확인하세요.</li>
            </ol>
            {allOfficial.get(chosen) && <button className="outline full" onClick={() => {
              setDetail(allOfficial.get(chosen)); setTab("의약품 정보"); setModal("");
            }}>공식 제품 정보 보기</button>}
            <button className="primary full" onClick={() => setModal("")}>
              확인했어요
            </button>
          </div>
        </div>
      )}
      {message && <div className="toast">{message}</div>}
    </div>
  );
}
export default App;
