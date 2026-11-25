"""식약처 '의약품 낱알식별 정보' OpenAPI에서 낱알 사진 주소와 식별 정보를 받아
현재 앱의 e약은요 제품(public/data/easy-drug.json)과 품목일련번호로 맞춘 뒤
public/data/pill-images.json 으로 저장한다.

준비
  1. 공공데이터포털(data.go.kr)에서 '식품의약품안전처_의약품 낱알식별 정보' 활용신청 (자동승인)
  2. TOC 폴더의 .env 파일에 한 줄 추가:  DATA_GO_KR_KEY=발급받은_일반_인증키
     (.env 는 Git·FTP에 올리지 않는다. 이 스크립트는 키를 화면에 출력하지 않는다.)
실행 (TOC 폴더에서)
  python scripts/fetch-pill-images.py

자료: https://www.data.go.kr/data/15057639/openapi.do  (이용허락범위 제한 없음)
사진의 원 제작처는 약학정보원(응답 항목 IMG_REGIST_TS = 약학정보원 이미지 생성일)이다.
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "public" / "data" / "easy-drug.json"
OUTPUT = ROOT / "public" / "data" / "pill-images.json"
ENDPOINT = "https://apis.data.go.kr/1471000/MdcinGrnIdntfcInfoService03/getMdcinGrnIdntfcInfoList03"
PAGE_SIZE = 100


def read_key():
    key = os.environ.get("DATA_GO_KR_KEY", "").strip()
    env = ROOT / ".env"
    if not key and env.exists():
        for line in env.read_text(encoding="utf-8-sig").splitlines():
            name, _, value = line.partition("=")
            if name.strip() == "DATA_GO_KR_KEY":
                key = value.strip().strip('"').strip("'")
    if not key:
        sys.exit("DATA_GO_KR_KEY 가 없어요. TOC/.env 에 DATA_GO_KR_KEY=인증키 를 넣어 주세요.")
    # 포털의 'Encoding' 키를 넣은 경우 한 번 풀어서 이중 인코딩을 막는다.
    return urllib.parse.unquote(key) if "%" in key else key


def fetch_page(key, page):
    query = urllib.parse.urlencode({"serviceKey": key, "pageNo": page, "numOfRows": PAGE_SIZE, "type": "json"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(ENDPOINT + "?" + query, timeout=30) as response:
                raw = response.read().decode("utf-8")
            break
        except Exception as error:  # 네트워크 오류는 잠시 뒤 다시 시도
            if attempt == 2:
                sys.exit(f"{page}쪽을 받지 못했어요: {type(error).__name__}")
            time.sleep(2 + attempt * 3)
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        sys.exit("JSON 응답이 아니에요. 인증키가 맞는지, 활용신청이 승인됐는지 확인해 주세요. 응답 앞부분: " + raw[:120].replace(key, "***"))
    header = data.get("header", {})
    if header.get("resultCode") not in (None, "00"):
        sys.exit(f"API 오류 {header.get('resultCode')}: {header.get('resultMsg')}")
    body = data.get("body", {})
    items = body.get("items") or []
    if isinstance(items, dict):
        items = items.get("item") or []
    if isinstance(items, dict):
        items = [items]
    return items, int(body.get("totalCount") or 0)


def text(value):
    value = (value or "").strip() if isinstance(value, str) else value
    return value or None


def main():
    key = read_key()
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    codes = {str(product["code"]) for product in catalog["products"]}
    first, total = fetch_page(key, 1)
    pages = -(-total // PAGE_SIZE)
    print(f"낱알식별 전체 {total:,}건, {pages}쪽을 받습니다.")
    rows = list(first)
    for page in range(2, pages + 1):
        items, _ = fetch_page(key, page)
        rows.extend(items)
        if page % 20 == 0:
            print(f"  {page}/{pages}쪽")
        time.sleep(0.15)

    matched = {}
    for row in rows:
        code = str(row.get("ITEM_SEQ") or "").strip()
        if code not in codes or not text(row.get("ITEM_IMAGE")):
            continue
        if code in matched:  # 같은 품목이 여러 줄이면 첫 줄만 사용
            continue
        entry = {
            "image": text(row.get("ITEM_IMAGE")),
            "chart": text(row.get("CHART")),
            "shape": text(row.get("DRUG_SHAPE")),
            "colorFront": text(row.get("COLOR_CLASS1")),
            "colorBack": text(row.get("COLOR_CLASS2")),
            "printFront": text(row.get("PRINT_FRONT")),
            "printBack": text(row.get("PRINT_BACK")),
            "lineFront": text(row.get("LINE_FRONT")),
            "lineBack": text(row.get("LINE_BACK")),
            "form": text(row.get("FORM_CODE_NAME")),
            "lengthLong": text(row.get("LENG_LONG")),
            "lengthShort": text(row.get("LENG_SHORT")),
            "thickness": text(row.get("THICK")),
            "imageDate": text(row.get("IMG_REGIST_TS")),
        }
        # 빈 항목은 빼서 파일 크기를 줄인다 (화면은 없는 항목을 건너뜀)
        matched[code] = {name: value for name, value in entry.items() if value}

    result = {
        "source": "식품의약품안전처 의약품 낱알식별 정보 (https://www.data.go.kr/data/15057639/openapi.do)",
        "fetchedOn": date.today().isoformat(),
        "totalRows": len(rows),
        "catalogProducts": len(codes),
        "matchedProducts": len(matched),
        "items": dict(sorted(matched.items())),
    }
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"e약은요 {len(codes):,}개 중 사진이 있는 {len(matched):,}개를 {OUTPUT.relative_to(ROOT)} 에 저장했어요.")


if __name__ == "__main__":
    main()
