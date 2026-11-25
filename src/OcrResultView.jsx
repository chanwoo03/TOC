import { CircleCheck, FileJson, Lightbulb, Pencil, Plus, ScanText, Trash2, TriangleAlert, Undo2 } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { candidateRows } from "./catalog.js";
import {
  addManualMedicine, applyEdit, fieldValue, parseInstruction, registrationRecord, removeMedicine, setConfirmed, validateMedicine,
} from "./ocrStructure.js";

// 원본 사진(돌린 방향 기준)을 한 번만 줄여 그려 두고, 줄 위치만 잘라 보여 준다.
const orientedCache = new Map();
async function orientedImage(src, turns) {
  const key = src + "#" + turns;
  if (!orientedCache.has(key)) {
    orientedCache.set(key, (async () => {
      const image = new Image();
      image.src = src;
      await image.decode();
      const scale = Math.min(1, 2000 / Math.max(image.width, image.height));
      const w = Math.round(image.width * scale), h = Math.round(image.height * scale);
      const canvas = document.createElement("canvas");
      [canvas.width, canvas.height] = turns % 2 ? [h, w] : [w, h];
      const context = canvas.getContext("2d");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.translate(canvas.width / 2, canvas.height / 2);
      context.rotate(turns * Math.PI / 2);
      context.drawImage(image, -w / 2, -h / 2, w, h);
      return canvas;
    })());
    if (orientedCache.size > 6) orientedCache.delete(orientedCache.keys().next().value);
  }
  return orientedCache.get(key);
}

/** 사진에서 이 글자가 있던 부분만 잘라 보여 준다 (원본과 대조용). */
export function LineCrop({ src, turns, box, label }) {
  const canvas = useRef(null);
  useEffect(() => {
    if (!src || !box) return;
    let alive = true;
    void orientedImage(src, turns).then((source) => {
      if (!alive || !canvas.current) return;
      const padX = 0.01, padY = box.height * 0.35;
      const x = Math.max(0, box.x - padX) * source.width, y = Math.max(0, box.y - padY) * source.height;
      const w = Math.min(1, box.width + padX * 2) * source.width, h = Math.min(1, box.height + padY * 2) * source.height;
      const scale = Math.min(3, 640 / Math.max(1, w));
      const view = canvas.current;
      view.width = Math.max(1, Math.round(w * scale));
      view.height = Math.max(1, Math.round(h * scale));
      const context = view.getContext("2d");
      context.imageSmoothingQuality = "high";
      context.drawImage(source, x, y, w, h, 0, 0, view.width, view.height);
    }).catch(() => {});
    return () => { alive = false; };
  }, [src, turns, box]);
  if (!box) return null;
  return <figure className="ocr-crop"><canvas ref={canvas} role="img" aria-label={label} /><figcaption>사진 원본</figcaption></figure>;
}

function Glyphs({ item }) {
  if (!item?.glyphs?.some((glyph) => glyph.weak)) return <>{item?.text}</>;
  return <>{item.glyphs.map((glyph, index) => glyph.weak
    ? <mark key={index} title="흐릿하게 읽힌 글자">{glyph.text}</mark> : <span key={index}>{glyph.text}</span>)}</>;
}

