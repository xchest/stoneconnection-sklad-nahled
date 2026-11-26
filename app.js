const COLOR_META = [
  { key: 'bila', label: 'Bílá', hex: '#f5f5f4' },
  { key: 'bezova', label: 'Béžová', hex: '#e5d3b3' },
  { key: 'zluta', label: 'Žlutá', hex: '#eab308' },
  { key: 'zlata', label: 'Zlatá', hex: '#ca8a04' },
  { key: 'oranzova', label: 'Oranžová', hex: '#ea580c' },
  { key: 'cervena', label: 'Červená', hex: '#b91c1c' },
  { key: 'ruzova', label: 'Růžová', hex: '#e18d96' },
  { key: 'fialova', label: 'Fialová', hex: '#7e5a7b' },
  { key: 'modra', label: 'Modrá', hex: '#3b6ea5' },
  { key: 'zelena', label: 'Zelená', hex: '#3f6a4f' },
  { key: 'hneda', label: 'Hnědá', hex: '#6f4e37' },
  { key: 'seda', label: 'Šedá', hex: '#78716c' },
  { key: 'cerna', label: 'Černá', hex: '#1c1917' },
];

const COLOR_MAP = new Map(COLOR_META.map((c) => [c.key, c]));

const USAGE_META = [
  { key: 'interior', label: 'Interiér' },
  { key: 'monument_exterior', label: 'Pomníky & dlažby' },
  { key: 'versatile', label: 'Univerzální' },
];

const USAGE_MAP = new Map(USAGE_META.map((u) => [u.key, u.label]));

const TYPE_ORDER = ['zula', 'kvarcit', 'mramor', 'onyx', 'travertin', 'vapenec', 'keramika', 'ostatni'];
const TYPE_LABELS = {
  zula: 'Žula',
  kvarcit: 'Kvarcit',
  mramor: 'Mramor',
  onyx: 'Onyx',
  travertin: 'Travertin',
  vapenec: 'Vápenec',
  keramika: 'Keramika',
  ostatni: 'Ostatní',
};

const state = {
  data: null,
  usageBySlug: new Map(),
  view: 'materials', // 'materials' | 'table'
  groupBy: 'none',   // 'none' | 'type' | 'color'
  selectedColors: new Set(),
  selectedTypes: new Set(),
  selectedUsage: new Set(),
  selectedWarehouses: new Set(),
  selectedSurfaces: new Set(),
  selectedThicknesses: new Set(),
  search: '',
  photoOnly: false,
  expandedTableRows: new Set(),
  lightboxItems: [],
  lightboxIndex: 0,
};

const el = {
  filterColors: document.getElementById('filter-colors'),
  filterTypes: document.getElementById('filter-types'),
  filterUsage: document.getElementById('filter-usage'),
  filterWarehouses: document.getElementById('filter-warehouses'),
  filterSurfaces: document.getElementById('filter-surfaces'),
  filterThicknesses: document.getElementById('filter-thicknesses'),
  sidebar: document.getElementById('filter-sidebar'),
  filterBackdrop: document.getElementById('filter-backdrop'),
  mobileFilterBtn: document.getElementById('mobile-filter-btn'),
  mobileFilterCount: document.getElementById('mobile-filter-count'),
  drawerClose: document.getElementById('drawer-close'),
  drawerApply: document.getElementById('drawer-apply'),
  searchInput: document.getElementById('search-input'),
  groupBy: document.getElementById('group-by'),
  photoOnlyToggle: document.getElementById('photo-only-toggle'),
  activeBar: document.getElementById('active-bar'),
  resetBtn: document.getElementById('reset-filters'),
  emptyReset: document.getElementById('empty-reset'),
  resultsSummary: document.getElementById('results-summary'),
  galleryRoot: document.getElementById('gallery-root'),
  tableRoot: document.getElementById('table-root'),
  emptyState: document.getElementById('empty-state'),
  footerMeta: document.getElementById('footer-meta'),
  modal: document.getElementById('detail-modal'),
  modalBody: document.getElementById('modal-body'),
  modalClose: document.getElementById('modal-close'),
  lightbox: document.getElementById('lightbox'),
  lbStage: document.getElementById('lb-stage'),
  lbClose: document.getElementById('lb-close'),
  lbPrev: document.getElementById('lb-prev'),
  lbNext: document.getElementById('lb-next'),
  toast: document.getElementById('toast'),
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function foldText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function formatNumber(n, decimals = 0) {
  return new Intl.NumberFormat('cs-CZ', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

function formatDateCs(iso) {
  if (!iso) return 'neuvedeno';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('cs-CZ', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}

function showToast(msg) {
  el.toast.textContent = msg;
  el.toast.hidden = false;
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    el.toast.hidden = true;
  }, 2400);
}

async function copyText(text, successMsg) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMsg);
  } catch {
    showToast('Kopírování se nezdařilo — zkopírujte prosím ručně.');
  }
}

