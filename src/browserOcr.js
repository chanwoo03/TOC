import workerAsset from "tesseract.js/dist/worker.min.js?url";
import coreAsset from "tesseract.js-core/tesseract-core-lstm.wasm.js?url";
import { Capacitor } from "@capacitor/core";
import { receiptCrop } from "./ocrCrop.js";
import { chooseScale, estimateSkew, flatten, mapBox, sharpen, stretch, textTooSmall, toGray } from "./ocrPreprocess.js";

// Android 빌드는 자산을 묶을 때 kor.traineddata.gz 를 풀어서 kor.traineddata 로 넣는다
// (APK 목록으로 확인: kor 1.57MB.gz → 2.21MB). 그래서 앱 안에서는 압축 안 된 파일을 읽는다.
const plainLanguageFiles = Capacitor.isNativePlatform();

const MAX_PIXELS = 48_000_000;

async function loadImage(file) {
  const preview = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = preview;
    await image.decode();
    if (image.width * image.height > MAX_PIXELS) throw new Error("image-size");
    return image;
  } finally {
    URL.revokeObjectURL(preview);
  }
}

function canvas2d(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("image-canvas");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  return [canvas, context];
}

/** 돌리기·자르기·확대 → 회색조 두 벌(대비만 / 배경 평탄화) → 기울기 보정. */
function prepare(image, quarterTurns, area) {
  const orientedWidth = quarterTurns % 2 ? image.height : image.width;
  const orientedHeight = quarterTurns % 2 ? image.width : image.height;
  const source = receiptCrop(image.width, image.height, quarterTurns, area);
  const crop = area ? {
    x: Math.floor(area.x * orientedWidth), y: Math.floor(area.y * orientedHeight),
    width: quarterTurns % 2 ? source.height : source.width, height: quarterTurns % 2 ? source.width : source.height,
  } : { x: 0, y: 0, width: orientedWidth, height: orientedHeight };
  const scale = chooseScale(crop.width, crop.height, Boolean(area));
  const pad = area ? 16 : 0;
  const width = Math.round(source.width * scale), height = Math.round(source.height * scale);
  const innerWidth = Math.round(crop.width * scale) + pad * 2, innerHeight = Math.round(crop.height * scale) + pad * 2;
  const [base, context] = canvas2d(innerWidth, innerHeight);
  context.translate(innerWidth / 2, innerHeight / 2);
  context.rotate(quarterTurns * Math.PI / 2);
  context.imageSmoothingQuality = "high";
  context.drawImage(image, source.x, source.y, source.width, source.height, -width / 2, -height / 2, width, height);

  const pixels = context.getImageData(0, 0, innerWidth, innerHeight);
  const gray = toGray(pixels.data, innerWidth, innerHeight);
  const plain = stretch(gray);
  const radius = Math.max(20, Math.min(70, Math.round(Math.max(innerWidth, innerHeight) / 30)));
  const flat = flatten(gray, innerWidth, innerHeight, radius);
  const sharpRadius = Math.max(3, Math.round(scale * 2));
  const skew = estimateSkew(flat, innerWidth, innerHeight);
  const angle = -skew; // 기운 반대 방향으로 돌린다

  const render = (values) => {
    const image = new ImageData(innerWidth, innerHeight);
    for (let index = 0; index < values.length; index++) {
      const value = values[index];
      image.data[index * 4] = image.data[index * 4 + 1] = image.data[index * 4 + 2] = value;
      image.data[index * 4 + 3] = 255;
    }
    const [flatCanvas, flatContext] = canvas2d(innerWidth, innerHeight);
    flatContext.putImageData(image, 0, 0);
    if (!angle) return flatCanvas;
    const radians = angle * Math.PI / 180;
    const outWidth = Math.ceil(Math.abs(innerWidth * Math.cos(radians)) + Math.abs(innerHeight * Math.sin(radians)));
    const outHeight = Math.ceil(Math.abs(innerWidth * Math.sin(radians)) + Math.abs(innerHeight * Math.cos(radians)));
    const [turned, turnedContext] = canvas2d(outWidth, outHeight);
    turnedContext.translate(outWidth / 2, outHeight / 2);
    turnedContext.rotate(radians);
    turnedContext.imageSmoothingQuality = "high";
    turnedContext.drawImage(flatCanvas, -innerWidth / 2, -innerHeight / 2);
    return turned;
  };
  const enhanced = render(flat);
  // 흐린 사진용 두 번째 판독 그림: 선명하게 한 뒤 배경 평탄화 (필요할 때만 만든다)
  const sharpened = () => render(flatten(sharpen(gray, innerWidth, innerHeight, sharpRadius, 2.5), innerWidth, innerHeight, radius));
  const transform = {
    crop, orientedWidth, orientedHeight, scale, pad, angle,
    canvasWidth: enhanced.width, canvasHeight: enhanced.height, innerWidth, innerHeight,
  };
  return {
    enhanced, sharpened, plain: () => render(plain), transform,
    meta: {
      skew, scale: Math.round(scale * 100) / 100,
      sourceWidth: crop.width, sourceHeight: crop.height,
    },
  };
}

