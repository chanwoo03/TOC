import React, { useEffect, useState } from "react";
import { meds, rules, food, initial } from "./data.js";
const key = "medisync-react-v1",
  today = () => new Date().toLocaleDateString("sv-SE"),
  id = () => Math.random().toString(36).slice(2);
function App() {
  const [data, setData] = useState(() => {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v && Array.isArray(v.items) && Array.isArray(v.logs) ? v : initial;
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
    [message, setMessage] = useState("");
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
          const m = [...meds, ...data.custom].find((y) => y.id === x.med);
          new Notification("복용 예정: " + (m?.name || "약"), {
            body: "복용 후 앱에서 완료를 기록해 주세요.",
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
  const catalog = [...meds, ...data.custom],
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
  const cautions = rules.filter(
    (r) =>
      active.some((x) => x.med === r.a) && active.some((x) => x.med === r.b),
  );
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
    setSearch("");
    setTime("08:00");
    setNote("");
    setModal("add");
  };
  const add = () => {
    if (!chosen) return setMessage("약을 먼저 선택해 주세요.");
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
  const comparison = rules.find(
    (r) => (r.a === a && r.b === b) || (r.a === b && r.b === a),
  );
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
                  <span>함께 먹기 주의</span>
                  <strong>
                    {cautions.length}
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
                      <p>성분 기준으로 확인된 조합이에요.</p>
                    </div>
                  </div>
                  {cautions.length ? (
                    cautions.map((r) => (
                      <div className="warning" key={r.title}>
                        <b>⚠ {r.title}</b>
                        <p>{r.detail}</p>
                        <a href={r.source} target="_blank" rel="noreferrer">
                          공식 자료 보기 ↗
                        </a>
                      </div>
                    ))
                  ) : (
                    <div className="info">
                      현재 등록 목록에 확인된 주의 조합이 없습니다. 다른 조합은
                      자료 확인이 필요해요.
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
                  <p>약, 영양제, 음식 중 두 가지를 골라 확인하세요.</p>
                </div>
              </div>
              <section className="panel">
                <div className="compare">
                  <label>
                    첫 번째 항목
                    <select value={a} onChange={(e) => setA(e.target.value)}>
                      {[...meds, food].map((x) => (
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
                      {[...meds, food].map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name} ({x.ingredient})
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {a === b ? (
                  <div className="result">서로 다른 항목을 선택해 주세요.</div>
                ) : comparison ? (
                  <div className="result caution">
                    <span>확인된 주의 조합</span>
                    <h3>{comparison.title}</h3>
                    <p>{comparison.detail}</p>
                    <a
                      href={comparison.source}
                      target="_blank"
                      rel="noreferrer"
                    >
                      공식 근거 보기 ↗
                    </a>
                  </div>
                ) : (
                  <div className="result">
                    <h3>검증 자료가 아직 없어요.</h3>
                    <p>
                      자료가 없다는 것은 안전하다는 뜻이 아닙니다. 약사나
                      의료진에게 확인하세요.
                    </p>
                  </div>
                )}
              </section>
              <section className="panel">
                <div className="heading">
                  <h2>데모에 포함된 주의 사례</h2>
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
                    onClick={() =>
                      setOcr("타이레놀정 500mg\n칼슘 영양제\n1일 1회")
                    }
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
                  {meds
                    .filter(
                      (m) => ocr.includes(m.name) || ocr.includes(m.ingredient),
                    )
                    .map((m) => (
                      <button
                        className="rule"
                        key={m.id}
                        onClick={() => openAdd(m.id)}
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
                  데모 알림은 페이지가 열려 있는 동안에만 동작합니다.
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
              placeholder="타이레놀, 갑상선 약, 칼슘 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="catalog">
              {catalog
                .filter((m) =>
                  (m.name + " " + m.ingredient + " " + m.type)
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