function EditableField({ label, value, ocrItem, edited, placeholder, onSave, multiline = false, big = false }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);
  const save = () => { onSave(draft); setEditing(false); };
  return <div className={big ? "ocr-field is-big" : "ocr-field"}>
    <div className="ocr-field-head">
      <span className="ocr-field-label">{label}</span>
      {edited && <span className="ocr-badge is-edited">직접 고침</span>}
      {!edited && ocrItem?.uncertain && <span className="ocr-badge is-weak">확인 필요</span>}
    </div>
    {editing ? <div className="ocr-edit">
      {multiline
        ? <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={2} aria-label={label + " 고치기"} />
        : <input value={draft} onChange={(event) => setDraft(event.target.value)} aria-label={label + " 고치기"}
          onKeyDown={(event) => { if (event.key === "Enter") save(); if (event.key === "Escape") setEditing(false); }} autoFocus />}
      <div className="ocr-edit-actions">
        <button type="button" className="primary" onClick={save}>저장</button>
        <button type="button" className="outline" onClick={() => setEditing(false)}>취소</button>
      </div>
      {edited && ocrItem && <p className="ocr-origin">사진에서 읽은 글자: <q>{ocrItem.text}</q></p>}
    </div> : <div className="ocr-value-row">
      <p className={value ? "ocr-value" : "ocr-value is-empty"}>
        {edited || !ocrItem ? (value || placeholder) : <Glyphs item={ocrItem} />}
      </p>
      <button type="button" className="icon-button" onClick={() => setEditing(true)} aria-label={label + " 고치기"}><Pencil size={16} /></button>
    </div>}
    {!editing && edited && ocrItem && <p className="ocr-origin">사진에서 읽은 글자: <q>{ocrItem.text}</q></p>}
  </div>;
}

function MedicineCard({ medicine, number, structure, setStructure, index, catalogReady, preview, turns, focused, onFocus, onRegister, registered }) {
  const name = fieldValue(structure, medicine.id, "name");
  const instruction = fieldValue(structure, medicine.id, "instruction");
  const edits = structure.edits[medicine.id] ?? {};
  const confirmed = Boolean(structure.confirmed[medicine.id]);
  const problems = validateMedicine(structure, medicine.id);
  const blocking = problems.filter((problem) => problem.level === "error" && problem.field !== "confirm");
  const parsed = instruction ? parseInstruction(instruction) : null;
  const [linked, setLinked] = useState(null);
  const candidates = useMemo(() => catalogReady && name.trim() ? (candidateRows(index, name)[0]?.products ?? []) : [], [catalogReady, index, name]);
  useEffect(() => { if (linked && !candidates.some((product) => product.code === linked.code)) setLinked(null); }, [candidates, linked]);
  const suggestion = medicine.name.suggestion;
  const showSuggestion = suggestion && edits.name === undefined;
  return <article className={["ocr-med", focused && "is-focused", confirmed && "is-confirmed", registered && "is-registered"].filter(Boolean).join(" ")}
    onFocusCapture={() => onFocus(medicine)} onPointerDown={() => onFocus(medicine)} aria-label={`${number}번째 약`}>
    <div className="ocr-med-head">
      <span className="ocr-med-number">{number}</span>
      <div className="ocr-med-chips">
        {medicine.source === "user" ? <span className="ocr-badge">직접 추가</span>
          : medicine.name.guessed ? <span className="ocr-badge is-weak">표의 이름 칸 (약 이름 꼴 아님)</span> : null}
        {medicine.name.strength && edits.name === undefined && <span className="ocr-chip">{medicine.name.strength}</span>}
        {medicine.name.form && edits.name === undefined && <span className="ocr-chip">{medicine.name.form}</span>}
        {registered && <span className="ocr-badge is-done"><CircleCheck size={14} /> 일정 등록함</span>}
      </div>
      <button type="button" className="icon-button" aria-label={`${number}번째 약 지우기`}
        onClick={() => setStructure((value) => removeMedicine(value, medicine.id))}><Trash2 size={16} /></button>
    </div>

    <div className="ocr-med-body">
      <div className="ocr-med-fields">
        <EditableField big label="약 이름" value={name} ocrItem={medicine.source === "user" ? null : medicine.name}
          edited={edits.name !== undefined} placeholder="약 이름을 입력해 주세요"
          onSave={(value) => setStructure((current) => applyEdit(current, medicine.id, "name", value))} />
        {showSuggestion && <div className="ocr-suggest">
          <Lightbulb size={16} aria-hidden="true" />
          <span>{suggestion.reason}: <b>{suggestion.value}</b></span>
          <button type="button" className="outline" onClick={() => setStructure((current) => applyEdit(current, medicine.id, "name", suggestion.value))}>제안대로 고치기</button>
        </div>}
        <EditableField label="복용 지시" value={instruction} ocrItem={medicine.instruction} edited={edits.instruction !== undefined}
          placeholder="찾지 못했어요" onSave={(value) => setStructure((current) => applyEdit(current, medicine.id, "instruction", value))} />
        {parsed && <dl className="ocr-parsed">
          {parsed.dose && <div><dt>한 번에</dt><dd>{parsed.dose}</dd></div>}
          {parsed.frequency && <div><dt>횟수</dt><dd>{parsed.frequency}</dd></div>}
          {parsed.days && <div><dt>기간</dt><dd>{parsed.days}</dd></div>}
        </dl>}
        {(medicine.effect || medicine.details.length > 0) && <div className="ocr-extra">
          {medicine.effect && <p><span>분류</span>{medicine.effect.text}</p>}
          {medicine.details.map((detail) => <p key={detail.lineId + detail.text}><span>설명</span>{detail.text}</p>)}
        </div>}
      </div>
      {preview && medicine.name.box && <LineCrop src={preview} turns={turns} box={medicine.name.box} label={`${number}번째 약 이름 부분 원본 사진`} />}
    </div>

    {catalogReady && name.trim() && <div className="ocr-link">
      <p className="ocr-field-label">e약은요 제품 연결 <small>(선택)</small></p>
      {candidates.length ? <div className="ocr-link-options">
        {candidates.map((product) => <button type="button" key={product.code} aria-pressed={linked?.code === product.code}
          className={linked?.code === product.code ? "ocr-option is-on" : "ocr-option"} onClick={() => setLinked(linked?.code === product.code ? null : product)}>
          <b>{product.name}</b><small>{product.manufacturer}</small>
        </button>)}
      </div> : <p className="muted">e약은요(일반의약품 위주)에 비슷한 제품이 없어요. 처방약일 수 있어요. 이름만으로 등록할 수 있어요.</p>}
    </div>}

    {problems.filter((problem) => problem.field !== "confirm").length > 0 && <ul className="ocr-problems">
      {problems.filter((problem) => problem.field !== "confirm").map((problem) => <li key={problem.message} className={problem.level === "error" ? "is-error" : "is-warning"}>
        <TriangleAlert size={15} aria-hidden="true" />{problem.message}
      </li>)}
    </ul>}

    <div className="ocr-med-foot">
      <label className="ocr-confirm">
        <input type="checkbox" checked={confirmed} onChange={(event) => setStructure((current) => setConfirmed(current, medicine.id, event.target.checked))} />
        봉투와 대조했어요
      </label>
      <button type="button" className="primary" disabled={!confirmed || blocking.length > 0}
        onClick={() => onRegister(registrationRecord(structure, medicine.id), linked, medicine.id)}>
        {linked ? "연결한 제품으로 일정 만들기" : "이 이름으로 일정 만들기"}
      </button>
    </div>
  </article>;
}