function populateSidebarFilters(data) {
  const colorCounts = new Map();
  const typeCounts = new Map();
  const usageCounts = new Map();
  const whCounts = new Map();
  const surfaceCounts = new Map();
  const thicknessCounts = new Map();

  for (const m of data.materials) {
    m.colors.forEach((c) => colorCounts.set(c.key, (colorCounts.get(c.key) || 0) + 1));
    typeCounts.set(m.categoryKey, (typeCounts.get(m.categoryKey) || 0) + 1);
    const uKey = m.usageSegment || 'interior';
    usageCounts.set(uKey, (usageCounts.get(uKey) || 0) + 1);
    m.warehouses.forEach((w) => whCounts.set(w, (whCounts.get(w) || 0) + 1));
    m.surfaces.forEach((s) => surfaceCounts.set(s, (surfaceCounts.get(s) || 0) + 1));
    m.thicknesses.forEach((t) => thicknessCounts.set(String(t), (thicknessCounts.get(String(t)) || 0) + 1));
  }

  el.filterColors.innerHTML = COLOR_META.filter((c) => colorCounts.has(c.key))
    .map(
      (c) => `
      <label class="check-option">
        <input type="checkbox" data-filter="color" value="${escapeHtml(c.key)}">
        <span class="swatch-dot" style="background:${escapeHtml(c.hex)}"></span>
        <span class="check-label">${escapeHtml(c.label)}</span>
        <span class="check-count">${colorCounts.get(c.key)}</span>
      </label>`
    )
    .join('');

  el.filterTypes.innerHTML = TYPE_ORDER.filter((k) => typeCounts.has(k))
    .map(
      (k) => `
      <label class="check-option">
        <input type="checkbox" data-filter="type" value="${escapeHtml(k)}">
        <span class="check-label">${escapeHtml(TYPE_LABELS[k] || k)}</span>
        <span class="check-count">${typeCounts.get(k)}</span>
      </label>`
    )
    .join('');

  if (el.filterUsage) {
    el.filterUsage.innerHTML = USAGE_META.filter((u) => usageCounts.has(u.key))
      .map(
        (u) => `
        <label class="check-option">
          <input type="checkbox" data-filter="usage" value="${escapeHtml(u.key)}">
          <span class="check-label">${escapeHtml(u.label)}</span>
          <span class="check-count">${usageCounts.get(u.key)}</span>
        </label>`
      )
      .join('');
  }

  el.filterWarehouses.innerHTML = [...whCounts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'cs'))
    .map(
      ([w, cnt]) => `
      <label class="check-option">
        <input type="checkbox" data-filter="warehouse" value="${escapeHtml(w)}">
        <span class="check-label">${escapeHtml(w)}</span>
        <span class="check-count">${cnt}</span>
      </label>`
    )
    .join('');

  el.filterSurfaces.innerHTML = [...surfaceCounts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'cs'))
    .map(
      ([s, cnt]) => `
      <label class="check-option">
        <input type="checkbox" data-filter="surface" value="${escapeHtml(s)}">
        <span class="check-label">${escapeHtml(s)}</span>
        <span class="check-count">${cnt}</span>
      </label>`
    )
    .join('');

  el.filterThicknesses.innerHTML = [...thicknessCounts.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(
      ([t, cnt]) => `
      <label class="check-option">
        <input type="checkbox" data-filter="thickness" value="${escapeHtml(t)}">
        <span class="check-label">${escapeHtml(t)} cm</span>
        <span class="check-count">${cnt}</span>
      </label>`
    )
    .join('');
}

function getFilteredMaterials() {
  const q = foldText(state.search.trim());
  return state.data.materials.filter((m) => {
    if (state.selectedColors.size > 0 && !m.colors.some((c) => state.selectedColors.has(c.key))) return false;
    if (state.selectedTypes.size > 0 && !state.selectedTypes.has(m.categoryKey)) return false;
    if (state.selectedUsage.size > 0 && !state.selectedUsage.has(m.usageSegment || 'interior')) return false;
    if (state.selectedWarehouses.size > 0 && !m.warehouses.some((w) => state.selectedWarehouses.has(w))) return false;
    if (state.selectedSurfaces.size > 0 && !m.surfaces.some((s) => state.selectedSurfaces.has(s))) return false;
    if (state.selectedThicknesses.size > 0 && !m.thicknesses.some((t) => state.selectedThicknesses.has(String(t)))) return false;
    if (state.photoOnly && !m.cardImage) return false;
    if (q) {
      const inName = foldText(m.name).includes(q);
      const inType = foldText(m.categoryLabel).includes(q);
      const inBlock = m.blocks.some((b) => foldText(b.blockNumber).includes(q));
      if (!inName && !inType && !inBlock) return false;
    }
    return true;
  });
}

function getFilteredBlocks() {
  const q = foldText(state.search.trim());
  return state.data.blocks.filter((b) => {
    if (state.selectedColors.size > 0 && !b.colors.some((c) => state.selectedColors.has(c))) return false;
    if (state.selectedTypes.size > 0 && !state.selectedTypes.has(b.categoryKey)) return false;
    const bUsage = state.usageBySlug.get(b.materialSlug) || 'interior';
    if (state.selectedUsage.size > 0 && !state.selectedUsage.has(bUsage)) return false;
    if (state.selectedWarehouses.size > 0 && !b.warehouses.some((w) => state.selectedWarehouses.has(w))) return false;
    if (state.selectedSurfaces.size > 0 && !b.surfaces.some((s) => state.selectedSurfaces.has(s))) return false;
    if (state.selectedThicknesses.size > 0 && !b.thicknesses.some((t) => state.selectedThicknesses.has(String(t)))) return false;
    if (state.photoOnly && !b.cardImage) return false;
    if (q) {
      const inName = foldText(b.materialName).includes(q);
      const inBlock = foldText(b.blockNumber).includes(q);
      const inType = foldText(b.categoryLabel).includes(q);
      if (!inName && !inBlock && !inType) return false;
    }
    return true;
  });
}

