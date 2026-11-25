"use strict";
const slides = [
  "MediSync AI",
  "웹 데모를 만들었고, 앱은 시험 단계입니다",
  "앱이 판단하지 않고, 확인할 것을 보여 주는 흐름",
  "계획은 두 번 크게 바뀌었습니다",
  "개발 언어 · 환경",
  "지금은 웹 화면 하나를 웹과 앱 시험판에 씁니다",
  "프로젝트 구조: 폴더마다 맡은 일이 다릅니다",
  "앱은 실무에서 많이 쓰는 방식으로 다시 만들 계획입니다",
  "홈: 다음에 먹을 약을 가장 크게",
  "약 정보: 식약처 e약은요를 설명서 한 장으로",
  "사진: 품목일련번호로 공공데이터를 이어 붙였습니다",
  "함께 먹기: 근거가 확인된 것만 경고합니다",
  "약 봉투 OCR: 연결 성공과 정확도는 다릅니다",
  ".gz 파일 하나 때문에 두 번 실패했습니다",
  "알림: 코드보다 휴대폰 권한이 문제였습니다",
  "디자인: 폰에서 깨지던 화면을 약국 봉투처럼",
  "변경 이력: 지금까지는 main에 바로 올렸습니다",
  "아직 부족한 점",
  "다음 단계와 배운 점",
  "감사합니다"
];
const image = document.getElementById("slide"), counter = document.getElementById("counter");
const title = document.getElementById("slide-title"), previous = document.getElementById("previous"), next = document.getElementById("next");
const viewer = document.getElementById("viewer"), list = document.getElementById("slide-list");
const listButton = document.getElementById("toggle-list"), fullscreen = document.getElementById("fullscreen");
const errorMessage = document.getElementById("image-error"), notice = document.getElementById("notice");
let current = 0, touchStart = null;
const path = i => "slides-20261127/slide-" + String(i + 1).padStart(2, "0") + ".png";
function fromHash() { const m = location.hash.match(/^#slide-(\d+)$/); return m ? Math.min(slides.length - 1, Math.max(0, Number(m[1]) - 1)) : 0; }
function show(index, updateHash = true) {
  current = Math.min(slides.length - 1, Math.max(0, index)); errorMessage.hidden = true;
  image.src = path(current); image.alt = (current + 1) + "장: " + slides[current];
  counter.textContent = (current + 1) + " / " + slides.length; title.textContent = slides[current];
  previous.disabled = current === 0; next.disabled = current === slides.length - 1;
  list.querySelectorAll("button").forEach((b, i) => b.setAttribute("aria-current", String(i === current)));
  if (updateHash) history.replaceState(null, "", "#slide-" + (current + 1));
  if (current + 1 < slides.length) { const preload = new Image(); preload.src = path(current + 1); }
}
slides.forEach((name, i) => {
  const button = document.createElement("button"); button.type = "button"; button.setAttribute("aria-label", (i + 1) + "장: " + name);
  const thumb = document.createElement("img"); thumb.src = path(i); thumb.alt = ""; thumb.loading = "lazy"; thumb.width = 1280; thumb.height = 720;
  const text = document.createElement("span"); text.textContent = String(i + 1).padStart(2, "0") + "  " + name;
  button.append(thumb, text); button.addEventListener("click", () => show(i)); list.append(button);
});
previous.addEventListener("click", () => show(current - 1)); next.addEventListener("click", () => show(current + 1));
listButton.addEventListener("click", () => { list.hidden = !list.hidden; listButton.setAttribute("aria-expanded", String(!list.hidden)); });
image.addEventListener("error", () => { errorMessage.hidden = false; });
window.addEventListener("hashchange", () => show(fromHash(), false));
document.addEventListener("keydown", event => {
  if (event.altKey || event.ctrlKey || event.metaKey || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
  const actions = { ArrowRight: () => show(current + 1), ArrowLeft: () => show(current - 1), Home: () => show(0), End: () => show(slides.length - 1) };
  if (actions[event.key]) { event.preventDefault(); actions[event.key](); }
});
const stage = document.getElementById("stage");
stage.addEventListener("touchstart", e => { touchStart = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null; }, { passive: true });
stage.addEventListener("touchend", e => { if (!touchStart) return; const dx = e.changedTouches[0].clientX - touchStart.x, dy = e.changedTouches[0].clientY - touchStart.y; if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) show(current + (dx < 0 ? 1 : -1)); touchStart = null; }, { passive: true });
if (!document.fullscreenEnabled || !viewer.requestFullscreen) fullscreen.hidden = true;
fullscreen.addEventListener("click", async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await viewer.requestFullscreen(); notice.textContent = ""; } catch { notice.textContent = "이 브라우저에서 전체 화면을 열 수 없습니다."; } }); document.addEventListener("fullscreenchange", () => { fullscreen.textContent = document.fullscreenElement ? "전체 화면 종료" : "전체 화면"; });
show(fromHash(), false);