export function OcrResultView({ structure, setStructure, meta, index, catalogReady, preview, turns, focusedId, onFocus, onRegister, registered }) {
  const total = structure.medicines.length;
  const editedCount = Object.values(structure.edits).reduce((sum, fields) => sum + Object.keys(fields).length, 0);
  const uncertainCount = structure.medicines.filter((medicine) => (medicine.name.uncertain && structure.edits[medicine.id]?.name === undefined)
    || (medicine.instruction?.uncertain && structure.edits[medicine.id]?.instruction === undefined)).length;
  const confirmedCount = structure.medicines.filter((medicine) => structure.confirmed[medicine.id]).length;
  const json = useMemo(() => JSON.stringify({
    title: structure.title?.text ?? null,
    medicines: structure.medicines.map((medicine) => ({
      id: medicine.id, source: medicine.source ?? "ocr",
      ocr: { name: medicine.name.text || null, instruction: medicine.instruction?.text ?? null, effect: medicine.effect?.text ?? null,
        strength: medicine.name.strength ?? null, form: medicine.name.form ?? null, uncertain: Boolean(medicine.name.uncertain) },
      edited: structure.edits[medicine.id] ?? {},
      confirmed: Boolean(structure.confirmed[medicine.id]),
    })),
    notes: structure.notes.map((item) => item.text),
    dropped: structure.dropped.length,
    meta,
  }, null, 2), [structure, meta]);

  return <div className="ocr-result">
    <section className="ocr-summary" aria-label="읽은 결과 요약">
      <div>
        <p className="ocr-eyebrow"><ScanText size={15} aria-hidden="true" /> 사진에서 읽은 문서</p>
        <h3>{structure.title?.text ?? "약 봉투"}</h3>
      </div>
      <dl className="ocr-stats">
        <div><dt>찾은 약</dt><dd>{total}개</dd></div>
        <div className={uncertainCount ? "is-weak" : ""}><dt>확인 필요</dt><dd>{uncertainCount}개</dd></div>
        <div><dt>직접 고침</dt><dd>{editedCount}개</dd></div>
        <div className={confirmedCount === total && total ? "is-done" : ""}><dt>대조 완료</dt><dd>{confirmedCount}/{total}</dd></div>
      </dl>
      {meta?.lowResolution && <p className="ocr-warning"><TriangleAlert size={16} aria-hidden="true" />
        사진 속 글자가 너무 작아요. 봉투를 화면에 가득 차게 가까이서 다시 찍으면 훨씬 정확해져요.</p>}
      {!meta?.lowResolution && meta && structure.confidence !== null && structure.confidence < 60 && <p className="ocr-warning">
        <TriangleAlert size={16} aria-hidden="true" />사진이 흐리거나 그림자가 있어 잘못 읽은 글자가 많을 수 있어요. 밝은 곳에서 흔들리지 않게 다시 찍어 보세요.</p>}
      {meta?.skew ? <p className="muted">사진이 {Math.abs(meta.skew)}° 기울어져 있어 바로 세운 뒤 읽었어요.</p> : null}
    </section>

    {total === 0 && <div className="info">약 이름으로 보이는 줄을 찾지 못했어요. 글자 부분만 선택해 다시 읽거나, 아래에서 약을 직접 추가해 주세요.</div>}

    <div className="ocr-med-list">
      {structure.medicines.map((medicine, position) => <MedicineCard key={medicine.id} medicine={medicine} number={position + 1}
        structure={structure} setStructure={setStructure} index={index} catalogReady={catalogReady} preview={preview} turns={turns}
        focused={focusedId === medicine.id} onFocus={onFocus} onRegister={onRegister} registered={registered.includes(medicine.id)} />)}
    </div>

    <button type="button" className="outline full" onClick={() => setStructure((current) => addManualMedicine(current, ""))}>
      <Plus size={16} aria-hidden="true" /> 빠진 약 직접 추가
    </button>

    {structure.notes.length > 0 && <details className="ocr-more">
      <summary>그 밖에 읽힌 글자 {structure.notes.length}줄</summary>
      <ul>{structure.notes.map((item, position) => <li key={item.lineId + position}>{item.text}</li>)}</ul>
    </details>}
    {structure.dropped.length > 0 && <details className="ocr-more">
      <summary>알아볼 수 없어 뺀 줄 {structure.dropped.length}줄</summary>
      <ul className="is-dim">{structure.dropped.map((item) => <li key={item.lineId}>{item.text}</li>)}</ul>
    </details>}
    <details className="ocr-more">
      <summary>사진에서 읽은 원문 그대로</summary>
      <pre className="ocr-raw">{structure.rawText.replace(/\n{2,}/gu, "\n").trim()}</pre>
    </details>
    <details className="ocr-more">
      <summary><FileJson size={15} aria-hidden="true" /> 정리된 데이터 (JSON)</summary>
      <p className="muted">사진에서 읽은 값(ocr)과 직접 고친 값(edited)을 따로 둡니다. 사진과 원문은 저장하지 않아요.</p>
      <pre className="ocr-raw">{json}</pre>
    </details>
    {editedCount > 0 && <p className="muted"><Undo2 size={14} aria-hidden="true" /> 고친 칸을 사진에서 읽은 글자와 똑같이 되돌리면 '직접 고침' 표시가 사라져요.</p>}
  </div>;
}