function renderActiveChips() {
  const chips = [];
  for (const c of state.selectedColors) chips.push({ kind: 'color', value: c, label: COLOR_MAP.get(c)?.label || c });
  for (const t of state.selectedTypes) chips.push({ kind: 'type', value: t, label: TYPE_LABELS[t] || t });
  for (const u of state.selectedUsage) chips.push({ kind: 'usage', value: u, label: USAGE_MAP.get(u) || u });
  for (const w of state.selectedWarehouses) chips.push({ kind: 'warehouse', value: w, label: w });
  for (const s of state.selectedSurfaces) chips.push({ kind: 'surface', value: s, label: s });
  for (const th of state.selectedThicknesses) chips.push({ kind: 'thickness', value: th, label: `${th} cm` });
  if (state.search.trim()) chips.push({ kind: 'search', value: state.search, label: `„${state.search.trim()}“` });
  if (state.photoOnly) chips.push({ kind: 'photoOnly', value: '1', label: 'Jen s fotkou' });

  el.resetBtn.hidden = chips.length === 0;
  el.activeBar.hidden = chips.length === 0;
  el.activeChips = el.activeBar;
  el.activeBar.innerHTML = chips
    .map(
      (ch) => `
      <button type="button" class="active-chip" data-remove-kind="${escapeHtml(ch.kind)}" data-remove-val="${escapeHtml(ch.value)}">
        <span>${escapeHtml(ch.label)}</span>
        <span aria-hidden="true">×</span>
      </button>`
    )
    .join('');
}

function renderCardImage(imageUrl, alt) {
  if (!imageUrl) {
    return `<div class="card-placeholder"><span>Bez fotografie</span></div>`;
  }
  return `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async">`;
}

function formatThicknessSummary(thicknesses) {
  if (!thicknesses || !thicknesses.length) return '';
  if (thicknesses.length === 1) return `${thicknesses[0]} cm`;
  return `${thicknesses[0]}–${thicknesses[thicknesses.length - 1]} cm`;
}

function formatBlocksBadge(count) {
  if (!count || count <= 1) return '';
  const unit = count <= 4 ? 'bloky' : 'bloků';
  return `<span class="card-blocks-badge">${count} ${unit}</span>`;
}

function materialCardHtml(m) {
  const thickText = formatThicknessSummary(m.thicknesses);
  const sizeText = m.maxLengthCm && m.maxHeightCm ? `až ${m.maxLengthCm}×${m.maxHeightCm} cm` : '';
  const subParts = [m.categoryLabel, thickText, sizeText].filter(Boolean).join(' · ');
  const loupeHtml = m.detailSwatchUrl
    ? `<span class="card-detail-loupe" title="Detail struktury zblízka"><img src="${escapeHtml(m.detailSwatchUrl)}" alt="" loading="lazy" decoding="async"></span>`
    : '';
  const blocksBadge = formatBlocksBadge(m.blockCount);
  const usageSeg = m.usageSegment || 'interior';
  const usageLabel = m.usageLabel || USAGE_MAP.get(usageSeg) || 'Interiér';

  return `
    <article class="stone-card">
      <button type="button" class="card-media-btn" data-open-material="${escapeHtml(m.slug)}" aria-label="${escapeHtml(m.name)}">
        ${renderCardImage(m.cardImage, m.name)}
        ${blocksBadge}
        ${loupeHtml}
      </button>
      <div class="card-body">
        <div class="card-usage-row">
          <span class="card-usage-pill usage-${escapeHtml(usageSeg)}">${escapeHtml(usageLabel)}</span>
        </div>
        <h3 class="card-title">${escapeHtml(m.name)}</h3>
        <div class="card-sub">${escapeHtml(subParts)}</div>
        <button type="button" class="card-detail-btn" data-open-material="${escapeHtml(m.slug)}">Detail</button>
      </div>
    </article>`;
}

function renderGroupedGallery(items) {
  el.galleryRoot.hidden = false;
  el.tableRoot.hidden = true;

  if (state.groupBy === 'none') {
    el.galleryRoot.innerHTML = `<div class="gallery-grid">${items.map(materialCardHtml).join('')}</div>`;
    return;
  }

  const sections = [];
  if (state.groupBy === 'type') {
    for (const k of TYPE_ORDER) {
      const subset = items.filter((item) => item.categoryKey === k);
      if (subset.length) sections.push({ title: TYPE_LABELS[k] || k, items: subset });
    }
  } else if (state.groupBy === 'color') {
    for (const cm of COLOR_META) {
      const subset = items.filter((item) => item.colors[0]?.key === cm.key);
      if (subset.length) sections.push({ title: cm.label, hex: cm.hex, items: subset });
    }
  }

  el.galleryRoot.innerHTML = sections
    .map(
      (sec) => `
      <section class="group-section">
        <h3 class="group-heading">
          ${sec.hex ? `<span class="swatch-dot" style="background:${escapeHtml(sec.hex)};width:15px;height:15px;"></span>` : ''}
          ${escapeHtml(sec.title)}
          <span>(${sec.items.length})</span>
        </h3>
        <div class="gallery-grid">
          ${sec.items.map(materialCardHtml).join('')}
        </div>
      </section>`
    )
    .join('');
}

function renderWarehouseBadges(warehouses) {
  return warehouses
    .map((w) => {
      const cls = w === 'Praha' ? 'wh-praha' : 'wh-roznov';
      return `<span class="wh-badge ${cls}">${escapeHtml(w)}</span>`;
    })
    .join(' ');
}

