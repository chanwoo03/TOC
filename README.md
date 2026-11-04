# MediSync AI / TOC

이 저장소의 **최상위 폴더**가 React 데모의 작업 폴더입니다. VS Code에서 `C:\Study\inhatc_c\TOC`를 열고 `src`를 수정합니다.

## 폴더

- `src/`, `index.html`, `package.json`: React 웹 데모 소스
- `docs/`: GitHub Pages 발표 페이지와 PPT 다운로드 파일
- `의약품_데이터/`: 일반의약품 100개 데이터 설계와 ERD 설명
- 프로젝트 제안서·소프트웨어 설계서 `.docx`: 기획 문서
- `.vscode/sftp.json`: Cafe24 데모 업로드 설정. Git에는 올리지 않음

원본 e약은요 CSV와 이전 버전·중복 파일은 저장소 밖 `C:\Study\inhatc_c\TOC_보관_20261104`에 보관합니다.

## 실행

```powershell
cd C:\Study\inhatc_c\TOC
npm install
npm run dev
```

웹 배포용 파일을 다시 만들 때는 `npm run build`를 실행합니다. 결과는 `dist/`에 생성되며 GitHub에는 올리지 않습니다. GitHub Pages 발표 사이트는 별개로 `docs/`에 있습니다.

현재 웹 데모의 OCR과 주의정보는 시범 기능입니다. 일반약 100개 데이터는 앱에 아직 연결되지 않았고 상호작용 후보도 검증 전입니다.
