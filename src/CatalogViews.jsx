import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { comparisonHighlights, loadPillImages, duplicateIngredients, hasComparisonNotice, noticeIndexes, noticeTopics, searchProducts, sections, sourceCatalog, sourceDur, warnsAgainstSameIngredient, warningSuggestions } from "./catalog.js";
import { rules } from "./data.js";
import { getReviewedProductRule, isReviewedRule } from "./safety.js";
import { ChevronRight, Pill, TriangleAlert } from "lucide-react";

const PAGE_SIZE = 30;

function usePillImages() {
  const [images, setImages] = useState({});
  useEffect(() => {
    let alive = true;
    loadPillImages().then((items) => alive && setImages(items));
    return () => { alive = false; };
  }, []);
  return images;
}

function PillThumb({ pill, size = 18 }) {
  if (pill?.image) return <span aria-hidden="true" className="med-emoji med-photo">
    <img src={pill.image} alt="" loading="lazy" referrerPolicy="no-referrer" /></span>;
  return <span aria-hidden="true" className="med-emoji med-otc"><Pill size={size} strokeWidth={1.9} /></span>;
}
const reviewedCases = rules.filter(isReviewedRule);

export function ProductPicker({ index, onPick, label = "제품 검색", selectedCode, paginate = false }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const matches = useMemo(() => searchProducts(index, query), [index, query]);
  const images = usePillImages();
  const visible = (paginate || query.trim()) ? matches.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) : [];
  return <div className="catalog-picker">
    <label>
      {label}
      <input className="search" type="search" value={query} placeholder="제품명, 성분, 업체 또는 품목코드"
        onChange={(event) => { setQuery(event.target.value); setPage(0); }} />
    </label>
    {(paginate || query.trim()) && <p role="status" className="muted">검색 결과 {matches.length.toLocaleString("ko-KR")}개</p>}
    <div className="catalog-list">
      {visible.map((product) => (
        <button type="button" className={product.code === selectedCode ? "rule selected" : "rule"}
          key={product.code} onClick={() => onPick(product)} aria-pressed={product.code === selectedCode}>
          <PillThumb pill={images[product.code]} />
          <div><b>{product.name}</b><small>{product.ingredients} · {product.manufacturer}</small></div>
          <span aria-hidden="true"><ChevronRight size={18} /></span>
        </button>
      ))}
    </div>
    {visible.length > 0 && matches.length > PAGE_SIZE && (
      <div className="catalog-pages">
        <button type="button" className="outline" disabled={!page} onClick={() => setPage(page - 1)}>이전</button>
        <span>{page + 1} / {Math.ceil(matches.length / PAGE_SIZE)}</span>
        <button type="button" className="outline" disabled={(page + 1) * PAGE_SIZE >= matches.length} onClick={() => setPage(page + 1)}>다음</button>
      </div>
    )}
  </div>;
}

// 약 한 개의 상세: 제품 정보 → 쉬운 설명 → 주의사항 → 함께 먹기 → 보관 순서.
// 자료가 비어 있으면 "없다"고 그대로 보여 주고, 안전하다고 해석하지 않는다.
function SheetText({ text, empty }) {
  return text?.trim() ? <p className="source-text">{text}</p> : <p className="sheet-empty">{empty}</p>;
}

