import React, { useEffect, useState } from "react";
import { meds, rules, food, initial } from "./data.js";
import { otcProducts, sharedIngredientPairs } from "./catalog.js";
import {
  getProductNotice,
  getReviewedRule,
  getReviewedRulesForItems,
  getSharedIngredients,
} from "./safety.js";
import { detectMealSlots } from "./schedule.js";
import { dueItems, isValidTime, localDateKey, reminderKey } from "./reminders.js";
const key = "medisync-react-v1",
  today = () => localDateKey(),
  id = () => Math.random().toString(36).slice(2);
const restoreData = (value) =>
  value && Array.isArray(value.items) && Array.isArray(value.logs)
    ? {
        ...initial,
        ...value,
        custom: Array.isArray(value.custom) ? value.custom : [],
        snoozes:
          value.snoozes && typeof value.snoozes === "object" && !Array.isArray(value.snoozes)
            ? value.snoozes
            : {},
      }
    : initial;
function App() {
  const [data, setData] = useState(() => {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return restoreData(v);
    } catch {
      return initial;
    }
  });
  const [tab, setTab] = useState("홈"),
    [modal, setModal] = useState(""),
    [search, setSearch] = useState(""),
    [chosen, setChosen] = useState(""),
    [time, setTime] = useState("08:00"),
    [note, setNote] = useState(""),
    [customName, setCustomName] = useState(""),
    [customIng, setCustomIng] = useState(""),
    [a, setA] = useState("thyroid"),
    [b, setB] = useState("calcium"),
    [date, setDate] = useState(today()),
    [ocr, setOcr] = useState(""),
    [suggestions, setSuggestions] = useState([]),
    [message, setMessage] = useState(""),
    [now, setNow] = useState(() => new Date());
  useEffect(() => localStorage.setItem(key, JSON.stringify(data)), [data]);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (message) {
      const t = setTimeout(() => setMessage(""), 3500);
      return () => clearTimeout(t);
    }
  }, [message]);
  const catalog = [...meds, ...otcProducts, ...data.custom],
    find = (x) =>
      catalog.find((m) => m.id === x) || {
        name: "삭제된 항목",
        ingredient: "확인 필요",
        emoji: "💊",
      };
  const status = (item, d = today()) =>
    data.logs.find((l) => l.item === item && l.date === d)?.value;
  const active = data.items
    .filter((x) => x.active)
    .sort((x, y) => x.time.localeCompare(y.time));
  const due = dueItems(data, now);
  const dueIds = new Set(due.map((item) => item.id));
  useEffect(() => {
    if (!window.isSecureContext || !("Notification" in window) || Notification.permission !== "granted")
      return;
    for (const item of due) {
      const noticeKey = `medisync-alert-${reminderKey(today(), item.id)}-${data.snoozes?.[reminderKey(today(), item.id)] || "first"}`;
      if (sessionStorage.getItem(noticeKey)) continue;
      sessionStorage.setItem(noticeKey, "1");
      const med = catalog.find((entry) => entry.id === item.med);
      try {
        new Notification(`복용 예정: ${med?.name || "약"}`, {
          body: `${item.time} 예정 · 복용 여부는 앱에서 직접 기록해 주세요.`,
        });
      } catch {
        // The in-page reminder below still works when the system rejects it.
      }
    }
  }, [data, now]);
  const sharedPairs = sharedIngredientPairs(data.items, catalog);
  const selectedMed = catalog.find((med) => med.id === chosen);
  const cautions = getReviewedRulesForItems(data.items, catalog, rules);
  const record = (item, value, d = today()) => {
    setData((p) => {
      const snoozes = { ...p.snoozes };
      delete snoozes[reminderKey(d, item)];
      return {
        ...p,
        snoozes,
        logs: [
          ...p.logs.filter((x) => !(x.item === item && x.date === d)),
          { item, date: d, value, at: new Date().toISOString() },
        ],
      };
    });
    setMessage(
      value === "taken" ? "복용 완료로 기록했어요." : "미복용으로 기록했어요.",
    );
  };
  const snooze = (item) => {
    setData((previous) => ({
      ...previous,
      snoozes: {
        ...previous.snoozes,
        [reminderKey(today(), item.id)]: new Date(Date.now() + 10 * 60000).toISOString(),
      },
    }));
    setNow(new Date());
    setMessage("10분 뒤 화면에서 다시 알려드릴게요. 페이지를 열어 두세요.");
  };
  const openAdd = (med = "") => {
    setChosen(med);
    setSearch("");
    setTime("08:00");
    setNote("");
    setModal("add");
  };
  const openOcrReview = (medId) => {
    setChosen(medId);
    setSuggestions(detectMealSlots(ocr));
    setModal("ocr-review");
  };

  const addOcrSchedule = () => {
    const confirmed = suggestions.filter((slot) => slot.selected);
    if (confirmed.length === 0) {
      setMessage("등록할 시간대를 하나 이상 선택해 주세요.");
      return;
    }
    if (
      confirmed.some((slot) => !isValidTime(slot.time))
    ) {
      setMessage("복용 예정 시간을 확인해 주세요.");
      return;
    }
    setData((previous) => ({
      ...previous,
      items: [
        ...previous.items,
        ...confirmed.map((slot) => ({
          id: id(),
          med: chosen,
          time: slot.time,
          active: true,
          note: "약 봉투 확인: " + slot.label,
        })),
      ],
    }));
    setModal("");
    setMessage(confirmed.length + "개의 복용 일정을 등록했어요.");
  };

  const add = () => {
    if (!chosen) return setMessage("약을 먼저 선택해 주세요.");
    if (!isValidTime(time)) return setMessage("복용 예정 시간을 확인해 주세요.");
    setData((p) => ({
      ...p,
      items: [...p.items, { id: id(), med: chosen, time, active: true, note }],
    }));
    setModal("");
    setMessage("복용 일정에 추가했어요.");
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
  const comparisonCatalog = [...catalog, food];
  const firstCompared = comparisonCatalog.find((med) => med.id === a);
  const secondCompared = comparisonCatalog.find((med) => med.id === b);
  const comparison = getReviewedRule(firstCompared, secondCompared, rules);
  const sharedInComparison = getSharedIngredients(firstCompared, secondCompared);
  const comparedNotices = [firstCompared, secondCompared]
    .map(getProductNotice)
    .filter(Boolean);
  const tabs = [
    "홈",
    "내 약",
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
        {manage ? (
          <input
            className="time-edit"
            type="time"
            aria-label={`${med.name} 복용 예정 시간`}
            value={item.time}
            onChange={(event) => {
              if (!isValidTime(event.target.value)) return;
              setData((previous) => ({
                ...previous,
                items: previous.items.map((entry) =>
                  entry.id === item.id ? { ...entry, time: event.target.value } : entry,
                ),
              }));
              setMessage("알림 시간을 바꿨어요. 실제 복용 시간은 처방 지시를 확인하세요.");
            }}
          />
        ) : (
          <div className="time">{item.time}</div>
        )}
        <div className="med-emoji">{med.emoji}</div>
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
                {s === "taken" ? "✓ 복용 완료" : "✓ 먹었어요"}
              </button>
              <button
                className="light-btn"
                onClick={() =>
                  dueIds.has(item.id)
                    ? snooze(item)
                    : setMessage("예정 시간이 되면 화면에서 알려드릴게요.")
                }
              >
                10분 뒤
              </button>
              <button className="light-btn" onClick={() => guide(item)}>
                {s === "skipped" ? "미복용 기록됨" : "건너뛰기"}
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
          <span>✚</span>
          <div>
            <b>
              MediSync <em>AI</em>
            </b>
            <small>복약 생활 데모</small>
          </div>
        </div>
        <nav>
          {tabs.map((x, i) => (
            <button
              key={x}
              className={tab === x ? "current" : ""}
              onClick={() => setTab(x)}
            >
              <span>{["⌂", "♡", "⚠", "▦", "▤", "⚙"][i]}</span>
              {x}
            </button>
          ))}
        </nav>
        <div className="aside-note">
          출처를 확인한 정보도 참고용이에요.
          <br />
          복약 결정은 전문가와 상담하세요.
        </div>
      </aside>
      <main>
        <header>
          <div>
            MediSync AI <span>/ {tab}</span>
          </div>
          <div className="header-actions">
            <a className="presentation-link" href="./presentation/index.html" target="_blank" rel="noreferrer">
              발표자료 보기
            </a>
            <div className="avatar">{data.name?.slice(0, 1) || "나"}</div>
          </div>
        </header>
        <div className="content">
          {due.length > 0 && (
            <section className="reminder-board" aria-label="복용 시간 알림">
              {due.map((item) => {
                const med = find(item.med);
                return (
                  <div className="reminder-card" role="alert" key={item.id}>
                    <div className="reminder-copy">
                      <small>복용 예정 시간 {item.time}</small>
                      <h2>{med.name} 복용 여부를 확인해 주세요</h2>
                      <ol>
                        {(med.guide || []).slice(0, 3).map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ol>
                      <p>
                        일반 안내이며 처방·제품 지시가 우선입니다. 알림을 본 것만으로
                        복용 완료가 기록되지는 않아요.
                        {med.source && (
                          <> <a href={med.source} target="_blank" rel="noreferrer">원문 확인 ↗</a></>
                        )}
                      </p>
                    </div>
                    <div className="reminder-actions">
                      <button className="primary" onClick={() => record(item.id, "taken")}>
                        먹었어요
                      </button>
                      <button className="outline" onClick={() => snooze(item)}>
                        10분 뒤 다시 알림
                      </button>
                      <button className="outline" onClick={() => guide(item)}>
                        복용하지 않음
                      </button>
                    </div>
                  </div>
                );
              })}
            </section>
          )}
          {tab === "홈" && (
            <>
              <div className="hero">
                <div>
                  <small>오늘의 복약 관리</small>
                  <h1>
                    {data.name || "나"}님, 오늘도 건강하게
                    <br />
                    <span>복용 일정을 챙겨봐요.</span>
                  </h1>
                  <p>익숙한 제품명으로 찾고, 성분과 주의사항까지 확인하세요.</p>
                  <button className="primary" onClick={() => openAdd()}>
                    ＋ 약 추가하기
                  </button>
                </div>
                <div className="hero-graphic">
                  💊<i>✦</i>
                </div>
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
                  <span>함께 먹기 주의</span>
                  <strong>
                    {cautions.length}
                    <small>건</small>
                  </strong>
                  <p>출처를 확인한 규칙만</p>
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
                      전체 보기 →
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
                      <p>선택한 제품에 적용되는 출처 확인 사례예요.</p>
                    </div>
                  </div>
                  {cautions.length ? (
                    cautions.map((r) => (
                      <div className="warning" key={r.title}>
                        <b>⚠ {r.title}</b>
                        <p>{r.detail}</p>
                        <small className="evidence-meta">
                          적용 대상: {r.condition} · 출처 확인일: {r.reviewedOn}
                        </small>
                        <a href={r.source} target="_blank" rel="noreferrer">
                          {r.sourceName} ↗
                        </a>
                      </div>
                    ))
                  ) : (
                    <div className="info">
                      현재 등록 목록에 출처를 확인한 주의 규칙이 없습니다.
                      규칙이 없다는 것은 함께 복용해도 안전하다는 뜻이 아니에요.
                    </div>
                  )}
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
                  <small>MY MEDICINES</small>
                  <h1>내 약과 복용 일정</h1>
                  <p>대표 제품명을 먼저, 성분은 아래에 보여줘요.</p>
                </div>
                <button className="primary" onClick={() => openAdd()}>
                  ＋ 약 추가
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
              <section className="panel">
                <div className="heading">
                  <h2>같은 성분이 들어간 제품</h2>
                </div>
                {sharedPairs.length ? (
                  sharedPairs.map((pair) => (
                    <div
                      className="warning"
                      key={`${pair.first.itemId}-${pair.second.itemId}`}
                    >
                      <b>
                        {pair.first.name} + {pair.second.name}
                      </b>
                      <p>공통 성분: {pair.ingredients.join(", ")}</p>
                    </div>
                  ))
                ) : (
                  <p className="muted">
                    등록된 데이터 제품 사이에서 같은 성분명을 찾지 못했어요.
                  </p>
                )}
                <div className="tip">
                  ⓘ 성분명 일치만 보여줍니다. 중복 복용 여부나 함께 복용해도
                  되는지는 이 결과만으로 판단할 수 없어요.
                </div>
              </section>
              <div className="tip">
                ⓘ 같은 이름의 약도 함량·제형·복합성분이 다를 수 있어요. 실제
                제품과 약 봉투를 확인하세요.
              </div>
            </>
          )}
          {tab === "함께 먹기" && (
            <>
              <div className="page-title">
                <div>
                  <small>INTERACTION CHECK</small>
                  <h1>함께 먹어도 될까요?</h1>
                  <p>두 항목을 고르면 공통 성분, 제품별 원문, 출처 확인 규칙을 따로 보여줘요.</p>
                </div>
              </div>
              <section className="panel">
                <div className="compare">
                  <label>
                    첫 번째 항목
                    <select value={a} onChange={(e) => setA(e.target.value)}>
                      {comparisonCatalog.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name} ({x.ingredient})
                        </option>
                      ))}
                    </select>
                  </label>
                  <span>＋</span>
                  <label>
                    두 번째 항목
                    <select value={b} onChange={(e) => setB(e.target.value)}>
                      {comparisonCatalog.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name} ({x.ingredient})
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {a === b ? (
                  <div className="result">서로 다른 항목을 선택해 주세요.</div>
                ) : (
                  <div className="safety-results">
                    <div className="result">
                      <span>① 공통 성분</span>
                      <h3>
                        {sharedInComparison.length
                          ? sharedInComparison.join(", ")
                          : firstCompared?.itemId && secondCompared?.itemId
                            ? "기재된 공통 성분 없음"
                            : "성분 비교 대상이 아니에요"}
                      </h3>
                      <p>
                        {sharedInComparison.length
                          ? "두 데이터 제품에 같은 이름의 성분이 기재돼 있어요. 실제 중복 복용 위험은 함량·제형·복용량 확인이 필요해요."
                          : firstCompared?.itemId && secondCompared?.itemId
                            ? "기재된 성분명끼리 비교한 결과예요. 성분이 다르다고 함께 복용해도 안전하다는 뜻은 아니에요."
                            : "정확한 품목번호가 없는 예시·직접 입력 항목은 성분 중복을 자동 판단하지 않아요."}
                      </p>
                    </div>
                    <div className={comparison ? "result caution" : "result"}>
                      <span>② 두 항목의 주의 규칙</span>
                      {comparison ? (
                        <>
                          <h3>{comparison.title}</h3>
                          <p>{comparison.detail}</p>
                          <p className="evidence-meta">
                            적용 대상: {comparison.condition}<br />
                            출처 확인일: {comparison.reviewedOn}
                          </p>
                          <a href={comparison.source} target="_blank" rel="noreferrer">
                            {comparison.sourceName} ↗
                          </a>
                        </>
                      ) : (
                        <>
                          <h3>등록된 주의 규칙이 없어요.</h3>
                          <p>안전하다는 뜻은 아니에요. 실제 함께 복용하려면 약사나 의료진에게 확인하세요.</p>
                        </>
                      )}
                    </div>
                    <div className="result">
                      <span>③ 각 제품의 이상반응</span>
                      <h3>제품별 원문 정보</h3>
                      {comparedNotices.length ? (
                        comparedNotices.map((notice) => (
                          <details key={notice.itemId} className="safety-notice">
                            <summary>{notice.product} · 이상반응 원문 보기</summary>
                            <p className="notice-text">{notice.adverse || "기재된 원문이 없어요."}</p>
                            <strong>함께 사용할 때 주의할 약·음식 원문</strong>
                            <p className="notice-text">{notice.caution || "기재된 원문이 없어요."}</p>
                            <small>품목번호 {notice.itemId} · 원문 수정일 {notice.modifiedOn}</small>
                            <br />
                            <a href={notice.source} target="_blank" rel="noreferrer">e약은요 원문 찾기 ↗</a>
                          </details>
                        ))
                      ) : (
                        <p>이 조합의 제품별 이상반응 원문은 데모 데이터에 없어요.</p>
                      )}
                      <p className="evidence-meta">이상반응은 각 제품의 정보이며, 두 항목을 함께 썼을 때의 결과를 예측한 내용은 아니에요.</p>
                    </div>
                  </div>
                )}
              </section>
              <section className="panel">
                <div className="heading">
                  <h2>출처를 확인한 데모 사례 {rules.length}건</h2>
                </div>
                {rules.map((r) => (
                  <button
                    className="rule"
                    key={r.title}
                    onClick={() => {
                      setA(r.a);
                      setB(r.b);
                      window.scrollTo(0, 0);
                    }}
                  >
                    <span>⚠️</span>
                    <div>
                      <b>{r.title}</b>
                      <small>{r.detail}</small>
                      <small className="evidence-meta">{r.sourceName} · 확인일 {r.reviewedOn}</small>
                    </div>
                    <span>→</span>
                  </button>
                ))}
              </section>
            </>
          )}
          {tab === "복용 기록" && (
            <>
              <div className="page-title">
                <div>
                  <small>MEDICATION HISTORY</small>
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
                      <span className="med-emoji">{m.emoji}</span>
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
          {tab === "약 봉투 읽기" && (
            <>
              <div className="page-title">
                <div>
                  <small>PRESCRIPTION SCAN</small>
                  <h1>약 봉투 읽기</h1>
                  <p>사진에서 글자를 읽고 직접 확인한 뒤 등록하세요.</p>
                </div>
              </div>
              <div className="columns">
                <section className="panel">
                  <h2>사진에서 글자 읽기</h2>
                  <p className="muted">
                    처음에는 한국어 인식 파일을 받기 위해 인터넷이 필요할 수
                    있어요.
                  </p>
                  <label className="upload">
                    <span>▤</span>
                    <b>약 봉투 사진 선택</b>
                    <small>JPG 또는 PNG 이미지</small>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        setMessage("사진을 읽는 중입니다.");
                        try {
                          const { recognize } = await import("tesseract.js");
                          const r = await recognize(f, "kor+eng");
                          setOcr(r.data.text);
                          setMessage("인식 결과를 확인하세요.");
                        } catch {
                          setMessage(
                            "인식에 실패했어요. 샘플이나 직접 입력을 사용하세요.",
                          );
                        }
                      }}
                    />
                  </label>
                  <button
                    className="outline full"
                    onClick={() => setOcr("칼슘 영양제\n아침, 저녁")}
                  >
                    샘플 약 봉투 불러오기
                  </button>
                </section>
                <section className="panel">
                  <h2>인식 결과 확인</h2>
                  <p className="muted">인식된 약은 자동 등록되지 않습니다.</p>
                  <textarea
                    value={ocr}
                    onChange={(e) => setOcr(e.target.value)}
                    placeholder="인식 결과 또는 약 봉투 내용을 입력하세요."
                  />
                  <h3>찾은 후보</h3>
                  <p className="ocr-detected">
                    읽은 시간대:{" "}
                    {detectMealSlots(ocr).length
                      ? detectMealSlots(ocr)
                          .map((slot) => slot.label)
                          .join(" · ")
                      : "없음 — 직접 확인이 필요해요"}
                  </p>
                  {meds
                    .filter(
                      (m) => ocr.includes(m.name) || ocr.includes(m.ingredient),
                    )
                    .map((m) => (
                      <button
                        className="rule"
                        key={m.id}
                        onClick={() => openOcrReview(m.id)}
                      >
                        <span>{m.emoji}</span>
                        <div>
                          <b>{m.name}</b>
                          <small>{m.ingredient} · 확인 후 등록</small>
                        </div>
                        <span>＋</span>
                      </button>
                    ))}
                  {!meds.some(
                    (m) => ocr.includes(m.name) || ocr.includes(m.ingredient),
                  ) && (
                    <p className="muted">
                      일치하는 후보가 없어요. 내 약에서 직접 검색하세요.
                    </p>
                  )}
                </section>
              </div>
              <div className="tip">
                ⓘ OCR은 약 이름과 용량을 잘못 읽을 수 있어요. 약 봉투 원본과
                비교하세요.
              </div>
            </>
          )}
          {tab === "설정" && (
            <>
              <div className="page-title">
                <div>
                  <small>SETTINGS</small>
                  <h1>설정 및 데이터</h1>
                  <p>개인 정보는 이 브라우저에만 저장돼요.</p>
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
                <h2>브라우저 알림</h2>
                <button
                  className="outline"
                  onClick={async () => {
                    if (!window.isSecureContext)
                      return setMessage(
                        "현재 HTTP 주소에서는 시스템 알림을 사용할 수 없어요. 화면 알림은 작동합니다.",
                      );
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
                  페이지를 열어 두면 복용 시간에 화면 알림이 표시됩니다. 브라우저 밖의 시스템 알림은 HTTPS 또는 localhost에서 권한을 허용한 경우에만 가능합니다.
                </p>
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
                  ↓ JSON 백업
                </button>
                <label className="outline import">
                  ↑ 백업 가져오기
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
                <h2>시연 데이터</h2>
                <button
                  className="text-danger"
                  onClick={() => {
                    if (confirm("모든 기록을 지우고 기본 데모로 돌아갈까요?"))
                      setData(initial);
                  }}
                >
                  데모 초기화
                </button>
              </section>
              <div className="tip">
                ⓘ 교육용 데모입니다. 진단·처방·복용 간격 결정에 사용하지 마세요.
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
                <small>OCR SCHEDULE REVIEW</small>
                <h2>{find(chosen).name} 복용 시간 확인</h2>
              </div>
              <button onClick={() => setModal("")}>×</button>
            </div>
            <p className="muted">
              약 봉투에서 읽은 시간대만 표시했어요. 선택한 약의 지시가 맞는지
              원본과 비교하고, 실제 복용할 시각으로 수정하세요. 아래 시각은 임시
              예시이며 처방 시간이 아닙니다.
            </p>
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
            <div className="tip">
              ⓘ “1일 2회”만으로는 아침·저녁인지 알 수 없어 자동으로 정하지
              않습니다. 식전·식후 지시와 제품별 주의사항도 약 봉투에서 직접
              확인하세요.
            </div>
            <div className="modal-actions">
              <button className="outline" onClick={() => openAdd(chosen)}>
                시간 직접 입력
              </button>
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
                <small>ADD MEDICATION</small>
                <h2>복용 일정 추가</h2>
              </div>
              <button onClick={() => setModal("")}>×</button>
            </div>
            <input
              className="search"
              placeholder="제품명·성분명·품목번호 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <p className="muted catalog-count">
              예시 9개와 e약은요에서 정리한 일반약 {otcProducts.length}개를
              검색할 수 있어요.
            </p>
            <div className="catalog">
              {catalog
                .filter((m) =>
                  (
                    m.name +
                    " " +
                    m.ingredient +
                    " " +
                    m.type +
                    " " +
                    (m.officialName || "") +
                    " " +
                    (m.itemId || "")
                  )
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .map((m) => (
                  <button
                    className={chosen === m.id ? "selected" : ""}
                    key={m.id}
                    onClick={() => setChosen(m.id)}
                  >
                    <span>{m.emoji}</span>
                    <div>
                      <b>{m.name}</b>
                      <small>
                        {m.ingredient} · {m.type}
                      </small>
                    </div>
                    <span>{chosen === m.id ? "✓" : ""}</span>
                  </button>
                ))}
            </div>
            {selectedMed?.itemId && (
              <div className="product-detail">
                <b>제품과 성분 연결</b>
                <p>품목일련번호: {selectedMed.itemId}</p>
                <p>원문 제품명: {selectedMed.officialName}</p>
                <p>기재된 성분: {selectedMed.ingredient}</p>
                <p>원문 수정일: {selectedMed.sourceModified}</p>
                <details>
                  <summary>원문 주의사항·이상반응 보기</summary>
                  <strong>함께 사용할 때 주의할 약·음식 원문</strong>
                  <p className="notice-text">
                    {selectedMed.notice?.cautionOriginal || "기재된 원문이 없어요."}
                  </p>
                  <strong>이상반응 원문</strong>
                  <p className="notice-text">
                    {selectedMed.notice?.adverseOriginal || "기재된 원문이 없어요."}
                  </p>
                </details>
                <a href={selectedMed.source} target="_blank" rel="noreferrer">
                  e약은요 검색 열기 ↗
                </a>
                <p className="muted">
                  원문을 그대로 표시합니다. 이 내용만으로 약 사이의 상호작용을
                  자동 판정하지 않습니다.
                </p>
              </div>
            )}
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
                <small>MISSED DOSE GUIDE</small>
                <h2>{find(chosen).name} · 놓쳤을 때</h2>
              </div>
              <button onClick={() => setModal("")}>×</button>
            </div>
            <p className="muted">
              미복용으로 기록했어요. 아래는 일반 정보이며 제품별 처방 지시가
              우선입니다.
            </p>
            <ol>
              {find(chosen).guide?.map((g, i) => (
                <li key={i}>
                  <span>{i + 1}</span>
                  {g}
                </li>
              ))}
            </ol>
            {find(chosen).source && (
              <a href={find(chosen).source} target="_blank" rel="noreferrer">
                공식 자료 보기 ↗
              </a>
            )}
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
