import workerAsset from "tesseract.js/dist/worker.min.js?url";
import coreAsset from "tesseract.js-core/tesseract-core-lstm.wasm.js?url";
import { Capacitor } from "@capacitor/core";
import { receiptCrop } from "../src/ocrCrop.js";

// Android 빌드는 자산을 묶을 때 kor.traineddata.gz 를 풀어서 kor.traineddata 로 넣는다
// (APK 목록으로 확인: kor 1.57MB.gz → 2.21MB). 그래서 앱 안에서는 압축 안 된 파일을 읽는다.
const plainLanguageFiles = Capacitor.isNativePlatform();

const MAX_PIXELS = 48_000_000;
const MAX_SIDE = 2450;

async function prepare(file, quarterTurns, area) {
  const preview = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = preview;
    await image.decode();
    if (image.width * image.height > MAX_PIXELS) throw new Error("image-size");
    const source = receiptCrop(image.width, image.height, quarterTurns, area);
    const scale = Math.min(area ? 3 : 2, MAX_SIDE / Math.max(source.width, source.height));
    const width = Math.round(source.width * scale), height = Math.round(source.height * scale);
    const canvas = document.createElement("canvas");
    [canvas.width, canvas.height] = quarterTurns % 2 ? [height, width] : [width, height];
    if (area) { canvas.width += 24; canvas.height += 24; }
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("image-canvas");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(quarterTurns * Math.PI / 2);
    context.imageSmoothingQuality = "high";
    context.drawImage(image, source.x, source.y, source.width, source.height, -width / 2, -height / 2, width, height);
    return canvas;
  } finally {
    URL.revokeObjectURL(preview);
  }
}

function enhance(source) {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(source, 0, 0);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const histogram = new Uint32Array(256);
  const pixels = image.data;
  for (let index = 0; index < pixels.length; index += 4) {
    const value = Math.round(0.299 * pixels[index] + 0.587 * pixels[index + 1] + 0.114 * pixels[index + 2]);
    pixels[index] = value;
    histogram[value]++;
  }
  const threshold = pixels.length / 4 * 0.02;
  let low = 0, high = 255, dark = histogram[0], light = histogram[255];
  while (low < 254 && dark < threshold) dark += histogram[++low];
  while (high > 1 && light < threshold) light += histogram[--high];
  const range = Math.max(high - low, 70);
  for (let index = 0; index < pixels.length; index += 4) {
    const value = (pixels[index] - low) / range * 255;
    pixels[index] = pixels[index + 1] = pixels[index + 2] = value;
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

function meaningfulText(result) {
  return (result.text.match(/[가-힣]{2,}|[A-Za-z]{3,}|\d+(?:mg|ml|정|회)/giu) ?? [])
    .reduce((length, word) => length + word.length, 0);
}

export async function recognizeReceipt(file, quarterTurns, signal, onProgress, { area, alternate } = {}) {
  const image = await prepare(file, quarterTurns, area);
  const { createWorker, OEM, PSM } = await import("tesseract.js");
  signal.throwIfAborted();
  let stopped, worker;
  const abort = new Promise((_, reject) => { stopped = () => reject(signal.reason); });
  signal.addEventListener("abort", stopped, { once: true });
  let reportError;
  const failure = new Promise((_, reject) => { reportError = reject; });
  const timer = setTimeout(() => reportError(new Error("ocr-timeout")), 90_000);
  const absolute = (asset) => new URL(asset, document.baseURI).href;
  const loading = createWorker(["kor", "eng"], OEM.LSTM_ONLY, {
    workerPath: absolute(workerAsset),
    corePath: absolute(coreAsset),
    langPath: absolute(import.meta.env.BASE_URL + "ocr/"),
    gzip: !plainLanguageFiles,
    workerBlobURL: false,
    errorHandler: reportError,
    logger: ({ status, progress }) => onProgress(status === "recognizing text" ? progress : null),
  });
  const race = (operation) => Promise.race([operation, abort, failure]);
  try {
    worker = await race(loading);
    const read = async (input, mode, rotateAuto) => {
      await race(worker.setParameters({ tessedit_pageseg_mode: mode, preserve_interword_spaces: "1" }));
      return (await race(worker.recognize(input, { rotateAuto }))).data;
    };
    if (alternate) return await read(enhance(image), PSM.SPARSE_TEXT, false);
    const first = await read(enhance(image), area ? PSM.SINGLE_BLOCK : PSM.AUTO, !area);
    const firstLength = meaningfulText(first);
    if (firstLength >= (area ? 8 : 18) && first.confidence >= 65) return first;
    const retry = await read(image, PSM.SPARSE_TEXT, false);
    const retryLength = meaningfulText(retry);
    if (!retry.text.trim()) return first;
    if (!firstLength) return retryLength || !first.text.trim() ? retry : first;
    const score = (result, length) => (result.confidence + 25) * Math.sqrt(length);
    return score(retry, retryLength) > score(first, firstLength) ? retry : first;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", stopped);
    if (worker) await worker.terminate();
    else void loading.then((late) => late.terminate()).catch(() => {});
  }
}
