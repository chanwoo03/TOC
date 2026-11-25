import { ScanText } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { CatalogStatus, ProductPicker } from "./CatalogViews.jsx";
import { OcrResultView } from "./OcrResultView.jsx";
import { ReceiptCrop } from "./ReceiptCrop.jsx";
import { buildStructure } from "./ocrStructure.js";

const supported = /^(?:image\/(?:jpeg|png|webp))$/i;
const STEPS = ["사진 고르기", "글자 읽기", "확인·고치기", "일정 등록"];

export function OcrPanel({ index, state, retry, onRegister, onChoose, onManual }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [turns, setTurns] = useState(0);
  const [area, setArea] = useState(null);
  const [selectingArea, setSelectingArea] = useState(false);
  const [structure, setStructure] = useState(null);
  const [meta, setMeta] = useState(null);
  const [previous, setPrevious] = useState(null);
  const [focusedId, setFocusedId] = useState(null);
  const [registered, setRegistered] = useState([]);
  const [progress, setProgress] = useState(null);
  const [message, setMessage] = useState("");
  const [running, setRunning] = useState(false);
  const [manual, setManual] = useState(false);
  const current = useRef(null);
  const reviewPanel = useRef(null);
  useEffect(() => () => current.current?.abort(), []);
  useEffect(() => {
    if (!file) return;
    const local = URL.createObjectURL(file);
    setPreview(local);
    return () => URL.revokeObjectURL(local);
  }, [file]);

  const step = !file ? 0 : !structure ? 1 : registered.length ? 3 : 2;
  const focused = structure?.medicines.find((medicine) => medicine.id === focusedId);
  const highlights = focused ? [focused.name.box, focused.instruction?.box, focused.effect?.box].filter(Boolean)
    .filter((box, position, all) => all.findIndex((other) => other === box) === position) : [];

  function reset() {
    setStructure(null);
    setMeta(null);
    setPrevious(null);
    setFocusedId(null);
    setRegistered([]);
  }

  function chooseFile(event) {
    const choice = event.target.files?.[0];
    event.target.value = "";
    if (!choice) return;
    if (!supported.test(choice.type) || choice.size > 15 * 1024 * 1024) {
      setMessage("15MB 이하의 JPG, PNG 또는 WEBP 사진을 선택해 주세요. HEIC는 JPG로 변환해 주세요.");
      return;
    }
    current.current?.abort();
    setFile(choice);
    setTurns(0);
    setArea(null);
    setSelectingArea(false);
    reset();
    setMessage("");
  }

  async function scan(alternate = false) {
    if (!file || current.current) return;
    const controller = new AbortController();
    current.current = controller;
    setRunning(true);
    setProgress(null);
    setMessage("");
    try {
      const { recognizeReceipt } = await import("./browserOcr.js");
      const result = await recognizeReceipt(file, turns, controller.signal, (value) => {
        if (!controller.signal.aborted) setProgress(value);
      }, { area, alternate });
      if (controller.signal.aborted) return;
      const next = buildStructure({ ...result, text: result.text.slice(0, 6000) });
      if (!result.text.trim()) {
        setMessage("새 글자를 찾지 못했어요. 글자 부분만 선택하거나 다른 방식으로 다시 읽어 보세요.");
        return;
      }
      if (structure) setPrevious({ structure, meta });
      setStructure(next);
      setMeta({ ...result.meta, turns });
      setFocusedId(next.medicines[0]?.id ?? null);
      setRegistered([]);
      // 폰·태블릿에서는 사진 아래에 결과가 있어서, 읽고 나면 결과 쪽으로 내려 준다
      if (window.matchMedia?.("(max-width: 1000px)").matches) {
        requestAnimationFrame(() => reviewPanel.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
      }
      setMessage(next.medicines.length
        ? `약 ${next.medicines.length}개를 찾았어요. 카드마다 사진 원본과 대조한 뒤 '봉투와 대조했어요'를 눌러 주세요.`
        : "약 이름으로 보이는 줄을 찾지 못했어요. 글자 부분만 골라 다시 읽거나 직접 추가해 주세요.");
    } catch {
      if (!controller.signal.aborted) setMessage("사진을 읽지 못했어요. 돌려서 다시 읽거나, 약 이름을 직접 입력해 주세요.");
    } finally {
      if (current.current === controller && !controller.signal.aborted) {
        current.current = null;
        setRunning(false);
      }
    }
  }

  function cancel() {
    current.current?.abort();
    current.current = null;
    setRunning(false);
    setProgress(null);
    setMessage("사진 읽기를 취소했어요.");
  }

  function register(record, product, medicineId) {
    onRegister(record, product, () => setRegistered((ids) => ids.includes(medicineId) ? ids : [...ids, medicineId]));
  }

  return <>
    <div className="page-title"><h1>약 봉투 읽기</h1>
      <p>사진 속 글자를 이 기기 안에서 읽어요. 사진과 읽은 글자는 서버로 보내지 않고, 일정으로 등록한 약 이름만 저장해요.</p></div>
    <ol className="ocr-steps" aria-label="진행 단계">
      {STEPS.map((label, position) => <li key={label} className={position < step ? "is-done" : position === step ? "is-now" : ""}
        aria-current={position === step ? "step" : undefined}><span>{position + 1}</span>{label}</li>)}
    </ol>
    <div className="columns catalog-columns ocr-columns">
      <section className="panel ocr-photo-panel">
        <h2>약 봉투 사진</h2>
        <label className={file ? "upload is-compact" : "upload"}>
          <span aria-hidden="true"><ScanText size={file ? 22 : 32} strokeWidth={1.6} /></span>
          <b>{file ? "다른 사진 고르기" : "약 봉투 사진 선택"}</b><small>JPG · PNG · WEBP, 15MB 이하 · 봉투가 화면에 가득 차게</small>
          <input type="file" aria-label="약 봉투 사진 선택" accept="image/jpeg,image/png,image/webp" onChange={chooseFile} disabled={running} />
        </label>
        {file && preview && <>
          <ReceiptCrop src={preview} turns={turns} area={area} selecting={selectingArea} highlights={meta?.turns === turns ? highlights : []}
            onSelect={(next) => { setArea(next); setSelectingArea(false); }} />
          {selectingArea && <p role="status">사진에서 읽을 글자의 왼쪽 위부터 오른쪽 아래까지 손가락이나 마우스로 끌어 주세요.</p>}
          {focused && highlights.length > 0 && meta?.turns === turns && <p className="muted ocr-highlight-note">초록 테두리 = 지금 보고 있는 약이 사진에 있던 자리</p>}
          <div className="catalog-pages ocr-tools">
            <button type="button" className="outline" onClick={() => {
              setTurns((value) => (value + 1) % 4);
              setArea(null);
              setSelectingArea(false);
            }} disabled={running}>90° 돌리기</button>
            <button type="button" className="outline" aria-pressed={selectingArea} disabled={running}
              onClick={() => setSelectingArea((value) => !value)}>{selectingArea ? "영역 선택 취소" : "글자 부분 선택"}</button>
            {area && <button type="button" className="outline" disabled={running}
              onClick={() => { setArea(null); setSelectingArea(false); }}>전체 사진으로</button>}
          </div>
          <button type="button" className="primary full" onClick={() => void scan()} disabled={running || selectingArea}>
            {area ? "선택한 부분 읽기" : structure ? "다시 읽기" : "사진 글자 읽기"}
          </button>
          {structure && <button type="button" className="outline full" onClick={() => void scan(true)}
            disabled={running || selectingArea}>다른 방식으로 다시 읽기 (한글+영문)</button>}
          {previous && <button type="button" className="outline full" disabled={running} onClick={() => {
            const swap = { structure, meta };
            setStructure(previous.structure);
            setMeta(previous.meta);
            setPrevious(swap);
            setFocusedId(previous.structure.medicines[0]?.id ?? null);
            setMessage("앞서 읽은 결과를 불러왔어요.");
          }}>이전 결과로 바꾸기</button>}
        </>}
        {running && <div className="info" role="status">
          <p>{progress === null ? "인식 도구를 준비하는 중이에요." : "사진을 읽고 있어요. 작은 사진은 크게 키워 읽느라 몇 초 걸려요."}</p>
          <progress aria-label="OCR 진행률" value={progress ?? undefined} max="1" />
          <button type="button" className="outline" onClick={cancel}>취소</button>
        </div>}
        {message && <p role="status" className="ocr-message">{message}</p>}
        <div className="tip">ⓘ OCR은 틀릴 수 있어요. 앱은 읽은 글자로 복용량이나 시간을 정하지 않고, 대조를 마친 약만 직접 등록할 수 있어요.</div>
      </section>
      <section className="panel ocr-review-panel" ref={reviewPanel}>
        <h2>읽은 결과 확인</h2>
        {!structure && <div className="ocr-empty">
          <p>사진을 읽으면 약마다 카드로 정리해 보여 드려요.</p>
          <ul>
            <li>약 이름 · 함량 · 복용 지시를 칸별로 나눠요.</li>
            <li>흐릿하게 읽힌 글자는 <mark>노란색</mark>으로 표시해요.</li>
            <li>카드마다 사진 원본 조각을 옆에 붙여 바로 대조할 수 있어요.</li>
          </ul>
        </div>}
        {structure && <OcrResultView structure={structure} setStructure={setStructure} meta={meta} index={index}
          catalogReady={state === "ready"} preview={preview} turns={meta?.turns ?? turns} focusedId={focusedId}
          onFocus={(medicine) => setFocusedId(medicine.id)} onRegister={register} registered={registered} />}
        <CatalogStatus state={state} retry={retry} />
        {state === "ready" && <button type="button" className="outline full" onClick={() => setManual((value) => !value)} aria-expanded={manual}>공식 제품 직접 검색</button>}
        {state === "ready" && manual && <ProductPicker index={index} onPick={(product) => onChoose(product, "")} />}
        <button type="button" className="outline full" onClick={onManual}>제품명을 직접 입력해 일정 만들기</button>
      </section>
    </div>
  </>;
}
