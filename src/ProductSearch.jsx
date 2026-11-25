import React, { useEffect, useState } from "react";

export default function ProductSearch({ label, products, selectedId, onSelect, placeholder }) {
  const selected = products.find((product) => product.id === selectedId);
  const [query, setQuery] = useState(selected?.name || "");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (selectedId) setQuery(selected?.name || "");
  }, [selectedId, selected?.name]);

  const term = query.trim().toLocaleLowerCase("ko");
  const matches = products
    .filter((product) =>
      !term || [product.name, product.ingredient, product.officialName, product.itemId]
        .some((value) => String(value || "").toLocaleLowerCase("ko").includes(term)),
    )
    .slice(0, 12);

  const choose = (product) => {
    onSelect(product.id);
    setQuery(product.name);
    setOpen(false);
  };

  return (
    <div
      className="medicine-search"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <label>
        {label}
        <input
          type="search"
          autoComplete="off"
          value={query}
          placeholder={placeholder}
          aria-expanded={open}
          onFocus={(event) => {
            setOpen(true);
            event.target.select();
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            onSelect("");
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
            if (event.key === "Enter" && open && matches.length) {
              event.preventDefault();
              choose(matches[0]);
            }
          }}
        />
      </label>
      {open && (
        <div className="medicine-search-results">
          {matches.length ? matches.map((product) => (
            <button type="button" key={product.id} onClick={() => choose(product)}>
              <strong>{product.name}</strong>
              <small>{product.ingredient} · {product.type}{product.itemId ? ` · ${product.itemId}` : ""}</small>
            </button>
          )) : <p>검색 결과가 없어요. 제품명을 확인하거나 내 약에서 직접 등록하세요.</p>}
        </div>
      )}
    </div>
  );
}
