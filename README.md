# MediSync AI / TOC

이 저장소의 최상위 폴더가 React 웹 앱의 작업 폴더입니다. 현재 PC에서는 `C:\Study\TOC`를 엽니다.

## 폴더

- `src/`, `index.html`, `package.json`: React 웹 데모 소스
- `public/data/easy-drug.json`: 식약처 e약은요 공식 원본 4,729품목의 웹용 스냅샷
- `docs/`: GitHub Pages 발표 페이지와 PPT 다운로드 파일
- `의약품_데이터/`: 일반의약품 100개 데이터 설계와 ERD 설명
- 프로젝트 제안서·소프트웨어 설계서 `.docx`: 기획 문서
- `.vscode/sftp.json`: Cafe24 데모 업로드 설정. Git에는 올리지 않음

원본 e약은요 CSV와 이전 버전·중복 파일은 저장소 밖 `C:\Study\inhatc_c\TOC_보관_20261104`에 보관합니다.

## 실행

```powershell
cd C:\Study\TOC
npm ci
npm test
npm run dev
```

웹 배포용 파일을 다시 만들 때는 `npm run build`를 실행합니다. 결과는 `dist/`에 생성됩니다. 이 PC의 기존 출력물을 보존하며 새 결과를 만들려면 `npm run build -- --outDir dist-web-next --emptyOutDir false`를 사용합니다. GitHub Pages 발표 사이트는 별개로 `docs/`에 있습니다.

## 공식 자료와 OCR

- 제품 정보는 품목코드, 제품명, 업체, 주성분, 공개·수정일과 효능, 사용법, 경고, 주의사항, 약·음식 주의, 이상반응, 보관법을 원본 그대로 보여줍니다. 함께 먹기 화면은 원본에 같은 이름으로 기록된 주성분과 제품별 주의 원문을 표시합니다. 실제 품목 조합의 병용금기는 화면의 식약처 조회로 연결됩니다. [e약은요 공식 자료](https://www.data.go.kr/data/15075057/openapi.do)
- 웹 앱은 한국어·영어 OCR 모델을 같은 사이트에서 다운로드합니다. 사진과 인식 텍스트는 브라우저에서만 처리합니다. 선택한 제품과 사용자가 확인한 시간만 복약 일정에 저장합니다.
- 재배포 전에 `dist/`의 `assets/`, `data/`, `ocr/`를 포함한 전체 출력을 준비합니다. 공개 경로는 `/medisync-demo/`입니다. 기존 브라우저 저장 데이터는 같은 주소에서 유지됩니다. HTTP와 HTTPS는 서로 다른 브라우저 저장소를 사용합니다.

공식 스냅샷을 교체할 때는 웹 폴더에서 Python과 `openpyxl`을 사용합니다. 공식 XLSX의 확인된 총 건수를 지정하고 테스트의 스냅샷 기대 건수를 함께 갱신합니다.

```powershell
python -m pip install openpyxl
python scripts/export-easy-drug.py <공식_XLSX> --expected-count 4729
npm test
npm run build
```
