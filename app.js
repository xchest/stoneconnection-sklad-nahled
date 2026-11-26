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

const SCENES = [
  { key: 'kuchyne', label: 'Kuchyně s ostrovem', base: 'assets/scenes/kuchyne_base.jpg', mask: 'assets/scenes/kuchyne_mask.png' },
  { key: 'krb', label: 'Krbová stěna', base: 'assets/scenes/krb_base.jpg', mask: 'assets/scenes/krb_mask.png' },
  { key: 'koupelna', label: 'Koupelna', base: 'assets/scenes/koupelna_base.jpg', mask: 'assets/scenes/koupelna_mask.png' },
];

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
  view: 'materials', // 'materials' | 'blocks' | 'table'
  groupBy: 'none',   // 'none' | 'type' | 'color'
  selectedTypes: new Set(),
  selectedColors: new Set(),
  search: '',
  warehouse: '',
  thickness: '',
  surface: '',
  photoOnly: false,
  expandedTableRows: new Set(),
  lightboxItems: [],
  lightboxIndex: 0,
};

const el = {
  menuToggle: document.getElementById('menu-toggle'),
  mainNav: document.getElementById('main-nav'),
  statMaterials: document.getElementById('stat-materials'),
  statBlocks: document.getElementById('stat-blocks'),
  statSlabs: document.getElementById('stat-slabs'),
  statArea: document.getElementById('stat-area'),
  typePills: document.getElementById('type-pills'),
  colorPills: document.getElementById('color-pills'),
  searchInput: document.getElementById('search-input'),
  thicknessFilter: document.getElementById('thickness-filter'),
  surfaceFilter: document.getElementById('surface-filter'),
  groupBy: document.getElementById('group-by'),
  photoOnlyToggle: document.getElementById('photo-only-toggle'),
  activeBar: document.getElementById('active-bar'),
  activeChips: document.getElementById('active-chips'),
  resetBtn: document.getElementById('reset-filters'),
  emptyReset: document.getElementById('empty-reset'),
  resultsSummary: document.getElementById('results-summary'),
  syncStamp: document.getElementById('sync-stamp'),
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

function populateFilterOptions(data) {
  const typeCounts = new Map();
  const colorCounts = new Map();
  const thicknesses = new Set();
  const surfaces = new Set();

  for (const m of data.materials) {
    typeCounts.set(m.categoryKey, (typeCounts.get(m.categoryKey) || 0) + 1);
    m.colors.forEach((c) => colorCounts.set(c.key, (colorCounts.get(c.key) || 0) + 1));
    m.thicknesses.forEach((t) => thicknesses.add(t));
    m.surfaces.forEach((s) => surfaces.add(s));
  }

  el.typePills.innerHTML = TYPE_ORDER.filter((k) => typeCounts.has(k))
    .map(
      (k) => `
      <button type="button" class="filter-pill" data-type="${escapeHtml(k)}" aria-pressed="false">
        <span>${escapeHtml(TYPE_LABELS[k] || k)}</span>
        <span class="pill-count">${typeCounts.get(k)}</span>
      </button>`
    )
    .join('');

  el.colorPills.innerHTML = COLOR_META.filter((c) => colorCounts.has(c.key))
    .map(
      (c) => `
      <button type="button" class="filter-pill color-pill" data-color="${escapeHtml(c.key)}" aria-pressed="false">
        <span class="swatch-dot" style="background:${escapeHtml(c.hex)}"></span>
        <span>${escapeHtml(c.label)}</span>
        <span class="pill-count">${colorCounts.get(c.key)}</span>
      </button>`
    )
    .join('');

  [...thicknesses]
    .sort((a, b) => a - b)
    .forEach((t) => {
      const opt = document.createElement('option');
      opt.value = String(t);
      opt.textContent = `${formatNumber(t, Number.isInteger(t) ? 0 : 1)} cm`;
      el.thicknessFilter.appendChild(opt);
    });

  [...surfaces]
    .sort((a, b) => a.localeCompare(b, 'cs'))
    .forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      el.surfaceFilter.appendChild(opt);
    });
}

