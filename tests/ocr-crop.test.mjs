import assert from "node:assert/strict";
import { test } from "node:test";
import { receiptCrop } from "../src/ocrCrop.js";

test("OCR crop follows the visible region after any quarter turn", () => {
  const area = { x: 0.25, y: 0, width: 0.5, height: 0.25 };
  assert.deepEqual(receiptCrop(800, 400, 0, area), { x: 200, y: 0, width: 400, height: 100 });
  assert.deepEqual(receiptCrop(800, 400, 1, area), { x: 0, y: 100, width: 200, height: 200 });
  assert.deepEqual(receiptCrop(800, 400, 2, area), { x: 200, y: 300, width: 400, height: 100 });
  assert.deepEqual(receiptCrop(800, 400, 3, area), { x: 600, y: 100, width: 200, height: 200 });
  assert.deepEqual(receiptCrop(800, 400, 3, null), { x: 0, y: 0, width: 800, height: 400 });
});
