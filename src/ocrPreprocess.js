// 약 봉투 사진을 OCR 전에 다듬는 순수 함수 모음 (브라우저 canvas 없이도 시험할 수 있게 배열만 다룬다)
// 측정 근거: bench/ 의 같은 사진 비교 (2026-11-25) — 확대·배경 평탄화·한국어 단독이 오인식과 잡음 줄을 줄였다.

export const MAX_SIDE = 2450;

/** 잘라 낸 영역 크기로 확대 배율을 정한다. 작은 사진은 크게, 큰 사진은 메모리 한도 안으로 줄인다. */
export function chooseScale(width, height, area) {
  const longest = Math.max(width, height);
  // 전체 사진은 3배까지: 4배와 정확도가 비슷하고 더 빨랐다 (real-a/b, 같은 사진 비교)
  const limit = area ? 6 : 3;
  return Math.max(0.2, Math.min(limit, MAX_SIDE / longest));
}

/**
 * 읽은 줄의 높이(원본 사진 픽셀)로 글자가 너무 작은지 판단한다.
 * 시험 사진에서 줄 높이가 원본 기준 14px 미만이면 이름 오인식이 많았다 (real-a, *-small).
 */
export function textTooSmall(lines, orientedHeight, limit = 14) {
  const heights = lines.filter((line) => line.box && line.text.replace(/\s/gu, "").length >= 2)
    .map((line) => line.box.height * orientedHeight).sort((a, b) => a - b);
  if (!heights.length) return true;
  return heights[Math.floor(heights.length / 2)] < limit;
}

/** RGBA → 밝기(0~255). 색이 있는 칸도 글자 대비가 남도록 일반 밝기 공식을 쓴다. */
export function toGray(data, width, height) {
  const gray = new Float32Array(width * height);
  for (let index = 0, pixel = 0; pixel < gray.length; index += 4, pixel++) {
    gray[pixel] = 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];
  }
  return gray;
}

/** 아주 어두운/밝은 2%를 잘라 대비를 넓힌다 (기존 enhance 와 같은 방식). */
export function stretch(gray) {
  const histogram = new Uint32Array(256);
  for (const value of gray) histogram[Math.max(0, Math.min(255, value | 0))]++;
  const cut = gray.length * 0.02;
  let low = 0, high = 255, dark = histogram[0], light = histogram[255];
  while (low < 254 && dark < cut) dark += histogram[++low];
  while (high > 1 && light < cut) light += histogram[--high];
  const range = Math.max(high - low, 70);
  const out = new Float32Array(gray.length);
  for (let index = 0; index < gray.length; index++) out[index] = clamp((gray[index] - low) / range * 255);
  return out;
}

/**
 * 배경 평탄화: 주변 평균 밝기보다 얼마나 어두운지만 남긴다.
 * 노랑·하늘색 칸, 그림자처럼 넓게 깔린 배경은 흰색이 되고 글자 획만 검게 남는다.
 */
export function flatten(gray, width, height, radius, gain = 2.2) {
  const r = Math.max(4, Math.round(radius));
  const stride = width + 1;
  const integral = new Float64Array(stride * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += gray[y * width + x];
      integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + row;
    }
  }
  const out = new Float32Array(gray.length);
  for (let y = 0; y < height; y++) {
    const y1 = Math.max(0, y - r), y2 = Math.min(height, y + r + 1);
    for (let x = 0; x < width; x++) {
      const x1 = Math.max(0, x - r), x2 = Math.min(width, x + r + 1);
      const sum = integral[y2 * stride + x2] - integral[y1 * stride + x2] - integral[y2 * stride + x1] + integral[y1 * stride + x1];
      const mean = sum / ((x2 - x1) * (y2 - y1));
      out[y * width + x] = clamp(255 - (mean - gray[y * width + x]) * gain);
    }
  }
  return out;
}

/**
 * 흐린 사진용 선명하게 하기(언샤프 마스크): 주변 평균과의 차이를 키운다.
 * 첫 판독의 신뢰도가 낮을 때만 쓴다 — 선명한 사진에 쓰면 잡음 줄이 늘었다.
 */
export function sharpen(gray, width, height, radius, amount) {
  const r = Math.max(1, Math.round(radius));
  const stride = width + 1;
  const integral = new Float64Array(stride * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += gray[y * width + x];
      integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + row;
    }
  }
  const out = new Float32Array(gray.length);
  for (let y = 0; y < height; y++) {
    const y1 = Math.max(0, y - r), y2 = Math.min(height, y + r + 1);
    for (let x = 0; x < width; x++) {
      const x1 = Math.max(0, x - r), x2 = Math.min(width, x + r + 1);
      const mean = (integral[y2 * stride + x2] - integral[y1 * stride + x2] - integral[y2 * stride + x1] + integral[y1 * stride + x1]) / ((x2 - x1) * (y2 - y1));
      const value = gray[y * width + x];
      out[y * width + x] = clamp(value + amount * (value - mean));
    }
  }
  return out;
}

