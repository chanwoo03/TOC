import assert from "node:assert/strict";
import { test } from "node:test";
import { chooseScale, estimateSkew, flatten, mapBox, textTooSmall } from "../src/ocrPreprocess.js";

function stripes(width, height, degrees) {
  // 흰 바탕에 기울어진 글자 줄(검은 띠)을 그린 회색조 배열
  const gray = new Float32Array(width * height).fill(255);
  const slope = Math.tan(degrees * Math.PI / 180);
  for (let row = 40; row < height - 40; row += 36) {
    for (let x = 30; x < width - 30; x++) {
      if ((x >> 3) % 3 === 2) continue; // 글자 사이 빈틈
      const y0 = Math.round(row + x * slope);
      for (let y = y0; y < y0 + 10; y++) if (y >= 0 && y < height) gray[y * width + x] = 20;
    }
  }
  return gray;
}

test("estimates text line skew within one degree and ignores straight text", () => {
  assert.equal(estimateSkew(stripes(600, 500, 0), 600, 500), 0);
  assert.ok(Math.abs(estimateSkew(stripes(600, 500, 6), 600, 500) - 6) <= 1);
  assert.ok(Math.abs(estimateSkew(stripes(600, 500, -4), 600, 500) + 4) <= 1);
});

test("flatten turns a coloured background white but keeps dark strokes", () => {
  const width = 80, height = 40, gray = new Float32Array(width * height).fill(200); // 노란 칸 정도의 밝기
  for (let x = 30; x < 34; x++) for (let y = 10; y < 30; y++) gray[y * width + x] = 60;
  const out = flatten(gray, width, height, 16);
  assert.ok(out[5 * width + 5] > 240);
  assert.ok(out[20 * width + 31] < 80);
});

test("scale grows small crops and shrinks large photos", () => {
  assert.equal(chooseScale(100, 300, true), 6);
  assert.equal(chooseScale(428, 276, false), 3);
  assert.ok(chooseScale(4000, 3000, false) < 1);
});

test("maps OCR boxes back to the original photo after crop, scale and deskew", () => {
  const transform = { crop: { x: 100, y: 50, width: 200, height: 100 }, orientedWidth: 1000, orientedHeight: 500,
    scale: 2, pad: 16, angle: 0, canvasWidth: 432, canvasHeight: 232, innerWidth: 432, innerHeight: 232 };
  const box = mapBox({ x0: 16, y0: 16, x1: 216, y1: 66 }, transform);
  for (const [key, value] of Object.entries({ x: 0.1, y: 0.1, width: 0.1, height: 0.05 })) assert.ok(Math.abs(box[key] - value) < 1e-9, key);
  const turned = mapBox({ x0: 16, y0: 16, x1: 216, y1: 66 }, { ...transform, angle: 5 });
  assert.ok(Math.abs(turned.x - 0.1) < 0.03 && Math.abs(turned.y - 0.1) < 0.05);
});

test("flags text that is too small in the original photo", () => {
  const line = (height) => ({ text: "레보프라이드정", box: { x: 0, y: 0, width: 0.2, height } });
  assert.equal(textTooSmall([line(0.02), line(0.025)], 300), true);  // 6~7px
  assert.equal(textTooSmall([line(0.04), line(0.05)], 900), false);  // 36~45px
  assert.equal(textTooSmall([], 900), true);
});
