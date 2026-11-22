import React, { useEffect, useMemo, useRef, useState } from "react";
import { candidateRows } from "./catalog.js";
import { CatalogStatus, ProductPicker } from "./CatalogViews.jsx";
import { ReceiptCrop } from "./ReceiptCrop.jsx";
import { recognizedInstructionRows } from "./ocrInstructions.js";

const supported = /^(?:image\/(?:jpeg|png|webp))$/i;

export function OcrPanel({ index, state, retry, onChoose, onManual }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [turns, setTurns] = useState(0);
  const [area, setArea] = useState(null);
  const [selectingArea, setSelectingArea] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [text, setText] = useState("");
  const [previousText, setPreviousText] = useState(null);
  const [progress, setProgress] = useState(null);
  const [message, setMessage] = useState("");
  const [running, setRunning] = useState(false);
  const [manual, setManual] = useState(false);
  const current = useRef(null);
  const captured = useMemo(() => candidateRows(index, text), [index, text]);
  const instructions = useMemo(() => recognizedInstructionRows(text), [text]);
  useEffect(() => () => current.current?.abort(), []);
  useEffect(() => {
    if (!file) return;
    const local = URL.createObjectURL(file);
    setPreview(local);
    return () => URL.revokeObjectURL(local);
  }, [file]);

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
    setHasScanned(false);
    setText("");
    setPreviousText(null);
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
      setHasScanned(true);
      const nextText = result.text.trim().slice(0, 6000);
      if (nextText && nextText !== text) {
        setPreviousText(text || null);
        setText(nextText);
      }
      setMessage(!nextText ? "새 글자를 찾지 못했어요. 글자 부분만 선택하거나 다른 방식으로 다시 읽어 보세요."
        : result.confidence < 65 ? "흐릿하게 읽힌 글자가 있어요. 봉투와 대조하거나 글자 부분만 골라 다시 읽어 보세요." : "읽은 글자를 약 봉투와 대조해 주세요.");
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

  return <>
    <div className="page-title"><h1>약 봉투 읽기</h1>
      <p>사진 속 글자를 이 브라우저에서 읽어요. 사진과 읽은 글자는 서버로 보내거나 복약 기록에 보관하지 않아요.</p></div>
    <div className="columns catalog-columns">
      <section className="panel">
        <h2>약 봉투 사진</h2>
        <label className="upload">
          <span aria-hidden="true">▤</span><b>약 봉투 사진 선택</b><small>JPG · PNG · WEBP, 15MB 이하</small>
          <input type="file" aria-label="약 봉투 사진 선택" accept="image/jpeg,image/png,image/webp" onChange={chooseFile} disabled={running} />
        </label>
        {file && preview && <>
          <ReceiptCrop src={preview} turns={turns} area={area} selecting={selectingArea}
            onSelect={(next) => { setArea(next); setSelectingArea(false); }} />
          {selectingArea && <p role="status">사진에서 읽을 글자의 왼쪽 위부터 오른쪽 아래까지 손가락이나 마우스로 끌어 주세요.</p>}
          <div className="catalog-pages">
            <button type="button" className="outline" onClick={() => {
              setTurns((value) => (value + 1) % 4);
              setArea(null);
              setSelectingArea(false);
            }} disabled={running}>90° 돌리기</button>
            <button type="button" className="outline" aria-pressed={selectingArea} disabled={running}
              onClick={() => setSelectingArea((value) => !value)}>{selectingArea ? "영역 선택 취소" : "글자 부분 선택"}</button>
            {area && <button type="button" className="outline" disabled={running}
              onClick={() => { setArea(null); setSelectingArea(false); }}>전체 사진으로</button>}
            <button type="button" className="primary" onClick={() => void scan()} disabled={running || selectingArea}>
              {area ? "선택한 부분 읽기" : "사진 글자 읽기"}
            </button>
          </div>
          {hasScanned && <button type="button" className="outline full" onClick={() => void scan(true)}
            disabled={running || selectingArea}>다른 방식으로 다시 읽기</button>}
          {previousText !== null && <button type="button" className="outline full" disabled={running} onClick={() => {
            setText(previousText);
            setPreviousText(text);
            setMessage("앞서 읽은 글자를 불러왔어요.");
          }}>이전 결과로 바꾸기</button>}
        </>}
        {running && <div className="info" role="status">
          <p>{progress === null ? "인식 도구를 준비하는 중이에요." : "사진을 읽고 있어요."}</p>
          <progress aria-label="OCR 진행률" value={progress ?? undefined} max="1" />
          <button type="button" className="outline" onClick={cancel}>취소</button>
        </div>}
        {message && <p role="status">{message}</p>}
      </section>
      <section className="panel">
        <h2>인식 결과 확인</h2>
        <label>봉투에 적힌 내용
          <textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={6000} disabled={running}
            placeholder="사진을 읽거나 검색할 약 이름을 직접 입력하세요." />
        </label>
        {instructions.length > 0 && <section className="info ocr-instructions" aria-labelledby="ocr-instructions-title">
          <h3 id="ocr-instructions-title">사진에서 읽힌 복용 내용</h3>
          <p>사진에 적힌 약 이름과 같은 줄인지, 숫자와 단위가 맞는지 확인해 주세요. 일정은 직접 확인해 등록할 수 있어요.</p>
          {instructions.map(({ line, dose, frequency, days }) => <div className="ocr-instruction-row" key={line}>
            <p className="source-text">{line}</p>
            <dl>
              {dose && <div><dt>읽힌 복용량</dt><dd>{dose}</dd></div>}
              {frequency && <div><dt>읽힌 횟수</dt><dd>{frequency}</dd></div>}
              {days && <div><dt>읽힌 기간</dt><dd>{days}</dd></div>}
            </dl>
          </div>)}
        </section>}
        <CatalogStatus state={state} retry={retry} />
        {captured.length > 0 && <p>읽힌 줄마다 최대 3개 후보를 보여줘요. 실제 제품명·함량·제형을 확인해 주세요.</p>}
        {captured.map(({ line, products }) => <div className="ocr-candidates" key={line}>
          <h3>{line}</h3>
          {products.map((product) => <button className="rule" key={product.code} type="button" onClick={() => onChoose(product, line)}>
            <span aria-hidden="true">💊</span><div><b>{product.name}</b><small>{product.manufacturer} · 품목코드 {product.code}</small></div><span aria-hidden="true">＋</span>
          </button>)}
        </div>)}
        {state === "ready" && text.trim() && !captured.length && <div className="info">일치하는 공식 후보가 없어요. 제품을 직접 검색해 주세요.</div>}
        {state === "ready" && <button type="button" className="outline full" onClick={() => setManual((value) => !value)} aria-expanded={manual}>공식 제품 직접 검색</button>}
        {state === "ready" && manual && <ProductPicker index={index} onPick={(product) => onChoose(product, "")} />}
        <button type="button" className="outline full" onClick={onManual}>제품명을 직접 입력해 일정 만들기</button>
      </section>
    </div>
  </>;
}