function renderTable(blocks) {
  el.galleryRoot.hidden = true;
  el.tableRoot.hidden = false;

  const rowsHtml = blocks
    .map((b) => {
      const isExpanded = state.expandedTableRows.has(b.id);
      const thumb = b.cardImage
        ? `<img src="${escapeHtml(b.cardImage)}" alt="${escapeHtml(b.materialName)}" class="table-thumb" loading="lazy">`
        : `<div class="table-thumb"></div>`;

      const slabRows = b.slabs
        .map(
          (s) => `
          <tr>
            <td>${formatNumber(s.length)} × ${formatNumber(s.height)} cm</td>
            <td>${formatNumber(s.thickness, Number.isInteger(s.thickness) ? 0 : 1)} cm</td>
            <td>${escapeHtml(s.surface)}</td>
            <td>${renderWarehouseBadges([s.warehouse])}</td>
            <td><strong>${formatNumber(s.areaM2, 2)} m²</strong></td>
          </tr>`
        )
        .join('');

      return `
        <tr class="stock-row" data-toggle-row="${escapeHtml(b.id)}">
          <td>${thumb}</td>
          <td><strong>${escapeHtml(b.materialName)}</strong></td>
          <td>${escapeHtml(b.blockNumber)}</td>
          <td>${escapeHtml(b.categoryLabel)}</td>
          <td>${renderWarehouseBadges(b.warehouses)}</td>
          <td><strong>${formatNumber(b.totalAreaM2, 2)} m²</strong> <span class="check-count">(${b.slabCount} ks)</span></td>
          <td>
            <button type="button" class="table-detail-btn" data-open-material="${escapeHtml(b.materialSlug)}" data-focus-block="${escapeHtml(b.blockNumber)}">
              Detail
            </button>
          </td>
        </tr>
        <tr ${isExpanded ? '' : 'hidden'}>
          <td colspan="7" class="subtable-cell">
            <table class="subtable">
              <thead>
                <tr>
                  <th>Rozměry (D × V)</th>
                  <th>Tloušťka</th>
                  <th>Povrch</th>
                  <th>Sklad</th>
                  <th>Plocha</th>
                </tr>
              </thead>
              <tbody>${slabRows}</tbody>
            </table>
          </td>
        </tr>`;
    })
    .join('');

  el.tableRoot.innerHTML = `
    <table class="stock-table">
      <thead>
        <tr>
          <th>Náhled</th>
          <th>Materiál</th>
          <th>Číslo bloku</th>
          <th>Druh</th>
          <th>Sklad</th>
          <th>Množství</th>
          <th>Akce</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>`;
}

function render() {
  if (!state.data) return;

  renderActiveChips();

  const activeFilterTotal =
    state.selectedColors.size +
    state.selectedTypes.size +
    state.selectedUsage.size +
    state.selectedWarehouses.size +
    state.selectedSurfaces.size +
    state.selectedThicknesses.size +
    (state.photoOnly ? 1 : 0);
  if (el.mobileFilterCount) {
    el.mobileFilterCount.hidden = activeFilterTotal === 0;
    el.mobileFilterCount.textContent = String(activeFilterTotal);
  }

  if (state.view === 'materials') {
    const materials = getFilteredMaterials();
    el.resultsSummary.textContent = `${materials.length} materiálů`;
    if (el.drawerApply) el.drawerApply.textContent = `Zobrazit výsledky (${materials.length})`;
    el.emptyState.hidden = materials.length > 0;
    if (materials.length > 0) {
      renderGroupedGallery(materials);
    } else {
      el.galleryRoot.hidden = true;
      el.tableRoot.hidden = true;
    }
  } else {
    const blocks = getFilteredBlocks();
    el.resultsSummary.textContent = `${blocks.length} bloků`;
    if (el.drawerApply) el.drawerApply.textContent = `Zobrazit výsledky (${blocks.length})`;
    el.emptyState.hidden = blocks.length > 0;
    if (blocks.length > 0) {
      renderTable(blocks);
    } else {
      el.galleryRoot.hidden = true;
      el.tableRoot.hidden = true;
    }
  }
}

function buildBlockSpecText(materialName, block) {
  const lines = [
    `Poptávka materiálu: ${materialName}`,
    `Blok: ${block.blockNumber}`,
    `Sklad: ${block.warehouses.join(', ')}`,
    `Celkem: ${block.slabCount} ks (${formatNumber(block.totalAreaM2, 2)} m²)`,
    'Desky:',
    ...block.slabs.map(
      (s) => `  - ${s.length} × ${s.height} × ${s.thickness} cm | ${s.surface} | ${s.warehouse} | ${formatNumber(s.areaM2, 2)} m²`
    ),
  ];
  return lines.join('\n');
}

function buildSceneHtml(scene, textureUrl, materialName, lbIndex, mat) {
  const bgSize = window.SC_getSceneBgSize ? window.SC_getSceneBgSize(scene, mat.textureScale || 'medium') : 'cover';
  const isJointed = Boolean(scene.supportsJoints && mat.maxHeightCm > 0 && mat.maxHeightCm <= 115);
  return `
    <button type="button" class="scene-card" data-lb-idx="${lbIndex}">
      <div class="scene-stage">
        <img class="scene-base" src="${escapeHtml(scene.base)}" alt="${escapeHtml(scene.label)} — ${escapeHtml(materialName)}" loading="lazy">
        <div class="scene-stone-layer${isJointed ? ' is-jointed' : ''}" data-tex-src="${escapeHtml(textureUrl)}" style="background-image:url('${escapeHtml(textureUrl)}');background-size:${escapeHtml(bgSize)};-webkit-mask-image:url('${escapeHtml(scene.mask)}');mask-image:url('${escapeHtml(scene.mask)}');"></div>
        ${scene.shine ? `<img class="scene-shine" src="${escapeHtml(scene.shine)}" alt="" aria-hidden="true" loading="lazy">` : ''}
      </div>
      <div class="scene-label">${escapeHtml(scene.label)} <span>Zvětšit ⤢</span></div>
    </button>`;
}