function meaningfulText(text) {
  return (text.match(/[가-힣]{2,}|[A-Za-z]{3,}|\d+(?:mg|ml|정|회)/giu) ?? [])
    .reduce((length, word) => length + word.length, 0);
}

/** Tesseract 결과 → 줄 목록(글자, 신뢰도, 단어별 신뢰도, 원본 사진 위 위치). */
function linesOf(data, transform) {
  return (data.blocks ?? []).flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines.map((line) => ({
    text: line.text.replace(/\s+$/u, ""),
    confidence: Math.round(line.confidence),
    // 단어 위치(처리된 그림 좌표)는 열 경계(큰 빈칸)를 찾는 데만 쓴다
    words: line.words.map((word) => ({ text: word.text, confidence: Math.round(word.confidence),
      x0: word.bbox.x0, x1: word.bbox.x1, y0: word.bbox.y0, y1: word.bbox.y1, box: mapBox(word.bbox, transform) })),
    box: mapBox(line.bbox, transform),
  })))).filter((line) => line.text);
}

export async function recognizeReceipt(file, quarterTurns, signal, onProgress, { area, alternate } = {}) {
  const image = await loadImage(file);
  const prepared = prepare(image, quarterTurns, area);
  const { createWorker, OEM, PSM } = await import("tesseract.js");
  signal.throwIfAborted();
  let stopped, worker;
  const abort = new Promise((_, reject) => { stopped = () => reject(signal.reason); });
  signal.addEventListener("abort", stopped, { once: true });
  let reportError;
  const failure = new Promise((_, reject) => { reportError = reject; });
  const timer = setTimeout(() => reportError(new Error("ocr-timeout")), 120_000);
  const absolute = (asset) => new URL(asset, document.baseURI).href;
  // 한국어만 쓰면 영문 잡음 줄(rrr are 등)이 줄었다. "다른 방식으로 다시 읽기"는 한국어+영어로 읽는다.
  const languages = alternate ? ["kor", "eng"] : ["kor"];
  const loading = createWorker(languages, OEM.LSTM_ONLY, {
    workerPath: absolute(workerAsset),
    corePath: absolute(coreAsset),
    langPath: absolute(import.meta.env.BASE_URL + "ocr/"),
    gzip: !plainLanguageFiles,
    workerBlobURL: false,
    errorHandler: reportError,
    logger: ({ status, progress }) => onProgress(status === "recognizing text" ? progress : null),
  });
  const race = (operation) => Promise.race([operation, abort, failure]);
  const started = performance.now();
  try {
    worker = await race(loading);
    const read = async (input, mode) => {
      await race(worker.setParameters({ tessedit_pageseg_mode: mode, preserve_interword_spaces: "1" }));
      const { data } = await race(worker.recognize(input, { rotateAuto: false }, { text: true, blocks: true }));
      return { text: data.text, confidence: Math.round(data.confidence), lines: linesOf(data, prepared.transform), psm: mode };
    };
    let result;
    if (alternate) {
      // 다른 방식: 한국어+영어, 페이지 자동 나누기(PSM 3). 영문·숫자가 많은 봉투나 열 구분이 독특한 봉투용.
      result = await read(prepared.enhanced, PSM.AUTO);
    } else {
      // 표가 있는 봉투는 '여러 크기의 한 열'(PSM 4)로 읽을 때 약 이름과 복용 지시가 함께 잘 읽혔다.
      const first = await read(prepared.enhanced, area ? PSM.SINGLE_BLOCK : PSM.SINGLE_COLUMN);
      const firstLength = meaningfulText(first.text);
      result = first;
      if (firstLength < (area ? 8 : 18) || first.confidence < 55) {
        // 신뢰도가 낮으면 흐린 사진일 가능성이 커서, 선명하게 한 그림으로 한 번 더 읽고 나은 쪽을 고른다.
        const retry = await read(prepared.sharpened(), area ? PSM.SINGLE_BLOCK : PSM.SINGLE_COLUMN);
        const retryLength = meaningfulText(retry.text);
        const score = (value, length) => (value.confidence + 25) * Math.sqrt(length);
        if (retry.text.trim() && score(retry, retryLength) > score(first, firstLength)) result = retry;
      }
    }
    return {
      ...result,
      meta: { ...prepared.meta, lowResolution: textTooSmall(result.lines, prepared.transform.orientedHeight), languages, area: Boolean(area), alternate: Boolean(alternate), ms: Math.round(performance.now() - started) },
    };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", stopped);
    if (worker) await worker.terminate();
    else void loading.then((late) => late.terminate()).catch(() => {});
  }
}
