"""Convert an MFDS e약은요 XLSX snapshot to the web catalog without rewriting its text."""

import argparse
from datetime import date, datetime
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import re

from openpyxl import load_workbook

SECTIONS = {
    "효능은 무엇입니까?": "efficacy",
    "어떻게 사용합니까?": "directions",
    "사용하기 전에 반드시 알아야 할 내용은 무엇입니까?": "warnings",
    "사용상 주의사항은 무엇입니까?": "precautions",
    "사용하는 동안 주의해야 할 약 또는 음식은 무엇입니까?": "interactions",
    "어떤 이상반응이 나타날 수 있습니까?": "adverse_reactions",
    "어떻게 보관해야 합니까?": "storage",
}
IDENTITY = ("품목일련번호", "제품명", "업체명", "주성분", "공개일자", "수정일자")
SOURCE = "https://nedrug.mfds.go.kr/pbp/CCBBB01/getItemDetail?itemSeq="


def catalog(raw, expected):
    workbook = load_workbook(BytesIO(raw), read_only=True)
    try:
        sheet = workbook.active
        sheet.reset_dimensions()
        rows = sheet.values
        header = [str(value or "").strip().replace("무엇입니가?", "무엇입니까?") for value in next(rows)]
        header = ["품목일련번호" if value == "품목기준코드" else value for value in header]
        columns = {
            source: target for field, target in SECTIONS.items()
            for source in header if source.endswith(field)
        }
        if set(columns.values()) != set(SECTIONS.values()) or len(columns) + len(IDENTITY) != len(header) or not set(IDENTITY).issubset(header):
            raise ValueError("Unexpected e약은요 columns")
        products, seen = [], set()
        for number, row in enumerate(rows, 2):
            if all(value in (None, "") for value in row):
                continue
            fields = dict(zip(header, row, strict=True))
            code = str(fields["품목일련번호"]).strip()
            identity = [fields[key] for key in ("제품명", "업체명", "주성분")]
            sections = {target: fields[source] or None for source, target in columns.items()}
            if not re.fullmatch(r"\d{9}", code) or code in seen or any(not isinstance(value, str) or not value.strip() for value in identity):
                raise ValueError(f"Invalid code or product in row {number}")
            if any(value is not None and not isinstance(value, str) for value in sections.values()):
                raise ValueError(f"Non-text product label in row {number}")

            def iso(value):
                return value.date().isoformat() if isinstance(value, datetime) else date.fromisoformat(str(value)).isoformat()

            name, maker, ingredients = identity
            seen.add(code)
            products.append(dict(code=code, name=name, manufacturer=maker, ingredients=ingredients,
                                 publishedOn=iso(fields["공개일자"]), revisedOn=iso(fields["수정일자"]),
                                 sections=sections, url=SOURCE + code))
        if len(products) != expected:
            raise ValueError(f"Expected {expected} records, found {len(products)}")
        return {"source": "식품의약품안전처 e약은요", "sha256": sha256(raw).hexdigest(), "products": products}
    finally:
        workbook.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--expected-count", type=int, required=True)
    parser.add_argument("--output", type=Path, default=Path("public/data/easy-drug.json"))
    args = parser.parse_args()
    result = catalog(args.source.read_bytes(), args.expected_count)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf8")
    print(f"Validated and exported {len(result['products'])} records.")