function openMaterialModal(slug, focusBlock = null) {
  const mat = state.data?.materials.find((m) => m.slug === slug);
  if (!mat) return;

  const images = mat.galleryImages;
  let initialIdx = 0;
  if (focusBlock) {
    const foundIdx = images.findIndex((img) => img.blockNumber === focusBlock);
    if (foundIdx >= 0) initialIdx = foundIdx;
  }

  const lbItems = images.map((img) => ({
    kind: 'photo',
    url: img.fullUrl,
    caption: img.label,
  }));

  const scenes = window.SC_getScenesForMaterial ? window.SC_getScenesForMaterial(mat) : [];
  const sceneStartIdx = lbItems.length;
  if (mat.sceneTextureUrl) {
    for (const sc of scenes) {
      lbItems.push({
        kind: 'scene',
        scene: sc,
        textureUrl: mat.sceneTextureUrl,
        textureScale: mat.textureScale || 'medium',
        isJointed: Boolean(sc.supportsJoints && mat.maxHeightCm > 0 && mat.maxHeightCm <= 115),
        caption: `${mat.name} — ${sc.label}`,
      });
    }
  }

  const realStartIdx = lbItems.length;
  for (const rImg of mat.realizationImages || []) {
    lbItems.push({
      kind: 'photo',
      url: rImg.fullUrl,
      caption: `${mat.name} — Reálná realizace`,
    });
  }

  const activeImg = images[initialIdx] || null;
  const stageBg = mat.cardImage || activeImg?.thumbUrl || '';
  const galleryHtml = activeImg
    ? `
      <div>
        <div class="gallery-main" id="modal-main-stage" data-lb-idx="${initialIdx}" ${stageBg ? `style="background-image:url('${escapeHtml(stageBg)}')"` : ''}>
          <img id="modal-main-img" src="${escapeHtml(activeImg.fullUrl)}" alt="${escapeHtml(mat.name)}">
          <span class="gallery-caption" id="modal-main-caption">${escapeHtml(activeImg.label)}</span>
          <span class="gallery-zoom-pill">Zvětšit ⤢</span>
        </div>
        ${
          images.length > 1
            ? `<div class="gallery-thumbs">
                ${images
                  .map(
                    (img, i) => `
                  <button type="button" class="g-thumb${i === initialIdx ? ' active' : ''}" data-thumb-idx="${i}" title="${escapeHtml(img.label)}">
                    <img src="${escapeHtml(img.thumbUrl)}" alt="${escapeHtml(img.label)}">
                  </button>`
                  )
                  .join('')}
              </div>`
            : ''
        }
      </div>`
    : `<div class="gallery-main"><div class="card-placeholder"><span>Bez fotografie bloku</span></div></div>`;

  const realizationsHtml =
    mat.realizationImages && mat.realizationImages.length
      ? `<div class="realizations-strip">
          ${mat.realizationImages
            .map(
              (rImg, idx) => `
            <button type="button" class="realization-card" data-lb-idx="${realStartIdx + idx}">
              <img src="${escapeHtml(rImg.cardUrl)}" alt="${escapeHtml(mat.name)} — realizace" loading="lazy">
              <div class="scene-label">Reálná realizace Stone Connection <span>Zvětšit ⤢</span></div>
            </button>`
            )
            .join('')}
        </div>`
      : '';

  const sceneHeading =
    mat.usageSegment === 'monument_exterior'
      ? 'Ukázka použití — pomníky, dlažby a exteriér'
      : mat.usageSegment === 'versatile'
        ? 'Ukázka použití v exteriéru i interiéru'
        : 'Nechte se inspirovat v interiéru';
  const formatParts = [];
  if (mat.maxLengthCm && mat.maxHeightCm) {
    formatParts.push(`Skladem desky až ${formatNumber(mat.maxLengthCm)} × ${formatNumber(mat.maxHeightCm)} cm`);
  }
  if (mat.thicknesses?.length) {
    formatParts.push(`tl. ${mat.thicknesses.join(', ')} cm`);
  }
  if (mat.maxHeightCm > 0 && mat.maxHeightCm <= 115) {
    formatParts.push('Pásový formát — obklad skládaný se spárou');
  }
  const sceneSub = formatParts.length ? formatParts.join(' · ') : 'Orientační náhled kresby a měřítka kamene v prostoru';

  const interiorSectionHtml = mat.sceneTextureUrl
    ? `
      <section class="section-block">
        <div class="section-head">
          <h3 class="section-title">${escapeHtml(sceneHeading)}</h3>
          <span class="section-sub">${escapeHtml(sceneSub)}</span>
        </div>
        ${realizationsHtml}
        <div class="scenes-grid">
          ${scenes.map((sc, idx) => buildSceneHtml(sc, mat.sceneTextureUrl, mat.name, sceneStartIdx + idx, mat)).join('')}
        </div>
      </section>`
    : '';

  const blocksHtml = mat.blocks
    .map((b) => {
      const bImg = b.featuredImage || b.detailImages[0];
      const bLbIdx = bImg ? images.findIndex((img) => img.rawUrl === bImg.rawUrl) : -1;
      const slabsHtml = b.slabs
        .map(
          (s) => `
          <tr>
            <td>${formatNumber(s.length)} × ${formatNumber(s.height)} cm</td>
            <td>${formatNumber(s.thickness, Number.isInteger(s.thickness) ? 0 : 1)} cm</td>
            <td>${escapeHtml(s.surface)}</td>
            <td>${renderWarehouseBadges([s.warehouse])}</td>
            <td><strong>${formatNumber(s.areaM2, 2)} m²</strong></td>
          </tr>`
        )
        .join('');

      const inquiryHref = `kontakt.html?material=${encodeURIComponent(mat.name)}&blok=${encodeURIComponent(b.blockNumber)}`;

      return `
        <article class="block-card" id="block-card-${escapeHtml(b.id)}">
          <div class="block-card-head">
            <div class="block-card-title">
              <span>Blok <strong>${escapeHtml(b.blockNumber)}</strong></span>
              ${renderWarehouseBadges(b.warehouses)}
              <span class="meta-tag">${b.slabCount} ks · ${formatNumber(b.totalAreaM2, 2)} m²</span>
            </div>
            <div class="block-head-actions">
              <button type="button" class="copy-block-btn" data-copy-block="${escapeHtml(b.blockNumber)}">
                Zkopírovat specifikaci
              </button>
              <a href="${inquiryHref}" class="btn-primary" style="padding:5px 11px;font-size:12px;">
                Poptat blok →
              </a>
            </div>
          </div>
          <div class="block-card-body${bImg ? '' : ' no-photo'}">
            ${
              bImg
                ? `<div class="block-photo-col">
                    <button type="button" class="block-photo-btn" data-lb-idx="${bLbIdx >= 0 ? bLbIdx : 0}" title="Zvětšit fotografii bloku ${escapeHtml(b.blockNumber)}">
                      <img src="${escapeHtml(bImg.thumbUrl)}" alt="${escapeHtml(mat.name)} blok ${escapeHtml(b.blockNumber)}">
                    </button>
                  </div>`
                : ''
            }
            <div class="slab-table-wrap">
              <table class="slab-table">
                <thead>
                  <tr>
                    <th>Rozměry (D × V)</th>
                    <th>Tloušťka</th>
                    <th>Povrch</th>
                    <th>Sklad</th>
                    <th>Plocha</th>
                  </tr>
                </thead>
                <tbody>${slabsHtml}</tbody>
              </table>
            </div>
          </div>
        </article>`;
    })
    .join('');

  const alternativesHtml =
    mat.alternatives && mat.alternatives.length
      ? `
      <section class="section-block">
        <div class="section-head">
          <h3 class="section-title">Podobné alternativy skladem</h3>
          <span class="section-sub">Dva nejbližší materiály podle barvy, kresby a charakteru</span>
        </div>
        <div class="alt-grid">
          ${mat.alternatives
            .map(
              (alt) => `
            <button type="button" class="alt-card" data-open-material="${escapeHtml(alt.slug)}">
              <div class="alt-thumb">
                ${renderCardImage(alt.cardImage, alt.name)}
              </div>
              <div class="alt-info">
                <div class="alt-name">${escapeHtml(alt.name)}</div>
                <div class="alt-reason">${escapeHtml(alt.reason)}</div>
                <div class="alt-cta">Zobrazit materiál →</div>
              </div>
            </button>`
            )
            .join('')}
        </div>
      </section>`
      : '';

  const catalogSlug = mat.catalogUrl ? mat.catalogUrl.split('/').filter(Boolean).pop() : null;
  const materialInquiryHref = `kontakt.html?material=${encodeURIComponent(mat.name)}`;

  el.modalBody.innerHTML = `
    <div class="modal-hero">
      ${galleryHtml}
      <div class="modal-meta">
        <div class="meta-badges">
          <span class="meta-tag">${escapeHtml(mat.categoryLabel)}</span>
          <span class="card-usage-pill usage-${escapeHtml(mat.usageSegment || 'interior')}">${escapeHtml(mat.usageLabel || 'Interiér')}</span>
          ${mat.origin ? `<span class="meta-tag">Původ: ${escapeHtml(mat.origin)}</span>` : ''}
          ${mat.colors
            .map((c) => {
              const hex = COLOR_MAP.get(c.key)?.hex || '#78716c';
              return `<span class="meta-tag"><span class="swatch-dot" style="background:${escapeHtml(hex)}"></span>${escapeHtml(c.label)}</span>`;
            })
            .join('')}
        </div>
        <h2 id="modal-title">${escapeHtml(mat.name)}</h2>
        <p class="stone-comment">${escapeHtml(mat.comment || '')}</p>
        <div class="kpi-grid">
          <div class="kpi-box"><strong>${mat.blockCount}</strong><span>bloků skladem</span></div>
          <div class="kpi-box"><strong>${mat.totalSlabs} ks</strong><span>desek celkem</span></div>
          <div class="kpi-box"><strong>${formatNumber(mat.totalAreaM2, 2)} m²</strong><span>celková plocha</span></div>
        </div>
        <div class="meta-details">
          <div><strong>Sklady:</strong> ${escapeHtml(mat.warehouses.join(', '))}</div>
          <div><strong>Tloušťky:</strong> ${escapeHtml(mat.thicknesses.map((t) => `${t} cm`).join(', ') || 'neuvedeno')}</div>
          <div><strong>Povrchy:</strong> ${escapeHtml(mat.surfaces.join(', ') || 'neuvedeno')}</div>
          ${mat.applications.length ? `<div><strong>Vhodné použití:</strong> ${escapeHtml(mat.applications.join(', '))}</div>` : ''}
        </div>
        <div class="modal-cta-row">
          <a href="${materialInquiryHref}" class="btn-primary">
            Poptat materiál →
          </a>
          ${
            catalogSlug
              ? `<a href="katalog.html#k=${escapeHtml(catalogSlug)}" class="btn-secondary">
                  Katalogový list →
                </a>`
              : ''
          }
        </div>
      </div>
    </div>

    ${interiorSectionHtml}

    <section class="section-block">
      <h3 class="blocks-section-title">Skladové bloky a jednotlivé desky (${mat.blockCount})</h3>
      ${blocksHtml}
    </section>

    ${alternativesHtml}
  `;

  state.lightboxItems = lbItems;
  el.modal.hidden = false;
  document.body.style.overflow = 'hidden';
  el.modalBody.scrollTop = 0;
  if (window.SC_applySeamlessTiles) {
    window.SC_applySeamlessTiles(el.modalBody);
  }

  if (window.location.hash !== `#m=${slug}`) {
    history.replaceState(null, '', `#m=${slug}`);
  }

  el.modalBody.querySelectorAll('[data-thumb-idx]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.getAttribute('data-thumb-idx'));
      const chosen = images[idx];
      if (!chosen) return;
      const mainImg = document.getElementById('modal-main-img');
      const mainCaption = document.getElementById('modal-main-caption');
      const stage = document.getElementById('modal-main-stage');
      if (stage) stage.style.backgroundImage = `url('${chosen.thumbUrl}')`;
      if (mainImg) mainImg.src = chosen.fullUrl;
      if (mainCaption) mainCaption.textContent = chosen.label;
      if (stage) stage.setAttribute('data-lb-idx', String(idx));
      el.modalBody.querySelectorAll('.g-thumb').forEach((t) => t.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  el.modalBody.querySelectorAll('[data-lb-idx]').forEach((trigger) => {
    trigger.addEventListener('click', () => {
      if (!lbItems.length) return;
      const idx = Number(trigger.getAttribute('data-lb-idx')) || 0;
      openLightbox(idx);
    });
  });

  el.modalBody.querySelectorAll('[data-copy-block]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const bn = btn.getAttribute('data-copy-block');
      const blk = mat.blocks.find((b) => b.blockNumber === bn);
      if (blk) {
        copyText(buildBlockSpecText(mat.name, blk), `Specifikace bloku ${bn} zkopírována.`);
      }
    });
  });

  el.modalBody.querySelectorAll('[data-open-material]').forEach((altBtn) => {
    altBtn.addEventListener('click', () => {
      openMaterialModal(altBtn.getAttribute('data-open-material'));
    });
  });
}