/** Otsu 방식으로 글자/배경을 나누는 기준값. 기울기 측정에만 쓴다. */
export function otsu(gray) {
  const histogram = new Uint32Array(256);
  for (const value of gray) histogram[Math.max(0, Math.min(255, value | 0))]++;
  let total = 0;
  for (let index = 0; index < 256; index++) total += index * histogram[index];
  let background = 0, weight = 0, best = -1, threshold = 128;
  for (let index = 0; index < 256; index++) {
    weight += histogram[index];
    if (!weight) continue;
    const rest = gray.length - weight;
    if (!rest) break;
    background += index * histogram[index];
    const between = weight * rest * (background / weight - (total - background) / rest) ** 2;
    if (between > best) { best = between; threshold = index; }
  }
  return threshold;
}

/**
 * 글자 줄이 가로로 가장 잘 정렬되는 각도(도)를 찾는다. 시계 방향으로 기운 사진이면 양수.
 * 어두운 점을 여러 각도로 투영해 줄마다 몰리는 정도(제곱합)가 가장 큰 각도를 고른다.
 */
export function estimateSkew(gray, width, height, maxAngle = 10) {
  const step = Math.max(1, Math.ceil(Math.max(width, height) / 700));
  const threshold = Math.min(otsu(gray), 170);
  const xs = [], ys = [];
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      if (gray[y * width + x] <= threshold) { xs.push(x); ys.push(y); }
    }
  }
  if (xs.length < 200 || xs.length > (width / step) * (height / step) * 0.45) return 0;
  const score = (degrees) => {
    const radians = degrees * Math.PI / 180, sin = Math.sin(radians), cos = Math.cos(radians);
    const bins = new Map();
    for (let index = 0; index < xs.length; index++) {
      const row = Math.round((ys[index] * cos - xs[index] * sin) / step);
      bins.set(row, (bins.get(row) ?? 0) + 1);
    }
    let sum = 0;
    for (const count of bins.values()) sum += count * count;
    return sum;
  };
  let best = 0, bestScore = score(0);
  for (let angle = -maxAngle; angle <= maxAngle; angle += 1) {
    const value = score(angle);
    if (value > bestScore) { best = angle; bestScore = value; }
  }
  for (let angle = best - 0.9; angle <= best + 0.9; angle += 0.3) {
    const value = score(angle);
    if (value > bestScore) { best = angle; bestScore = value; }
  }
  // 1도 미만은 돌리지 않는다 (돌리면 오히려 글자가 흐려진다)
  return Math.abs(best) < 1 ? 0 : Math.round(best * 10) / 10;
}

/**
 * OCR 이 준 상자(처리된 그림 좌표)를 원본 사진(돌린 방향 기준) 비율 좌표로 되돌린다.
 * transform: { crop:{x,y,width,height}, orientedWidth, orientedHeight, scale, pad, angle, canvasWidth, canvasHeight, innerWidth, innerHeight }
 */
export function mapBox(box, transform) {
  const { crop, orientedWidth, orientedHeight, scale, pad, angle, canvasWidth, canvasHeight, innerWidth, innerHeight } = transform;
  const radians = -(angle || 0) * Math.PI / 180, sin = Math.sin(radians), cos = Math.cos(radians);
  const corners = [[box.x0, box.y0], [box.x1, box.y0], [box.x0, box.y1], [box.x1, box.y1]].map(([x, y]) => {
    // 기울기 보정으로 돌린 그림 → 돌리기 전 그림
    const dx = x - canvasWidth / 2, dy = y - canvasHeight / 2;
    const ux = dx * cos - dy * sin + innerWidth / 2, uy = dx * sin + dy * cos + innerHeight / 2;
    return [(ux - pad) / scale + crop.x, (uy - pad) / scale + crop.y];
  });
  const left = Math.min(...corners.map((c) => c[0])), right = Math.max(...corners.map((c) => c[0]));
  const top = Math.min(...corners.map((c) => c[1])), bottom = Math.max(...corners.map((c) => c[1]));
  const x = Math.max(0, left / orientedWidth), y = Math.max(0, top / orientedHeight);
  return {
    x, y,
    width: Math.max(0, Math.min(1, right / orientedWidth) - x),
    height: Math.max(0, Math.min(1, bottom / orientedHeight) - y),
  };
}

function clamp(value) {
  return value < 0 ? 0 : value > 255 ? 255 : value;
}
