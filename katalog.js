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

const kState = {
  products: [],
  colors: new Set(),
  types: new Set(),
  apps: new Set(),
  search: '',
  inStockOnly: false,
};

const kEl = {
  colors: document.getElementById('k-colors'),
  types: document.getElementById('k-types'),
  apps: document.getElementById('k-apps'),
  search: document.getElementById('k-search'),
  stockOnly: document.getElementById('k-stock-only'),
  reset: document.getElementById('k-reset'),
  emptyReset: document.getElementById('k-empty-reset'),
  active: document.getElementById('k-active'),
  summary: document.getElementById('k-summary'),
  grid: document.getElementById('k-grid'),
  empty: document.getElementById('k-empty'),
  modal: document.getElementById('k-modal'),
  modalBody: document.getElementById('k-modal-body'),
  modalClose: document.getElementById('k-modal-close'),
};

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fold(v) {
  return String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function populateKatalogFilters() {
  const cc = new Map();
  const tc = new Map();
  const ac = new Map();

  for (const p of kState.products) {
    p.colors.forEach((c) => cc.set(c.key, (cc.get(c.key) || 0) + 1));
    tc.set(p.categoryLabel, (tc.get(p.categoryLabel) || 0) + 1);
    p.applications.forEach((a) => ac.set(a, (ac.get(a) || 0) + 1));
  }

  kEl.colors.innerHTML = COLOR_META.filter((c) => cc.has(c.key))
    .map(
      (c) => `
      <label class="check-option">
        <input type="checkbox" data-kfilter="color" value="${esc(c.key)}">
        <span class="swatch-dot" style="background:${esc(c.hex)}"></span>
        <span class="check-label">${esc(c.label)}</span>
        <span class="check-count">${cc.get(c.key)}</span>
      </label>`
    )
    .join('');

  kEl.types.innerHTML = [...tc.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'cs'))
    .map(
      ([t, cnt]) => `
      <label class="check-option">
        <input type="checkbox" data-kfilter="type" value="${esc(t)}">
        <span class="check-label">${esc(t)}</span>
        <span class="check-count">${cnt}</span>
      </label>`
    )
    .join('');

  kEl.apps.innerHTML = [...ac.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'cs'))
    .map(
      ([a, cnt]) => `
      <label class="check-option">
        <input type="checkbox" data-kfilter="app" value="${esc(a)}">
        <span class="check-label">${esc(a)}</span>
        <span class="check-count">${cnt}</span>
      </label>`
    )
    .join('');
}

function renderKatalog() {
  const q = fold(kState.search.trim());
  const list = kState.products.filter((p) => {
    if (kState.colors.size && !p.colors.some((c) => kState.colors.has(c.key))) return false;
    if (kState.types.size && !kState.types.has(p.categoryLabel)) return false;
    if (kState.apps.size && !p.applications.some((a) => kState.apps.has(a))) return false;
    if (kState.inStockOnly && !p.inStockSlug) return false;
    if (q && !fold(p.name).includes(q) && !fold(p.categoryLabel).includes(q) && !fold(p.origin).includes(q)) return false;
    return true;
  });

  const chips = [];
  for (const c of kState.colors) chips.push({ kind: 'color', val: c, label: COLOR_MAP.get(c)?.label || c });
  for (const t of kState.types) chips.push({ kind: 'type', val: t, label: t });
  for (const a of kState.apps) chips.push({ kind: 'app', val: a, label: a });
  if (kState.inStockOnly) chips.push({ kind: 'stock', val: '1', label: 'Pouze skladem' });
  if (q) chips.push({ kind: 'search', val: q, label: `„${kState.search.trim()}“` });

  kEl.reset.hidden = chips.length === 0;
  kEl.active.hidden = chips.length === 0;
  kEl.active.innerHTML = chips
    .map(
      (ch) => `
      <button type="button" class="active-chip" data-kremove="${esc(ch.kind)}" data-kval="${esc(ch.val)}">
        <span>${esc(ch.label)}</span><span aria-hidden="true">×</span>
      </button>`
    )
    .join('');

  kEl.summary.textContent = `${list.length} materiálů`;
  kEl.empty.hidden = list.length > 0;
  kEl.grid.hidden = list.length === 0;

  kEl.grid.innerHTML = list
    .map(
      (p) => `
      <article class="stone-card">
        <button type="button" class="card-media-btn" data-kopen="${esc(p.slug)}" aria-label="${esc(p.name)}">
          ${p.cardUrl ? `<img src="${esc(p.cardUrl)}" alt="${esc(p.name)}" loading="lazy" decoding="async">` : `<div class="card-placeholder"><span>Bez fotografie</span></div>`}
        </button>
        <div class="card-body">
          <h3 class="card-title">${esc(p.name)}</h3>
          <div class="card-sub">${esc(p.categoryLabel)}${p.origin ? ` · ${esc(p.origin)}` : ''}</div>
          <button type="button" class="card-detail-btn" data-kopen="${esc(p.slug)}">Detail</button>
        </div>
      </article>`
    )
    .join('');
}