export function ProductDetails({ product, onAdd }) {
  if (!product) return <div className="info">제품을 선택하면 공식 설명을 볼 수 있어요.</div>;
  const official = product.sections;
  const label = Object.fromEntries(sections);
  const highlights = comparisonHighlights(product);
  const missing = "e약은요 자료에 이 항목이 없어요. 식약처 제품 상세의 허가 원문에서 확인하세요.";
  const cautionKeys = ["warnings", "precautions", "adverse_reactions"];
  const cautionCount = cautionKeys.filter((key) => official[key]?.trim()).length;
  const pill = usePillImages()[product.code];
  const pillRows = pill ? [
    ["모양", [pill.shape, pill.form].filter(Boolean).join(" · ")],
    ["색", [pill.colorFront, pill.colorBack].filter(Boolean).join(" / ")],
    ["새긴 글자", [pill.printFront && "앞 " + pill.printFront, pill.printBack && "뒤 " + pill.printBack].filter(Boolean).join(", ")],
    ["분할선", [pill.lineFront && "앞 " + pill.lineFront, pill.lineBack && "뒤 " + pill.lineBack].filter(Boolean).join(", ")],
    ["크기(mm)", [pill.lengthLong, pill.lengthShort, pill.thickness].some(Boolean)
      ? `장축 ${pill.lengthLong ?? "-"} · 단축 ${pill.lengthShort ?? "-"} · 두께 ${pill.thickness ?? "-"}` : ""],
    ["성상", pill.chart],
  ].filter(([, value]) => value) : [];
  return <article className="catalog-details product-sheet">
    <header className="sheet-head">
      {pill?.image ? null : <span className="sheet-photo" aria-hidden="true"><Pill size={30} strokeWidth={1.6} /></span>}
      <div>
        <h2>{product.name}</h2>
        <p className="muted">{product.manufacturer}</p>
      </div>
    </header>
    {pill?.image ? <figure className="sheet-figure">
      <img src={pill.image} alt={product.name + " 낱알 사진"} loading="lazy" referrerPolicy="no-referrer" />
      <figcaption>참고용 사진이에요. 모양이 같아도 함량이 다를 수 있으니 제품명과 함량을 함께 확인하세요.</figcaption>
    </figure> : <p className="sheet-photo-note">이 제품은 식약처 낱알식별 자료에 사진이 없어요.</p>}
    {onAdd && <button type="button" className="primary full" onClick={() => onAdd(product)}>이 제품으로 일정 추가</button>}

    <section className="sheet-section">
      <h3>제품 정보</h3>
      <dl>
        <div><dt>주성분</dt><dd>{product.ingredients}</dd></div>
        <div><dt>품목일련번호</dt><dd>{product.code}</dd></div>
        <div><dt>자료 수정일</dt><dd>{product.revisedOn || product.publishedOn || "확인 안 됨"}</dd></div>
      </dl>
    </section>

    {pillRows.length > 0 && <section className="sheet-section">
      <h3>생김새</h3>
      <dl>{pillRows.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>
    </section>}

    <section className="sheet-section">
      <h3>어떤 약인가요</h3>
      <h4>{label.efficacy}</h4>
      <SheetText text={official.efficacy} empty={missing} />
      <h4>{label.directions}</h4>
      <SheetText text={official.directions} empty={missing} />
      <p className="muted">실제 복용량과 시간은 처방 지시나 약 봉투를 따르세요.</p>
    </section>

    <section className="sheet-section">
      <h3>주의사항</h3>
      <p className="muted">{cautionCount ? `원문 ${cautionCount}개 항목이 있어요. 눌러서 펼쳐 보세요.` : "e약은요 자료에 주의사항이 없어요. 없다고 해서 안전하다는 뜻은 아니에요."}</p>
      {cautionKeys.map((key) => official[key]?.trim() && <details key={key}>
        <summary>{label[key]}</summary>
        <p className="source-text">{official[key]}</p>
      </details>)}
      {highlights.stopForSymptoms && <p className="sheet-flag">이상 증상이 나타나면 복용을 멈추고 의사나 약사와 상의하라고 안내해요.</p>}
    </section>

    <section className="sheet-section">
      <h3>함께 먹을 때</h3>
      {official.interactions?.trim() ? <>
        {(highlights.avoidTogether || highlights.checkFirst || highlights.avoidAlcohol) && <ul className="sheet-flags">
          {highlights.avoidTogether && <li>같이 먹지 말라고 안내된 약이나 음식이 있어요.</li>}
          {highlights.checkFirst && <li>함께 먹기 전에 의사나 약사에게 물어봐야 하는 약이 있어요.</li>}
          {highlights.avoidAlcohol && <li>먹는 동안 술을 마시지 말라고 안내해요.</li>}
        </ul>}
        <details open>
          <summary>{label.interactions} 원문</summary>
          <p className="source-text">{official.interactions}</p>
        </details>
      </> : <p className="sheet-empty">e약은요 자료에 함께 먹을 때의 주의 내용이 없어요. 함께 먹어도 된다는 뜻은 아니니 약사에게 확인하세요.</p>}
    </section>

    <section className="sheet-section">
      <h3>{label.storage}</h3>
      <SheetText text={official.storage} empty={missing} />
    </section>

    <footer className="sheet-source">
      <p>출처: 식약처 e약은요{pill ? ", 식약처 의약품 낱알식별 정보(사진 제작 약학정보원)" : ""}. 허가받은 사용상 주의사항 전체는 식약처 제품 상세에서 볼 수 있어요.</p>
      <a href={product.url} target="_blank" rel="noreferrer">식약처 제품 상세 원문 ↗</a>
    </footer>
  </article>;
}

export function CatalogPage({ index, selected, onSelect, onAdd, state, retry }) {
  return <>
    <div className="page-title"><h1>의약품 정보</h1>
      <p>식약처 e약은요에 실린 일반의약품의 제품명, 주성분, 사용법과 주의사항을 확인하세요.</p>
      <a href={sourceCatalog} target="_blank" rel="noreferrer">공식 데이터 출처 ↗</a>
    </div>
    <div className="columns catalog-columns">
      <section className="panel">
        <CatalogStatus state={state} retry={retry} />
        {state === "ready" && <ProductPicker index={index} selectedCode={selected?.code} paginate onPick={(product) => {
          onSelect(product);
          // 좁은 화면에서는 상세가 목록 아래에 있으니 바로 보이게 내려 줌
          if (window.matchMedia("(max-width: 1000px)").matches) requestAnimationFrame(() =>
            document.getElementById("product-sheet")?.scrollIntoView({
              behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }));
        }} />}
      </section>
      <section className="panel" id="product-sheet"><ProductDetails product={selected} onAdd={onAdd} /></section>
    </div>
  </>;
}

export function CatalogStatus({ state, retry }) {
  if (state === "loading") return <p role="status">공식 제품 목록을 불러오는 중이에요.</p>;
  if (state === "error") return <div className="info" role="status">제품 목록을 불러오지 못했어요.
    <button type="button" className="outline" onClick={retry}>다시 불러오기</button>
  </div>;
  return null;
}

function ProductWarning({ product, showGeneral = false }) {
  const highlights = comparisonHighlights(product);
  return <article className="warning plain-warning">
    <h3>{product.name}</h3>
    {showGeneral && noticeTopics.slice(0, 2).map(([key, label]) => product.sections[key]?.trim() && (
      <details className="compare-original" key={key}>
        <summary>{label} 원문 보기</summary>
        <p className="source-text">{product.sections[key]}</p>
      </details>
    ))}
    {!!product.sections.interactions?.trim() && <section className="plain-warning-section">
      <h4>같이 먹기 전에 확인하세요</h4>
      <ul>
        {highlights.avoidTogether && <li>같이 먹지 말라고 안내된 약이나 음식이 있어요.</li>}
        {highlights.checkFirst && <li>함께 먹기 전에 의사나 약사에게 물어봐야 하는 약이 있어요.</li>}
        {highlights.avoidAlcohol && <li>이 약을 먹는 동안 술을 마시지 말라고 안내해요.</li>}
        {!highlights.avoidTogether && !highlights.checkFirst && !highlights.avoidAlcohol &&
          <li>아래에서 이 약과 같이 먹을 때 주의할 약이나 음식을 확인하세요.</li>}
      </ul>
      <details className="compare-original">
        <summary>같이 먹을 때 주의할 약·음식 원문 보기</summary>
        <p className="source-text">{product.sections.interactions}</p>
      </details>
    </section>}
    {!!product.sections.adverse_reactions?.trim() && <section className="plain-warning-section">
      <h4>복용 후 몸에 이상이 생기면</h4>
      <p>{highlights.stopForSymptoms
        ? "아래 원문에 나오는 증상이 생기면 복용을 바로 멈추고 의사나 약사에게 문의하라고 안내해요."
        : "이 약을 먹은 뒤 생길 수 있는 증상과 대처 방법은 아래에서 확인할 수 있어요."}</p>
      <details className="compare-adverse">
        <summary>부작용 원문 보기</summary>
        <p className="source-text">{product.sections.adverse_reactions}</p>
      </details>
    </section>}
    <a href={product.url} target="_blank" rel="noreferrer">식약처 제품 상세 ↗</a>
  </article>;
}

function ProductWarningLibrary({ index }) {
  const [topic, setTopic] = useState("all");
  const [product, setProduct] = useState();
  const groups = useMemo(() => noticeIndexes(index), [index]);
  return <section className="panel">
    <h2>약 하나의 주의사항 찾아보기</h2>
    <p>식약처 e약은요에 실린 {groups.all.length.toLocaleString("ko-KR")}개 약에서, 알고 싶은 주의사항을 찾아볼 수 있어요.</p>
    <div className="columns catalog-columns">
      <div>
        <div className="compare">
          <label>보고 싶은 주의사항
            <select value={topic} onChange={(event) => {
              setTopic(event.target.value);
              setProduct(undefined);
            }}>
              {[["all", "전체"], ...noticeTopics].map(([key, label]) =>
                <option key={key} value={key}>{label} · {groups[key].length.toLocaleString("ko-KR")}개</option>)}
            </select>
          </label>
        </div>
        <ProductPicker key={topic} index={groups[topic]} label="주의사항을 볼 약 검색" onPick={setProduct}
          selectedCode={product?.code} paginate />
      </div>
      <div>
        {product ? <ProductWarning key={product.code} product={product} showGeneral />
          : <div className="info">목록에서 약을 고르면 식약처 주의사항을 볼 수 있어요.</div>}
      </div>
    </div>
    <a href={sourceCatalog} target="_blank" rel="noreferrer">식약처 e약은요 출처 ↗</a>
  </section>;
}

function OfficialWarnings({ products }) {
  const duplicates = duplicateIngredients(products);
  return <>
    {products.length > 1 && <div className="info">
      <h3>같은 성분이 들어 있나요?</h3>
      {duplicates.length ? <ul>{duplicates.map(({ ingredient, products: names }) => {
        const source = products.find((product) => names.has(product.code) && warnsAgainstSameIngredient(product, ingredient));
        return <li key={ingredient}><b>{ingredient}</b> · {[...names.values()].join(" · ")}
          {source && <p>{source.name}의 안내에는 이 성분이 든 다른 약과 같이 먹지 말라고 적혀 있어요.</p>}
        </li>;
      })}</ul>
        : <p>제품 정보에서 이름이 같은 성분을 찾지 못했어요.</p>}
    </div>}
    {products.filter(hasComparisonNotice).map((product) => <ProductWarning key={product.code} product={product} />)}
  </>;
}

function CompareProductSelect({ label, index, ordered, selected, onPick, suggestions }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const hasQuery = Boolean(query.trim());
  const matches = useMemo(() => {
    if (!open) return [];
    if (hasQuery) return searchProducts(index, query);
    return suggestions ? suggestions.map(({ product }) => product) : ordered;
  }, [open, hasQuery, index, query, ordered, suggestions]);
  const suggestedByCode = useMemo(() => new Map(suggestions?.map((entry) => [entry.product.code, entry])), [suggestions]);
  const choices = matches.slice(0, PAGE_SIZE);

  useEffect(() => {
    if (open && highlight >= 0) document.getElementById(id + "-" + highlight)?.scrollIntoView({ block: "nearest" });
  }, [open, highlight, id]);

  function close() {
    setOpen(false);
    setHighlight(-1);
    setQuery("");
  }

  function pick(product) {
    onPick(product);
    close();
  }

  function handleKey(event) {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        close();
      }
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      if (!open || !choices.length) return;
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setHighlight(highlight < 0 && direction < 0 ? choices.length - 1
        : Math.max(0, Math.min(choices.length - 1, highlight + direction)));
    } else if (event.key === "Enter" && open && choices.length) {
      event.preventDefault();
      pick(choices[highlight] ?? choices[0]);
    }
  }

  return <div className="compare-choice">
    <label htmlFor={id}>{label} 선택</label>
    <div className="compare-combobox">
      <input id={id} className="search" type="text" role="combobox" autoComplete="off"
        placeholder="약을 선택해 주세요" aria-expanded={open} aria-autocomplete="list"
        aria-controls={open ? id + "-options" : undefined}
        aria-activedescendant={open && choices[highlight] ? id + "-" + highlight : undefined}
        value={open ? query : selected?.name ?? ""}
        onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onBlur={close} onKeyDown={handleKey}
        onChange={(event) => { setQuery(event.target.value); setHighlight(-1); setOpen(true); }} />
      {selected && <button type="button" className="compare-clear" aria-label={label + " 선택 해제"}
        onClick={() => pick(undefined)}>×</button>}
      {open && <div className="compare-results">
        <p className="muted" role="status">
          {hasQuery ? (matches.length ? "검색 결과 " + matches.length.toLocaleString("ko-KR") + "개" : "일치하는 제품이 없어요.")
            : suggestions ? (choices.length ? "같이 먹기 전에 확인할 약" : "주의사항에서 찾은 약이 없어요. 직접 검색할 수 있어요.")
              : "제품명, 성분 또는 품목코드로 검색할 수 있어요."}
        </p>
        <ul id={id + "-options"} role="listbox" aria-label={label + " 검색 결과"}>
          {choices.map((product, position) => {
            const suggestion = suggestedByCode.get(product.code);
            return <li id={id + "-" + position} role="option" aria-selected={position === highlight}
              key={product.code} onPointerDown={(event) => event.preventDefault()} onClick={() => pick(product)}>
              <b>{product.name}</b>
              <small>{product.manufacturer} · {product.code}</small>
              {suggestion && <small className="compare-evidence">주의사항에 나온 성분 · {suggestion.ingredient}</small>}
            </li>;
          })}
        </ul>
        {matches.length > choices.length && <p className="muted">상위 {PAGE_SIZE}개를 표시합니다. 검색어로 범위를 좁혀 보세요.</p>}
      </div>}
    </div>
    {!open && !selected && suggestions && <div className="compare-recommendations">
      <p className="muted">{suggestions.length ? "같이 먹기 전에 확인할 약"
        : "주의사항에서 찾은 약이 없어요. 직접 검색할 수 있어요."}</p>
      {suggestions.slice(0, 3).map(({ product, ingredient }) => (
        <button key={product.code} type="button" className="rule" onClick={() => pick(product)}>
          <span aria-hidden="true"><TriangleAlert size={18} /></span>
          <span><b>{product.name}</b><small>주의사항에 나온 성분 · {ingredient}</small></span>
          <span aria-hidden="true"><ChevronRight size={18} /></span>
        </button>
      ))}
    </div>}
  </div>;
}

