import React, { useEffect, useRef, useState } from "react";

function rectangle(start, end) {
  return {
    x: Math.min(start.x, end.x), y: Math.min(start.y, end.y),
    width: Math.abs(start.x - end.x), height: Math.abs(start.y - end.y),
  };
}

function point(event) {
  const bounds = event.currentTarget.getBoundingClientRect();
  const clamp = (value) => Math.max(0, Math.min(1, value));
  return { x: clamp((event.clientX - bounds.left) / bounds.width), y: clamp((event.clientY - bounds.top) / bounds.height) };
}

export function ReceiptCrop({ src, turns, area, selecting, onSelect }) {
  const canvas = useRef(null);
  const start = useRef(null);
  const [draft, setDraft] = useState(null);
  const [ratio, setRatio] = useState(1.5);

  useEffect(() => {
    let alive = true;
    const image = new Image();
    image.src = src;
    void image.decode().then(() => {
      if (!alive || !canvas.current) return;
      const view = canvas.current;
      const scale = Math.min(1, 750 / Math.max(image.width, image.height));
      const w = Math.max(1, Math.round(image.width * scale));
      const h = Math.max(1, Math.round(image.height * scale));
      [view.width, view.height] = turns % 2 ? [h, w] : [w, h];
      setRatio(view.width / view.height);
      const context = view.getContext("2d");
      if (!context) return;
      context.fillStyle = "#fff";
      context.fillRect(0, 0, view.width, view.height);
      context.translate(view.width / 2, view.height / 2);
      context.rotate(turns * Math.PI / 2);
      context.drawImage(image, -w / 2, -h / 2, w, h);
    }).catch(() => {});
    return () => { alive = false; };
  }, [src, turns]);

  const shown = selecting && draft ? draft : area;
  return <div className="receipt-preview">
    <div className={selecting ? "receipt-image is-selecting" : "receipt-image"}
      style={{ maxWidth: Math.min(640, Math.round(420 * ratio)) }}
      onPointerDown={(event) => {
        if (!selecting || !event.isPrimary || event.button !== 0 || !canvas.current?.width) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        start.current = point(event);
        setDraft(rectangle(start.current, start.current));
      }}
      onPointerMove={(event) => {
        if (selecting && start.current) setDraft(rectangle(start.current, point(event)));
      }}
      onPointerUp={(event) => {
        if (!selecting || !start.current) return;
        const next = rectangle(start.current, point(event));
        start.current = null;
        setDraft(null);
        if (next.width >= 0.04 && next.height >= 0.04) onSelect(next);
      }}
      onPointerCancel={() => { start.current = null; setDraft(null); }}>
      <canvas ref={canvas} role="img" aria-label="선택한 약 봉투 미리보기" />
      {shown && <div className="receipt-selection" aria-hidden="true" style={{
        left: shown.x * 100 + "%", top: shown.y * 100 + "%",
        width: shown.width * 100 + "%", height: shown.height * 100 + "%",
      }} />}
    </div>
  </div>;
}
