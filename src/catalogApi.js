// 서버가 준비되면 DB의 제품·성분·원문을 사용합니다.
// Vite 개발 서버에는 PHP가 없으므로 개발 중에는 기존 JSON 목록을 사용합니다.
export async function fetchOtcCatalog(fallbackCatalog) {
  const response = await fetch('./api/products.php', {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Catalog API: ${response.status}`);

  const payload = await response.json();
  if (!Array.isArray(payload.products) || payload.products.length === 0) {
    throw new Error('Catalog API returned no products');
  }

  const fallbackById = new Map(fallbackCatalog.map((item) => [item.itemId, item]));
  return payload.products.map((row) => {
    if (typeof row.itemId !== 'string' || !Array.isArray(row.ingredients)) {
      throw new Error('Catalog API returned an invalid product');
    }
    const old = fallbackById.get(row.itemId);
    const ingredientNames = row.ingredients.filter((name) => typeof name === 'string');
    return {
      id: `otc-${row.itemId}`,
      itemId: row.itemId,
      name: row.displayName || old?.name || row.officialName,
      officialName: row.officialName || old?.officialName || row.displayName,
      ingredient: ingredientNames.join(', '),
      ingredientNames,
      type: old?.type || '일반약',
      manufacturer: row.manufacturer || old?.manufacturer || '',
      // 현재 DB에는 원문 수정일 열이 없어 기존 카탈로그의 표시값만 사용합니다.
      sourceModified: old?.sourceModified || '확인 필요',
      source: row.sourceUrl || old?.source || '',
      notice: {
        itemId: row.itemId,
        cautionOriginal: row.notice?.cautionOriginal || '',
        adverseOriginal: row.notice?.adverseOriginal || '',
        modifiedOn: old?.sourceModified || '확인 필요',
      },
      emoji: '💊',
      guide: old?.guide || [
        '제품 설명서와 처방 지시를 확인하세요.',
        '복용량이나 간격을 임의로 바꾸지 마세요.',
        '판단이 어렵다면 약사나 의료진에게 문의하세요.',
      ],
    };
  });
}