function closeModal() {
  el.modal.hidden = true;
  document.body.style.overflow = '';
  if (window.location.hash.startsWith('#m=')) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}

function openLightbox(index) {
  if (!state.lightboxItems.length) return;
  state.lightboxIndex = (index + state.lightboxItems.length) % state.lightboxItems.length;
  const item = state.lightboxItems[state.lightboxIndex];
  const countText = `${item.caption} (${state.lightboxIndex + 1} / ${state.lightboxItems.length})`;

  if (item.kind === 'scene') {
    const bgSize = window.SC_getSceneBgSize ? window.SC_getSceneBgSize(item.scene, item.textureScale || 'medium') : 'cover';
    el.lbStage.innerHTML = `
      <div class="lb-scene-wrap">
        <div class="scene-stage">
          <img class="scene-base" src="${escapeHtml(item.scene.base)}" alt="${escapeHtml(item.caption)}">
          <div class="scene-stone-layer${item.isJointed ? ' is-jointed' : ''}" data-tex-src="${escapeHtml(item.textureUrl)}" style="background-image:url('${escapeHtml(item.textureUrl)}');background-size:${escapeHtml(bgSize)};-webkit-mask-image:url('${escapeHtml(item.scene.mask)}');mask-image:url('${escapeHtml(item.scene.mask)}');"></div>
          ${item.scene.shine ? `<img class="scene-shine" src="${escapeHtml(item.scene.shine)}" alt="" aria-hidden="true">` : ''}
        </div>
      </div>
      <div class="lb-caption">${escapeHtml(countText)}</div>`;
    if (window.SC_applySeamlessTiles) {
      window.SC_applySeamlessTiles(el.lbStage);
    }
  } else {
    el.lbStage.innerHTML = `
      <img class="lb-photo" src="${escapeHtml(item.url)}" alt="${escapeHtml(item.caption)}">
      <div class="lb-caption">${escapeHtml(countText)}</div>`;
  }

  el.lbPrev.hidden = state.lightboxItems.length <= 1;
  el.lbNext.hidden = state.lightboxItems.length <= 1;
  el.lightbox.hidden = false;
}

