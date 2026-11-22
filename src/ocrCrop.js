export function receiptCrop(width, height, turns, area) {
  if (!area) return { x: 0, y: 0, width, height };
  const orientedWidth = turns % 2 ? height : width;
  const orientedHeight = turns % 2 ? width : height;
  const x = Math.floor(area.x * orientedWidth);
  const y = Math.floor(area.y * orientedHeight);
  const w = Math.min(orientedWidth, Math.ceil((area.x + area.width) * orientedWidth)) - x;
  const h = Math.min(orientedHeight, Math.ceil((area.y + area.height) * orientedHeight)) - y;
  switch (turns) {
    case 1: return { x: y, y: height - x - w, width: h, height: w };
    case 2: return { x: width - x - w, y: height - y - h, width: w, height: h };
    case 3: return { x: width - y - h, y: x, width: h, height: w };
    default: return { x, y, width: w, height: h };
  }
}
