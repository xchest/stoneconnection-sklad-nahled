const state = {
  data: null,
  view: 'materials', // 'materials' | 'blocks' | 'table'
  category: '',
  search: '',
  warehouse: '',
  thickness: '',
  surface: '',
  color: '',
  photoOnly: false,
  expandedTableRows: new Set(),
  lightboxImages: [],
  lightboxIndex: 0,
};

const el = {
  statMaterials: document.getElementById('stat-materials'),
  statBlocks: document.getElementById('stat-blocks'),
  statSlabs: document.getElementById('stat-slabs'),
  statArea: document.getElementById('stat-area'),
  categoryTabs: document.getElementById('category-tabs'),
  searchInput: document.getElementById('search-input'),
  thicknessFilter: document.getElementById('thickness-filter'),
  surfaceFilter: document.getElementById('surface-filter'),
  colorFilter: document.getElementById('color-filter'),
  photoOnlyToggle: document.getElementById('photo-only-toggle'),
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
  lbImg: document.getElementById('lb-img'),
  lbCaption: document.getElementById('lb-caption'),
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
  const categories = [
    { key: '', label: 'Vše', count: data.materials.length },
  ];
  const counts = new Map();
  for (const m of data.materials) {
    counts.set(m.categoryKey, {
      label: m.categoryKey === 'ostatni' ? 'Ostatní' : m.categoryLabel,
      count: (counts.get(m.categoryKey)?.count || 0) + 1,
    });
  }
  const order = ['zula', 'kvarcit', 'mramor', 'onyx', 'travertin', 'vapenec', 'keramika', 'ostatni'];
  for (const k of order) {
    if (counts.has(k)) {
      categories.push({ key: k, ...counts.get(k) });
    }
  }

  el.categoryTabs.innerHTML = categories
    .map(
      (c) => `
      <button type="button" class="cat-tab${state.category === c.key ? ' active' : ''}" data-category="${escapeHtml(c.key)}">
        <span>${escapeHtml(c.label)}</span>
        <span class="cat-count">${c.count}</span>
      </button>`
    )
    .join('');

  const thicknesses = new Set();
  const surfaces = new Set();
  const colorsMap = new Map();

  for (const m of data.materials) {
    m.thicknesses.forEach((t) => thicknesses.add(t));
    m.surfaces.forEach((s) => surfaces.add(s));
    m.colors.forEach((c) => colorsMap.set(c.key, c.label));
  }

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

  [...colorsMap.entries()]
    .sort((a, b) => a[1].localeCompare(b[1], 'cs'))
    .forEach(([k, label]) => {
      const opt = document.createElement('option');
      opt.value = k;
      opt.textContent = label;
      el.colorFilter.appendChild(opt);
    });
}