function closeLightbox() {
  el.lightbox.hidden = true;
}

function syncCheckboxes() {
  document.querySelectorAll('[data-filter]').forEach((cb) => {
    const kind = cb.getAttribute('data-filter');
    const val = cb.value;
    if (kind === 'color') cb.checked = state.selectedColors.has(val);
    else if (kind === 'type') cb.checked = state.selectedTypes.has(val);
    else if (kind === 'usage') cb.checked = state.selectedUsage.has(val);
    else if (kind === 'warehouse') cb.checked = state.selectedWarehouses.has(val);
    else if (kind === 'surface') cb.checked = state.selectedSurfaces.has(val);
    else if (kind === 'thickness') cb.checked = state.selectedThicknesses.has(val);
  });
}

function resetAllFilters() {
  state.selectedColors.clear();
  state.selectedTypes.clear();
  state.selectedUsage.clear();
  state.selectedWarehouses.clear();
  state.selectedSurfaces.clear();
  state.selectedThicknesses.clear();
  state.search = '';
  state.photoOnly = false;

  el.searchInput.value = '';
  el.photoOnlyToggle.checked = false;
  syncCheckboxes();
  render();
}

function setDrawerOpen(open) {
  if (!el.sidebar) return;
  el.sidebar.classList.toggle('drawer-open', open);
  if (el.filterBackdrop) el.filterBackdrop.hidden = !open;
  if (el.mobileFilterBtn) el.mobileFilterBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  document.body.style.overflow = open || !el.modal.hidden ? 'hidden' : '';
}