function getFilteredMaterials() {
  const q = foldText(state.search.trim());
  const thick = state.thickness ? Number(state.thickness) : null;

  return state.data.materials.filter((m) => {
    if (state.selectedTypes.size > 0 && !state.selectedTypes.has(m.categoryKey)) return false;
    if (state.selectedColors.size > 0 && !m.colors.some((c) => state.selectedColors.has(c.key))) return false;
    if (state.warehouse && !m.warehouses.includes(state.warehouse)) return false;
    if (thick !== null && !m.thicknesses.includes(thick)) return false;
    if (state.surface && !m.surfaces.includes(state.surface)) return false;
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
  const thick = state.thickness ? Number(state.thickness) : null;

  return state.data.blocks.filter((b) => {
    if (state.selectedTypes.size > 0 && !state.selectedTypes.has(b.categoryKey)) return false;
    if (state.selectedColors.size > 0 && !b.colors.some((c) => state.selectedColors.has(c))) return false;
    if (state.warehouse && !b.warehouses.includes(state.warehouse)) return false;
    if (thick !== null && !b.thicknesses.includes(thick)) return false;
    if (state.surface && !b.surfaces.includes(state.surface)) return false;
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
  for (const t of state.selectedTypes) {
    chips.push({ kind: 'type', value: t, label: `Druh: ${TYPE_LABELS[t] || t}` });
  }
  for (const c of state.selectedColors) {
    chips.push({ kind: 'color', value: c, label: `Barva: ${COLOR_MAP.get(c)?.label || c}` });
  }
  if (state.warehouse) chips.push({ kind: 'warehouse', value: state.warehouse, label: `Sklad: ${state.warehouse}` });
  if (state.thickness) chips.push({ kind: 'thickness', value: state.thickness, label: `Tloušťka: ${state.thickness} cm` });
  if (state.surface) chips.push({ kind: 'surface', value: state.surface, label: `Povrch: ${state.surface}` });
  if (state.search.trim()) chips.push({ kind: 'search', value: state.search, label: `Hledání: „${state.search.trim()}“` });
  if (state.photoOnly) chips.push({ kind: 'photoOnly', value: '1', label: 'Jen s fotkou' });

  el.activeBar.hidden = chips.length === 0;
  el.activeChips.innerHTML = chips
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

function materialCardHtml(m) {
  const blockHint = `${m.blockCount} ${m.blockCount === 1 ? 'blok' : m.blockCount < 5 ? 'bloky' : 'bloků'}`;
  return `
    <button type="button" class="stone-card" data-open-material="${escapeHtml(m.slug)}">
      <div class="card-media">
        ${renderCardImage(m.cardImage, m.name)}
        <span class="card-type-pill">${escapeHtml(m.categoryLabel)}</span>
        <span class="card-hover-hint">${escapeHtml(blockHint)} · detail</span>
      </div>
      <div class="card-body">
        <h2 class="card-title">${escapeHtml(m.name)}</h2>
      </div>
    </button>`;
}

function blockCardHtml(b) {
  return `
    <button type="button" class="stone-card" data-open-material="${escapeHtml(b.materialSlug)}" data-focus-block="${escapeHtml(b.blockNumber)}">
      <div class="card-media">
        ${renderCardImage(b.cardImage, `${b.materialName} — blok ${b.blockNumber}`)}
        <span class="card-type-pill">${escapeHtml(b.categoryLabel)}</span>
        <span class="card-hover-hint">${escapeHtml(b.warehouses.join(', '))} · detail</span>
      </div>
      <div class="card-body">
        <h2 class="card-title">${escapeHtml(b.materialName)}</h2>
        <span class="card-block-tag">Blok ${escapeHtml(b.blockNumber)}</span>
      </div>
    </button>`;
}

function renderGroupedGallery(items, isBlocks) {
  el.galleryRoot.hidden = false;
  el.tableRoot.hidden = true;

  if (state.groupBy === 'none') {
    el.galleryRoot.innerHTML = `<div class="gallery-grid">${items.map(isBlocks ? blockCardHtml : materialCardHtml).join('')}</div>`;
    return;
  }

  const sections = [];
  if (state.groupBy === 'type') {
    for (const k of TYPE_ORDER) {
      const subset = items.filter((item) => item.categoryKey === k);
      if (subset.length) {
        sections.push({ title: TYPE_LABELS[k] || k, items: subset });
      }
    }
  } else if (state.groupBy === 'color') {
    for (const cm of COLOR_META) {
      const subset = items.filter((item) => {
        if (isBlocks) return item.colors[0] === cm.key;
        return item.colors[0]?.key === cm.key;
      });
      if (subset.length) {
        sections.push({ title: cm.label, hex: cm.hex, items: subset });
      }
    }
  }

  el.galleryRoot.innerHTML = sections
    .map(
      (sec) => `
      <section class="group-section">
        <h3 class="group-heading">
          ${sec.hex ? `<span class="swatch-dot" style="background:${escapeHtml(sec.hex)};width:16px;height:16px;"></span>` : ''}
          ${escapeHtml(sec.title)}
          <span>(${sec.items.length})</span>
        </h3>
        <div class="gallery-grid">
          ${sec.items.map(isBlocks ? blockCardHtml : materialCardHtml).join('')}
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
          <td><strong>${formatNumber(b.totalAreaM2, 2)} m²</strong> <span class="pill-count">(${b.slabCount} ks)</span></td>
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

  if (state.view === 'materials') {
    const materials = getFilteredMaterials();
    const totalBlocks = materials.reduce((acc, m) => acc + m.blockCount, 0);
    const totalSlabs = materials.reduce((acc, m) => acc + m.totalSlabs, 0);
    const totalArea = materials.reduce((acc, m) => acc + m.totalAreaM2, 0);

    el.resultsSummary.textContent = `Zobrazeno ${materials.length} materiálů (${totalBlocks} bloků · ${totalSlabs} desek · ${formatNumber(totalArea, 2)} m²)`;
    el.emptyState.hidden = materials.length > 0;
    if (materials.length > 0) {
      renderGroupedGallery(materials, false);
    } else {
      el.galleryRoot.hidden = true;
      el.tableRoot.hidden = true;
    }
  } else {
    const blocks = getFilteredBlocks();
    const totalSlabs = blocks.reduce((acc, b) => acc + b.slabCount, 0);
    const totalArea = blocks.reduce((acc, b) => acc + b.totalAreaM2, 0);

    el.resultsSummary.textContent = `Zobrazeno ${blocks.length} bloků (${totalSlabs} desek · ${formatNumber(totalArea, 2)} m²)`;
    el.emptyState.hidden = blocks.length > 0;
    if (blocks.length > 0) {
      if (state.view === 'blocks') {
        renderGroupedGallery(blocks, true);
      } else {
        renderTable(blocks);
      }
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

function buildSceneHtml(scene, textureUrl, materialName, lbIndex) {
  return `
    <button type="button" class="scene-card" data-lb-idx="${lbIndex}">
      <div class="scene-stage">
        <img class="scene-base" src="${escapeHtml(scene.base)}" alt="${escapeHtml(scene.label)} — ${escapeHtml(materialName)}" loading="lazy">
        <div class="scene-stone-layer" style="background-image:url('${escapeHtml(textureUrl)}');-webkit-mask-image:url('${escapeHtml(scene.mask)}');mask-image:url('${escapeHtml(scene.mask)}');"></div>
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

  // Build unified lightbox list: stone gallery + interior visualizations + real realizations
  const lbItems = images.map((img) => ({
    kind: 'photo',
    url: img.fullUrl,
    caption: img.label,
  }));

  let sceneStartIdx = lbItems.length;
  if (mat.sceneTextureUrl) {
    for (const sc of SCENES) {
      lbItems.push({
        kind: 'scene',
        scene: sc,
        textureUrl: mat.sceneTextureUrl,
        caption: `${mat.name} — ${sc.label}`,
      });
    }
  }

  let realStartIdx = lbItems.length;
  for (const rImg of mat.realizationImages || []) {
    lbItems.push({
      kind: 'photo',
      url: rImg.fullUrl,
      caption: `${mat.name} — Reálná realizace`,
    });
  }

  const activeImg = images[initialIdx] || null;
  const galleryHtml = activeImg
    ? `
      <div>
        <div class="gallery-main" id="modal-main-stage" data-lb-idx="${initialIdx}">
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

  const interiorSectionHtml = mat.sceneTextureUrl
    ? `
      <section class="section-block">
        <div class="section-head">
          <h3 class="section-title">Nechte se inspirovat v interiéru</h3>
          <span class="section-sub">Orientační náhled kresby kamene v prostoru</span>
        </div>
        ${realizationsHtml}
        <div class="scenes-grid">
          ${SCENES.map((sc, idx) => buildSceneHtml(sc, mat.sceneTextureUrl, mat.name, sceneStartIdx + idx)).join('')}
        </div>
      </section>`
    : '';

  const blocksHtml = mat.blocks
    .map((b) => {
      const bImg = b.detailImages[0] || b.featuredImage;
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

      return `
        <article class="block-card" id="block-card-${escapeHtml(b.id)}">
          <div class="block-card-head">
            <div class="block-card-title">
              <span>Blok <strong>${escapeHtml(b.blockNumber)}</strong></span>
              ${renderWarehouseBadges(b.warehouses)}
              <span class="meta-tag">${b.slabCount} ks · ${formatNumber(b.totalAreaM2, 2)} m²</span>
            </div>
            <button type="button" class="copy-block-btn" data-copy-block="${escapeHtml(b.blockNumber)}">
              Zkopírovat specifikaci bloku
            </button>
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

  el.modalBody.innerHTML = `
    <div class="modal-hero">
      ${galleryHtml}
      <div class="modal-meta">
        <div class="meta-badges">
          <span class="meta-tag">${escapeHtml(mat.categoryLabel)}</span>
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
          <a href="https://www.stoneconnection.cz/kontakt/" target="_blank" rel="noopener noreferrer" class="btn-primary">
            Poptat materiál ↗
          </a>
          ${
            mat.catalogUrl
              ? `<a href="${escapeHtml(mat.catalogUrl)}" target="_blank" rel="noopener noreferrer" class="btn-secondary">
                  Katalogový list ↗
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
    el.lbStage.innerHTML = `
      <div class="lb-scene-wrap">
        <div class="scene-stage">
          <img class="scene-base" src="${escapeHtml(item.scene.base)}" alt="${escapeHtml(item.caption)}">
          <div class="scene-stone-layer" style="background-image:url('${escapeHtml(item.textureUrl)}');-webkit-mask-image:url('${escapeHtml(item.scene.mask)}');mask-image:url('${escapeHtml(item.scene.mask)}');"></div>
        </div>
      </div>
      <div class="lb-caption">${escapeHtml(countText)}</div>`;
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

function syncPillStates() {
  el.typePills.querySelectorAll('[data-type]').forEach((btn) => {
    const active = state.selectedTypes.has(btn.getAttribute('data-type'));
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  el.colorPills.querySelectorAll('[data-color]').forEach((btn) => {
    const active = state.selectedColors.has(btn.getAttribute('data-color'));
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function resetAllFilters() {
  state.selectedTypes.clear();
  state.selectedColors.clear();
  state.search = '';
  state.warehouse = '';
  state.thickness = '';
  state.surface = '';
  state.photoOnly = false;

  el.searchInput.value = '';
  el.thicknessFilter.value = '';
  el.surfaceFilter.value = '';
  el.photoOnlyToggle.checked = false;

  syncPillStates();
  document.querySelectorAll('.seg-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-warehouse') === '');
  });

  render();
}

function bindEvents() {
  if (el.menuToggle && el.mainNav) {
    el.menuToggle.addEventListener('click', () => {
      const open = el.mainNav.classList.toggle('open');
      el.menuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  el.typePills.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-type]');
    if (!btn) return;
    const val = btn.getAttribute('data-type');
    if (state.selectedTypes.has(val)) state.selectedTypes.delete(val);
    else state.selectedTypes.add(val);
    syncPillStates();
    render();
  });

  el.colorPills.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-color]');
    if (!btn) return;
    const val = btn.getAttribute('data-color');
    if (state.selectedColors.has(val)) state.selectedColors.delete(val);
    else state.selectedColors.add(val);
    syncPillStates();
    render();
  });

  el.activeChips.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-remove-kind]');
    if (!chip) return;
    const kind = chip.getAttribute('data-remove-kind');
    const val = chip.getAttribute('data-remove-val');
    if (kind === 'type') state.selectedTypes.delete(val);
    else if (kind === 'color') state.selectedColors.delete(val);
    else if (kind === 'warehouse') {
      state.warehouse = '';
      document.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b.getAttribute('data-warehouse') === ''));
    } else if (kind === 'thickness') {
      state.thickness = '';
      el.thicknessFilter.value = '';
    } else if (kind === 'surface') {
      state.surface = '';
      el.surfaceFilter.value = '';
    } else if (kind === 'search') {
      state.search = '';
      el.searchInput.value = '';
    } else if (kind === 'photoOnly') {
      state.photoOnly = false;
      el.photoOnlyToggle.checked = false;
    }
    syncPillStates();
    render();
  });

  document.querySelectorAll('.view-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.view = btn.getAttribute('data-view');
      document.querySelectorAll('.view-btn').forEach((b) => b.classList.toggle('active', b === btn));
      render();
    });
  });

  document.querySelectorAll('.seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.warehouse = btn.getAttribute('data-warehouse') || '';
      document.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b === btn));
      render();
    });
  });

  el.searchInput.addEventListener('input', () => {
    state.search = el.searchInput.value;
    render();
  });

  el.thicknessFilter.addEventListener('change', () => {
    state.thickness = el.thicknessFilter.value;
    render();
  });

  el.surfaceFilter.addEventListener('change', () => {
    state.surface = el.surfaceFilter.value;
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
    const card = e.target.closest('[data-open-material]');
    if (!card) return;
    openMaterialModal(card.getAttribute('data-open-material'), card.getAttribute('data-focus-block'));
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

    el.statMaterials.textContent = formatNumber(data.meta.totalMaterials);
    el.statBlocks.textContent = formatNumber(data.meta.totalBlocks);
    el.statSlabs.textContent = formatNumber(data.meta.totalSlabs);
    el.statArea.textContent = `${formatNumber(data.meta.totalAreaM2, 0)} m²`;

    const updated = formatDateCs(data.meta.sourceUpdatedAt || data.meta.syncedAt);
    el.syncStamp.textContent = `Poslední aktualizace: ${updated}`;
    el.footerMeta.textContent = `Aktualizováno: ${updated}`;

    populateFilterOptions(data);
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