function RuleInformation({ rule }) {
  return <>
    <p><b>이런 경우에 해당해요</b> · {rule.condition}</p>
    {rule.ingredientA && rule.ingredientB && <div className="rule-reason">
      <p><b>관련 성분</b> · {rule.ingredientA} + {rule.ingredientB}</p>
      <p><b>왜 주의하나요?</b> · {rule.mechanism}</p>
      <p><b>가능한 영향</b> · {rule.possibleConsequence}</p>
      <p><b>확인할 일</b> · {rule.action}</p>
    </div>}
    <p>{rule.detail}</p>
    <small>출처 확인일 {rule.reviewedOn}</small><br />
    <a href={rule.source} target="_blank" rel="noreferrer">{rule.sourceName} 원문 ↗</a>
    {rule.supportingSource && <p><a href={rule.supportingSource} target="_blank" rel="noreferrer">미국 FDA 관련 설명 ↗</a></p>}
  </>;
}

export function ComparePage({ index, activeProducts, unlinked, state, retry }) {
  const [first, setFirst] = useState();
  const [second, setSecond] = useState();
  const compareHeading = useRef(null);
  const compareIndex = useMemo(() => index.filter(({ product }) => hasComparisonNotice(product)), [index]);
  const ordered = useMemo(() => index.map(({ product }) => product)
    .sort((a, b) => a.name.localeCompare(b.name, "ko")), [index]);
  const productsByRuleId = useMemo(() => new Map(ordered.map((product) => ["otc-" + product.code, product])), [ordered]);
  const suggestions = useMemo(() => first ? warningSuggestions(compareIndex, first) : undefined, [compareIndex, first]);
  const activeWithNotices = activeProducts.filter(hasComparisonNotice);
  const same = first && first.code === second?.code;
  const selected = [first, same ? undefined : second].filter(Boolean);
  const evidence = suggestions?.find(({ product }) => product.code === second?.code);
  const reviewed = getReviewedProductRule(first, second, reviewedCases);
  return <>
    <div className="page-title"><h1>함께 먹기</h1>
      <p>약 이름을 검색해 같은 성분이나 같이 먹을 때 주의할 점을 확인하세요.</p>
    </div>
    <section className="panel">
      <h2 ref={compareHeading} tabIndex={-1}>제품 두 가지 비교</h2>
      <CatalogStatus state={state} retry={retry} />
      {state === "ready" && <div className="compare catalog-compare">
        <CompareProductSelect label="첫 번째 약" index={index} ordered={ordered} selected={first} onPick={setFirst} />
        <CompareProductSelect label="두 번째 약" index={index} ordered={ordered} selected={second} onPick={setSecond} suggestions={suggestions} />
      </div>}
      {same && <p role="status">주성분을 비교하려면 서로 다른 제품을 골라 주세요.</p>}
      {reviewed && <article className="warning" aria-label="선택한 약 조합의 주의사항">
        <h3>{reviewed.title}</h3>
        <RuleInformation rule={reviewed} />
      </article>}
      {first && second && !same && !reviewed && <p className="info">이 두 제품의 검토 완료된 상호작용 규칙은 아직 없어요. 안전하다는 뜻은 아닙니다. 아래 제품별 원문과 식약처 조합 조회를 확인하세요.</p>}
      {evidence && <p className="info">{evidence.source.name}의 주의사항에 ‘{evidence.ingredient}’이 나와요.</p>}
      {selected.length > 0 && <OfficialWarnings products={selected} />}
      <div className="info">
        <p>두 약을 같이 먹으면 안 되는 조합인지 식약처에서 확인할 수 있어요.</p>
        <a href={sourceDur} target="_blank" rel="noreferrer">식약처에서 약 조합 확인하기 ↗</a>
      </div>
    </section>
    {state === "ready" && <ProductWarningLibrary index={index} />}
    <section className="panel">
      <h2>출처를 확인한 주의 사례 {reviewedCases.length}건</h2>
      {reviewedCases.map((rule) => {
        const firstProduct = productsByRuleId.get(rule.a);
        const secondProduct = productsByRuleId.get(rule.b);
        return <details key={rule.a + ":" + rule.b} className="compare-original">
          <summary>{rule.title}</summary>
          <RuleInformation rule={rule} />
          {firstProduct && secondProduct && <button type="button" className="outline" onClick={() => {
            setFirst(firstProduct);
            setSecond(secondProduct);
            compareHeading.current?.focus();
          }}>이 두 약 비교하기</button>}
        </details>;
      })}
    </section>
    <section className="panel">
      <h2>복용 중인 공식 제품</h2>
      {unlinked > 0 && <p>{unlinked}개 일정은 공식 제품을 확인해야 비교할 수 있어요.</p>}
      {activeProducts.length > activeWithNotices.length && <p>{activeProducts.length - activeWithNotices.length}개 제품은 이상반응과 약·음식 주의 원문이 비어 있어요. 전체 정보는 의약품 정보에서 확인할 수 있어요.</p>}
      {activeProducts.length > 0 && <OfficialWarnings products={activeProducts} />}
      {!activeProducts.length && <div className="info">공식 제품으로 등록한 활성 일정이 없어요.</div>}
    </section>
  </>;
}