function bindEvents() {
  if (el.mobileFilterBtn) {
    el.mobileFilterBtn.addEventListener('click', () => setDrawerOpen(true));
  }
  if (el.drawerClose) {
    el.drawerClose.addEventListener('click', () => setDrawerOpen(false));
  }
  if (el.drawerApply) {
    el.drawerApply.addEventListener('click', () => setDrawerOpen(false));
  }
  if (el.filterBackdrop) {
    el.filterBackdrop.addEventListener('click', () => setDrawerOpen(false));
  }

  let lbTouchStartX = 0;
  el.lightbox.addEventListener(
    'touchstart',
    (e) => {
      if (e.changedTouches && e.changedTouches[0]) {
        lbTouchStartX = e.changedTouches[0].clientX;
      }
    },
    { passive: true }
  );
  el.lightbox.addEventListener(
    'touchend',
    (e) => {
      if (state.lightboxItems.length <= 1 || !e.changedTouches || !e.changedTouches[0]) return;
      const dx = e.changedTouches[0].clientX - lbTouchStartX;
      if (Math.abs(dx) > 45) {
        openLightbox(state.lightboxIndex + (dx < 0 ? 1 : -1));
      }
    },
    { passive: true }
  );

  document.querySelector('.sidebar-box').addEventListener('change', (e) => {
    const cb = e.target.closest('input[data-filter]');
    if (!cb) return;
    const kind = cb.getAttribute('data-filter');
    const val = cb.value;
    const map = {
      color: state.selectedColors,
      type: state.selectedTypes,
      usage: state.selectedUsage,
      warehouse: state.selectedWarehouses,
      surface: state.selectedSurfaces,
      thickness: state.selectedThicknesses,
    };
    const set = map[kind];
    if (!set) return;
    if (cb.checked) set.add(val);
    else set.delete(val);
    render();
  });

  el.activeBar.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-remove-kind]');
    if (!chip) return;
    const kind = chip.getAttribute('data-remove-kind');
    const val = chip.getAttribute('data-remove-val');
    if (kind === 'color') state.selectedColors.delete(val);
    else if (kind === 'type') state.selectedTypes.delete(val);
    else if (kind === 'usage') state.selectedUsage.delete(val);
    else if (kind === 'warehouse') state.selectedWarehouses.delete(val);
    else if (kind === 'surface') state.selectedSurfaces.delete(val);
    else if (kind === 'thickness') state.selectedThicknesses.delete(val);
    else if (kind === 'search') {
      state.search = '';
      el.searchInput.value = '';
    } else if (kind === 'photoOnly') {
      state.photoOnly = false;
      el.photoOnlyToggle.checked = false;
    }
    syncCheckboxes();
    render();
  });

  document.querySelectorAll('.view-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.view = btn.getAttribute('data-view');
      document.querySelectorAll('.view-btn').forEach((b) => {
        const active = b === btn;
        b.classList.toggle('active', active);
        b.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      render();
    });
  });

  el.searchInput.addEventListener('input', () => {
    state.search = el.searchInput.value;
    render();
  });

  el.groupBy.addEventListener('change', () => {
    state.groupBy = el.groupBy.value;
    render();
  });

  el.photoOnlyToggle.addEventListener('change', () => {
    state.photoOnly = el.photoOnlyToggle.checked;
    render();
  });

  el.resetBtn.addEventListener('click', resetAllFilters);
  el.emptyReset.addEventListener('click', resetAllFilters);

  el.galleryRoot.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-open-material]');
    if (!trigger) return;
    openMaterialModal(trigger.getAttribute('data-open-material'), trigger.getAttribute('data-focus-block'));
  });

  el.tableRoot.addEventListener('click', (e) => {
    const detailBtn = e.target.closest('[data-open-material]');
    if (detailBtn) {
      e.stopPropagation();
      openMaterialModal(detailBtn.getAttribute('data-open-material'), detailBtn.getAttribute('data-focus-block'));
      return;
    }
    const row = e.target.closest('[data-toggle-row]');
    if (!row) return;
    const id = row.getAttribute('data-toggle-row');
    if (state.expandedTableRows.has(id)) state.expandedTableRows.delete(id);
    else state.expandedTableRows.add(id);
    render();
  });

  el.modalClose.addEventListener('click', closeModal);
  el.modal.addEventListener('click', (e) => {
    if (e.target === el.modal) closeModal();
  });

  el.lbClose.addEventListener('click', closeLightbox);
  el.lbPrev.addEventListener('click', () => openLightbox(state.lightboxIndex - 1));
  el.lbNext.addEventListener('click', () => openLightbox(state.lightboxIndex + 1));
  el.lightbox.addEventListener('click', (e) => {
    if (e.target === el.lightbox) closeLightbox();
  });

  document.addEventListener('keydown', (e) => {
    if (!el.lightbox.hidden) {
      if (e.key === 'Escape') closeLightbox();
      else if (e.key === 'ArrowLeft') openLightbox(state.lightboxIndex - 1);
      else if (e.key === 'ArrowRight') openLightbox(state.lightboxIndex + 1);
      return;
    }
    if (!el.modal.hidden && e.key === 'Escape') {
      closeModal();
    } else if (el.sidebar && el.sidebar.classList.contains('drawer-open') && e.key === 'Escape') {
      setDrawerOpen(false);
    }
  });
}

async function init() {
  bindEvents();
  try {
    const res = await fetch('data/sklad.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.data = data;
    state.usageBySlug = new Map(data.materials.map((m) => [m.slug, m.usageSegment || 'interior']));

    const updated = formatDateCs(data.meta.sourceUpdatedAt || data.meta.syncedAt);
    el.footerMeta.textContent = `Aktualizováno: ${updated}`;

    populateSidebarFilters(data);
    render();

    if (window.location.hash.startsWith('#m=')) {
      const slug = window.location.hash.slice(3);
      openMaterialModal(slug);
    }
  } catch (err) {
    el.resultsSummary.textContent = 'Nepodařilo se načíst skladová data.';
    el.emptyState.hidden = false;
    console.error(err);
  }
}

init();