function openKatalogModal(slug) {
  const p = kState.products.find((x) => x.slug === slug);
  if (!p) return;

  const scenesHtml = p.sceneUrl
    ? `
      <section class="section-block">
        <div class="section-head">
          <h3 class="section-title">Nechte se inspirovat v interiéru</h3>
          <span class="section-sub">Orientační náhled kresby kamene v prostoru</span>
        </div>
        <div class="scenes-grid">
          ${SCENES.map(
            (sc) => `
            <div class="scene-card" style="cursor:default;">
              <div class="scene-stage">
                <img class="scene-base" src="${esc(sc.base)}" alt="${esc(sc.label)} — ${esc(p.name)}" loading="lazy">
                <div class="scene-stone-layer" style="background-image:url('${esc(p.sceneUrl)}');-webkit-mask-image:url('${esc(sc.mask)}');mask-image:url('${esc(sc.mask)}');"></div>
              </div>
              <div class="scene-label">${esc(sc.label)}</div>
            </div>`
          ).join('')}
        </div>
      </section>`
    : '';

  kEl.modalBody.innerHTML = `
    <div class="modal-hero">
      <div class="gallery-main" style="cursor:default;${p.cardUrl ? `background-image:url('${esc(p.cardUrl)}')` : ''}">
        ${p.fullUrl ? `<img src="${esc(p.fullUrl)}" alt="${esc(p.name)}">` : `<div class="card-placeholder"><span>Bez fotografie</span></div>`}
      </div>
      <div class="modal-meta">
        <div class="meta-badges">
          <span class="meta-tag">${esc(p.categoryLabel)}</span>
          ${p.origin ? `<span class="meta-tag">Původ: ${esc(p.origin)}</span>` : ''}
          ${p.colors
            .map((c) => {
              const hex = COLOR_MAP.get(c.key)?.hex || '#78716c';
              return `<span class="meta-tag"><span class="swatch-dot" style="background:${esc(hex)}"></span>${esc(c.label)}</span>`;
            })
            .join('')}
        </div>
        <h2 id="k-modal-title">${esc(p.name)}</h2>
        <p class="stone-comment">${esc(p.comment)}</p>
        <div class="meta-details">
          ${p.applications.length ? `<div><strong>Vhodné použití:</strong> ${esc(p.applications.join(', '))}</div>` : ''}
          <div><strong>Dostupnost na skladu:</strong> ${p.inStockSlug ? `Aktuálně skladem (${p.inStockBlocks} bloků · ${p.inStockSlabs} desek)` : 'Na objednávku'}</div>
        </div>
        <div class="modal-cta-row">
          ${
            p.inStockSlug
              ? `<a href="index.html#m=${esc(p.inStockSlug)}" class="btn-primary">Zobrazit desky na skladu →</a>`
              : ''
          }
          <a href="kontakt.html?material=${encodeURIComponent(p.name)}" class="${p.inStockSlug ? 'btn-secondary' : 'btn-primary'}">
            Poptat materiál →
          </a>
        </div>
      </div>
    </div>
    ${scenesHtml}
  `;

  kEl.modal.hidden = false;
  document.body.style.overflow = 'hidden';
  if (window.location.hash !== `#k=${slug}`) {
    history.replaceState(null, '', `#k=${slug}`);
  }
}

function closeKatalogModal() {
  kEl.modal.hidden = true;
  document.body.style.overflow = '';
  if (window.location.hash.startsWith('#k=')) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}

function resetKatalog() {
  kState.colors.clear();
  kState.types.clear();
  kState.apps.clear();
  kState.search = '';
  kState.inStockOnly = false;
  kEl.search.value = '';
  kEl.stockOnly.checked = false;
  document.querySelectorAll('input[data-kfilter]').forEach((cb) => {
    cb.checked = false;
  });
  renderKatalog();
}

async function initKatalog() {
  document.querySelector('.sidebar-box').addEventListener('change', (e) => {
    const cb = e.target.closest('input[data-kfilter]');
    if (!cb) return;
    const kind = cb.getAttribute('data-kfilter');
    const set = kind === 'color' ? kState.colors : kind === 'type' ? kState.types : kState.apps;
    if (cb.checked) set.add(cb.value);
    else set.delete(cb.value);
    renderKatalog();
  });

  kEl.active.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-kremove]');
    if (!btn) return;
    const kind = btn.getAttribute('data-kremove');
    const val = btn.getAttribute('data-kval');
    if (kind === 'color') kState.colors.delete(val);
    else if (kind === 'type') kState.types.delete(val);
    else if (kind === 'app') kState.apps.delete(val);
    else if (kind === 'stock') {
      kState.inStockOnly = false;
      kEl.stockOnly.checked = false;
    } else if (kind === 'search') {
      kState.search = '';
      kEl.search.value = '';
    }
    document.querySelectorAll('input[data-kfilter]').forEach((cb) => {
      const k = cb.getAttribute('data-kfilter');
      const set = k === 'color' ? kState.colors : k === 'type' ? kState.types : kState.apps;
      cb.checked = set.has(cb.value);
    });
    renderKatalog();
  });

  kEl.search.addEventListener('input', () => {
    kState.search = kEl.search.value;
    renderKatalog();
  });

  kEl.stockOnly.addEventListener('change', () => {
    kState.inStockOnly = kEl.stockOnly.checked;
    renderKatalog();
  });

  kEl.reset.addEventListener('click', resetKatalog);
  kEl.emptyReset.addEventListener('click', resetKatalog);

  kEl.grid.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-kopen]');
    if (btn) openKatalogModal(btn.getAttribute('data-kopen'));
  });

  kEl.modalClose.addEventListener('click', closeKatalogModal);
  kEl.modal.addEventListener('click', (e) => {
    if (e.target === kEl.modal) closeKatalogModal();
  });
  document.addEventListener('keydown', (e) => {
    if (!kEl.modal.hidden && e.key === 'Escape') closeKatalogModal();
  });

  const res = await fetch('data/katalog.json', { cache: 'no-cache' });
  const data = await res.json();
  kState.products = data.products || [];
  populateKatalogFilters();
  renderKatalog();

  if (window.location.hash.startsWith('#k=')) {
    openKatalogModal(window.location.hash.slice(3));
  }
}

initKatalog();