function getFilteredMaterials() {
  const q = foldText(state.search.trim());
  const thick = state.thickness ? Number(state.thickness) : null;

  return state.data.materials.filter((m) => {
    if (state.category && m.categoryKey !== state.category) return false;
    if (state.warehouse && !m.warehouses.includes(state.warehouse)) return false;
    if (thick !== null && !m.thicknesses.includes(thick)) return false;
    if (state.surface && !m.surfaces.includes(state.surface)) return false;
    if (state.color && !m.colors.some((c) => c.key === state.color)) return false;
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
    if (state.category && b.categoryKey !== state.category) return false;
    if (state.warehouse && !b.warehouses.includes(state.warehouse)) return false;
    if (thick !== null && !b.thicknesses.includes(thick)) return false;
    if (state.surface && !b.surfaces.includes(state.surface)) return false;
    if (state.color && !b.colors.includes(state.color)) return false;
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

function hasActiveFilters() {
  return Boolean(
    state.category ||
      state.search.trim() ||
      state.warehouse ||
      state.thickness ||
      state.surface ||
      state.color ||
      state.photoOnly
  );
}

function renderCardImage(imageUrl, alt) {
  if (!imageUrl) {
    return `<div class="card-placeholder"><span>Bez fotografie</span></div>`;
  }
  return `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async">`;
}

function renderMaterialsCards(materials) {
  el.galleryRoot.hidden = false;
  el.tableRoot.hidden = true;

  el.galleryRoot.innerHTML = materials
    .map((m) => {
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
    })
    .join('');
}

function renderBlockCards(blocks) {
  el.galleryRoot.hidden = false;
  el.tableRoot.hidden = true;

  el.galleryRoot.innerHTML = blocks
    .map(
      (b) => `
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
      </button>`
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
          <td><strong>${formatNumber(b.totalAreaM2, 2)} m²</strong> <span class="cat-count">(${b.slabCount} ks)</span></td>
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

  el.resetBtn.hidden = !hasActiveFilters();

  if (state.view === 'materials') {
    const materials = getFilteredMaterials();
    const totalBlocks = materials.reduce((acc, m) => acc + m.blockCount, 0);
    const totalSlabs = materials.reduce((acc, m) => acc + m.totalSlabs, 0);
    const totalArea = materials.reduce((acc, m) => acc + m.totalAreaM2, 0);

    el.resultsSummary.textContent = `Zobrazeno ${materials.length} materiálů (${totalBlocks} bloků · ${totalSlabs} desek · ${formatNumber(totalArea, 2)} m²)`;
    el.emptyState.hidden = materials.length > 0;
    if (materials.length > 0) {
      renderMaterialsCards(materials);
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
        renderBlockCards(blocks);
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

function openMaterialModal(slug, focusBlock = null) {
  const mat = state.data?.materials.find((m) => m.slug === slug);
  if (!mat) return;

  const images = mat.galleryImages;
  let initialIdx = 0;
  if (focusBlock) {
    const foundIdx = images.findIndex((img) => img.blockNumber === focusBlock);
    if (foundIdx >= 0) initialIdx = foundIdx;
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

  el.modalBody.innerHTML = `
    <div class="modal-hero">
      ${galleryHtml}
      <div class="modal-meta">
        <div class="meta-badges">
          <span class="meta-tag">${escapeHtml(mat.categoryLabel)}</span>
          ${mat.origin ? `<span class="meta-tag">Původ: ${escapeHtml(mat.origin)}</span>` : ''}
          ${mat.colors.map((c) => `<span class="meta-tag">${escapeHtml(c.label)}</span>`).join('')}
        </div>
        <h2 id="modal-title">${escapeHtml(mat.name)}</h2>
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
            Poptat materiál u Stone Connection ↗
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

    <h3 class="blocks-section-title">Skladové bloky a jednotlivé desky (${mat.blockCount})</h3>
    ${blocksHtml}
  `;

  state.lightboxImages = images;
  el.modal.hidden = false;
  document.body.style.overflow = 'hidden';

  if (window.location.hash !== `#m=${slug}`) {
    history.replaceState(null, '', `#m=${slug}`);
  }

  // Modal internal listeners
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
      if (!images.length) return;
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
}

function closeModal() {
  el.modal.hidden = true;
  document.body.style.overflow = '';
  if (window.location.hash.startsWith('#m=')) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}

function openLightbox(index) {
  if (!state.lightboxImages.length) return;
  state.lightboxIndex = (index + state.lightboxImages.length) % state.lightboxImages.length;
  const img = state.lightboxImages[state.lightboxIndex];
  el.lbImg.src = img.fullUrl;
  el.lbImg.alt = img.label;
  el.lbCaption.textContent = `${img.label} (${state.lightboxIndex + 1} / ${state.lightboxImages.length})`;
  el.lbPrev.hidden = state.lightboxImages.length <= 1;
  el.lbNext.hidden = state.lightboxImages.length <= 1;
  el.lightbox.hidden = false;
}

function closeLightbox() {
  el.lightbox.hidden = true;
}

function resetAllFilters() {
  state.category = '';
  state.search = '';
  state.warehouse = '';
  state.thickness = '';
  state.surface = '';
  state.color = '';
  state.photoOnly = false;

  el.searchInput.value = '';
  el.thicknessFilter.value = '';
  el.surfaceFilter.value = '';
  el.colorFilter.value = '';
  el.photoOnlyToggle.checked = false;

  el.categoryTabs.querySelectorAll('.cat-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-category') === '');
  });
  document.querySelectorAll('.seg-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-warehouse') === '');
  });

  render();
}

function bindEvents() {
  el.categoryTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.cat-tab');
    if (!btn) return;
    state.category = btn.getAttribute('data-category') || '';
    el.categoryTabs.querySelectorAll('.cat-tab').forEach((b) => b.classList.toggle('active', b === btn));
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

  el.colorFilter.addEventListener('change', () => {
    state.color = el.colorFilter.value;
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
    if (state.expandedTableRows.has(id)) {
      state.expandedTableRows.delete(id);
    } else {
      state.expandedTableRows.add(id);
    }
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
    el.syncStamp.textContent = `Stav skladu: ${updated}`;
    el.footerMeta.textContent = `Zdroj aktualizován: ${updated} · Poslední synchronizace náhledu: ${formatDateCs(data.meta.syncedAt)}`;

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
