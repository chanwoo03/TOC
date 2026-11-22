import React, { useEffect, useMemo, useState } from "react";
import { meds, initial } from "./data.js";
import { detectMealSlots } from "./schedule.js";
import { buildIndex, duplicateIngredients, loadOfficialCatalog } from "./catalog.js";
import { CatalogPage, CatalogStatus, ComparePage, ProductPicker } from "./CatalogViews.jsx";
import { OcrPanel } from "./OcrPanel.jsx";
const key = "medisync-react-v1",
  today = () => new Date().toLocaleDateString("sv-SE"),
  id = () => Math.random().toString(36).slice(2);
const emptyProfile = { ...initial, items: [] };
const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const officialId = (product) => "mfds:" + product.code;
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
    [message, setMessage] = useState("");
  const [source, setSource] = useState({ state: "loading", products: [] });
  const [attempt, setAttempt] = useState(0);
  const [detail, setDetail] = useState(null);
  const retry = () => setAttempt((value) => value + 1);
  const index = useMemo(() => buildIndex(source.products), [source.products]);
  const allOfficial = useMemo(() => new Map(source.products.map((product) => [officialId(product), product])), [source.products]);

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
    if (!("Notification" in window) || Notification.permission !== "granted")
      return;
    const tick = () => {
      const hm = new Date().toTimeString().slice(0, 5),
        d = today();
      data.items
        .filter((x) => x.active && x.time === hm)
        .forEach((x) => {
          const k = "medisync-alert-" + d + "-" + x.id;
          if (sessionStorage.getItem(k)) return;
          sessionStorage.setItem(k, "1");
          new Notification("MediSync AI 복약 알림", {
            body: "예정된 복약 기록을 확인해 주세요.",
          });
        });
    };
    tick();
    const timer = setInterval(tick, 30000);
    return () => clearInterval(timer);
  }, [data]);
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
  const openAdd = (med = "") => {
    setChosen(med);
    setTime("");
    setNote("");
    setModal("add");
  };
  const openOcrReview = (product, line) => {
    setChosen(officialId(product));
    setSuggestions(detectMealSlots(line));
    setModal("ocr-review");
  };

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
    if (!clock.test(time)) return setMessage("실제 복용할 시각을 입력해 주세요.");
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
                onClick={() => {
                  setMessage(
                    "10분 뒤 다시 알려드릴게요. 페이지를 열어 두세요.",
                  );
                  setTimeout(() => {
                    if (
                      "Notification" in window &&
                      Notification.permission === "granted"
                    )
                      new Notification("다시 확인: " + med.name, {
                        body: "복용했다면 앱에서 완료를 기록해 주세요.",
                      });
                    else setMessage(med.name + " 복용을 다시 확인해 주세요.");
                  }, 600000);
                }}
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
            <small>복약 관리</small>
          </div>
        </div>
        <nav>
          {tabs.map((x, i) => (
            <button
              key={x}
              className={tab === x ? "current" : ""}
              onClick={() => setTab(x)}
            >
              <span aria-hidden="true">{["⌂", "♡", "⌕", "⚠", "▦", "▤", "⚙"][i]}</span>
              {x}
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
          {tab === "약 봉투 읽기" && <OcrPanel index={index} state={source.state} retry={retry}
            onChoose={openOcrReview} onManual={() => openAdd()} />}
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
                  브라우저 알림은 페이지가 열려 있는 동안에만 동작합니다.
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
                <small>OCR SCHEDULE REVIEW</small>
                <h2>{find(chosen).name} 복용 시간 확인</h2>
              </div>
              <button onClick={() => setModal("")}>×</button>
            </div>
            <p className="muted">
              이 줄에서 읽힌 시간대도 실제로 선택한 약의 지시인지 원본을 확인하세요. 확인한 시간대를 선택하고 실제 복용할 시각을 직접 입력하세요.
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
            <CatalogStatus state={source.state} retry={retry} />
            {source.state === "ready" && <ProductPicker index={index} selectedCode={allOfficial.get(chosen)?.code}
              onPick={(product) => setChosen(officialId(product))} />}
            {chosen && <p><b>선택 · {find(chosen).name}</b></p>}
            {data.custom.length > 0 && <details><summary>직접 입력해 둔 제품</summary>
              <div className="catalog-list">{data.custom.map((product) => <button key={product.id} type="button" className="rule"
                onClick={() => setChosen(product.id)}><span>{product.emoji}</span><div><b>{product.name}</b><small>사용자가 입력한 정보</small></div><span>→</span></button>)}</div>
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
