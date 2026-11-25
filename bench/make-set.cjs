// 합성 약 봉투 시험 사진 + 정답 만들기 (정답을 아는 사진으로 CER/WER를 재기 위함)
const { chromium } = require('playwright');
const fs = require('fs');
const sharp = (() => { try { return require('sharp'); } catch { return null; } })();
const sets = {
  s1: { title: '조제약 복약안내', meds: [
    ['타이레놀정500밀리그람', '백색의 장방형 필름코팅정', '[해열진통제]', '1정씩 3회 5일분'],
    ['지르텍정', '백색의 장방형 필름코팅정', '[항히스타민제]', '1정씩 1회 5일분'],
    ['뮤테란캡슐200밀리그램', '청색 하양색의 경질캡슐', '[진해거담제]', '1캡슐씩 3회 5일분'],
    ['레보프라이드정', '백색의 원형 정제', '[위장운동조절제]', '1정씩 3회 5일분'],
  ]},
  s2: { title: '복약안내', meds: [
    ['베포타스틴정10밀리그램', '흰색의 원형 필름코팅정', '[항알레르기약]', '1정씩 2회 7일분'],
    ['에페리손정50밀리그램', '흰색의 원형 당의정', '[근이완제]', '1정씩 3회 7일분'],
    ['파모티딘정20밀리그램', '연한 황색의 원형 정제', '[H2 차단제]', '0.5정씩 2회 7일분'],
    ['아세틸시스테인캡슐200밀리그램', '흰색의 경질캡슐', '[진해거담제]', '1캡슐씩 3회 7일분'],
    ['프레드니솔론정5밀리그램', '흰색의 원형 정제', '[부신피질호르몬제]', '2정씩 1회 3일분'],
  ]},
};
function html(set, colored) {
  const rows = set.meds.map(([n, d, e, i], k) => `<tr style="background:${colored ? ['#fff6cf','#dfeefa','#fff6cf','#e4f3e2','#dfeefa'][k] : '#fff'}">
    <td class="ph"><div class="pill"></div><div class="pill"></div></td>
    <td><b>${n}</b><br><span>${d}</span></td><td>${e}</td><td class="i">${i}</td></tr>`).join('');
  return `<html><body style="margin:0;background:#fff;font-family:'Noto Sans CJK KR'">
  <div style="width:1200px;padding:28px 34px;box-sizing:border-box">
  <div style="background:${colored ? '#a8d89a' : '#fff'};border:2px solid #555;padding:14px 20px;font-size:38px;font-weight:700">${set.title}</div>
  <table style="width:100%;border-collapse:collapse;margin-top:16px;font-size:24px">
  <tr style="background:#ddd"><th>약품사진</th><th>약품명</th><th>복약안내</th><th>투약량/횟수/일수</th></tr>${rows}</table></div>
  <style>td,th{border-bottom:2px solid #888;padding:10px 12px;text-align:left;vertical-align:top}
  td span{font-size:20px;color:#333}.ph{width:150px;background:#c9d7e0}.pill{display:inline-block;width:52px;height:30px;border-radius:15px;background:#f4f4f4;margin:6px;border:1px solid #999}
  .i{white-space:nowrap}</style></body></html>`;
}
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 });
  const gt = {};
  for (const [key, set] of Object.entries(sets)) for (const colored of [false, true]) {
    await p.setContent(html(set, colored)); await p.waitForTimeout(200);
    const h = await p.evaluate(() => document.body.scrollHeight);
    const name = `${key}${colored ? 'c' : ''}`;
    await p.screenshot({ path: `/home/claude/ms/bench/set/${name}-src.png`, clip: { x: 0, y: 0, width: 1200, height: h } });
    gt[name] = { title: set.title, meds: set.meds.map(([name, description, effect, instruction]) => ({ name, description, effect, instruction })) };
  }
  fs.writeFileSync('/home/claude/ms/bench/set/gt-synth.json', JSON.stringify(gt, null, 1));
  await b.close();
})();
