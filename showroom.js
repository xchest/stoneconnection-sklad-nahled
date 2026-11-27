const SLOT_LABELS = new Map([
  ['va', 'Koupelnový žlab (VA)'],
  ['tables', 'Bistro / konferenční stolky'],
  ['vb', 'Umyvadlo pod desku (VB)'],
  ['vc', 'Umyvadlo na desku (VC)'],
  ['buffet', 'Barový / snídaňový pult'],
  ['hrob', 'Pomník / jednohrob'],
  ['hala', 'Interiérová hala a schodiště'],
  ['terasa', 'Venkovní terasa 60×60'],
  ['schody', 'Venkovní schodiště'],
  ['recepce', 'Prosvětlená recepce'],
  ['foyer', 'Prosvětlený foyer pult'],
  ['koupelna', 'Koupelna velkoformát'],
  ['kuchyne', 'Kuchyně s ostrovem'],
]);

const srState = {
  materials: [],
  scenes: [],
  activeScene: 'va',
  leftSlug: null,
  rightSlug: null,
  splitPct: 50,
  dragging: false,
};

const srEl = {
  tabs: document.getElementById('sr-scene-tabs'),
  compare: document.getElementById('sr-compare'),
  imgLeft: document.getElementById('sr-img-left'),
  imgRight: document.getElementById('sr-img-right'),
  leftClip: document.getElementById('sr-left-clip'),
  divider: document.getElementById('sr-divider'),
  badgeLeft: document.getElementById('sr-badge-left'),
  badgeRight: document.getElementById('sr-badge-right'),
  infoLeft: document.getElementById('sr-info-left'),
  infoRight: document.getElementById('sr-info-right'),
  listLeft: document.getElementById('sr-list-left'),
  listRight: document.getElementById('sr-list-right'),
  leftCount: document.getElementById('sr-left-count'),
  rightCount: document.getElementById('sr-right-count'),
};

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseHash() {
  const out = {};
  const raw = window.location.hash.replace(/^#/, '');
  for (const part of raw.split('&')) {
    const [k, v] = part.split('=');
    if (k && v) out[k] = decodeURIComponent(v);
  }
  return out;
}

function syncHash() {
  if (!srState.activeScene) return;
  const h = `#scene=${encodeURIComponent(srState.activeScene)}&a=${encodeURIComponent(srState.leftSlug || '')}&b=${encodeURIComponent(srState.rightSlug || '')}`;
  if (window.location.hash !== h) {
    history.replaceState(null, '', h);
  }
}

function setSplit(pct) {
  const clamped = Math.max(4, Math.min(96, pct));
  srState.splitPct = clamped;
  srEl.leftClip.style.clipPath = `inset(0 ${100 - clamped}% 0 0)`;
  srEl.divider.style.left = `${clamped}%`;
  srEl.compare.setAttribute('aria-valuenow', String(Math.round(clamped)));
}

function getItemsForScene(slotKey) {
  return srState.materials
    .map((m) => {
      const viz = (m.demoVisualizations || []).find((v) => v.slot === slotKey);
      return viz ? { mat: m, viz } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.mat.name.localeCompare(b.mat.name, 'cs'));
}

function renderShowroom() {
  srEl.tabs.innerHTML = srState.scenes
    .map(
      (sc) => `
      <button type="button" class="real-pill${sc.key === srState.activeScene ? ' active' : ''}" data-sr-scene="${esc(sc.key)}" role="tab" aria-selected="${sc.key === srState.activeScene ? 'true' : 'false'}">
        ${esc(sc.label)} (${sc.count})
      </button>`
    )
    .join('');

  const items = getItemsForScene(srState.activeScene);
  if (!items.length) return;

  if (!items.some((i) => i.mat.slug === srState.leftSlug)) {
    srState.leftSlug = items[0].mat.slug;
  }
  if (!items.some((i) => i.mat.slug === srState.rightSlug) || (items.length > 1 && srState.rightSlug === srState.leftSlug)) {
    const alt = items.find((i) => i.mat.slug !== srState.leftSlug);
    srState.rightSlug = alt ? alt.mat.slug : items[0].mat.slug;
  }

  const leftItem = items.find((i) => i.mat.slug === srState.leftSlug) || items[0];
  const rightItem = items.find((i) => i.mat.slug === srState.rightSlug) || items[Math.min(1, items.length - 1)];

  srEl.imgLeft.src = leftItem.viz.url;
  srEl.imgLeft.alt = `${leftItem.mat.name} — ${leftItem.viz.label}`;
  srEl.imgRight.src = rightItem.viz.url;
  srEl.imgRight.alt = `${rightItem.mat.name} — ${rightItem.viz.label}`;

  srEl.badgeLeft.innerHTML = `<span class="sr-side-tag">Vlevo</span> <strong>${esc(leftItem.mat.name)}</strong>`;
  srEl.badgeRight.innerHTML = `<span class="sr-side-tag">Vpravo</span> <strong>${esc(rightItem.mat.name)}</strong>`;

  const renderInfoCard = (item, sideLabel) => {
    const m = item.mat;
    const fmt = m.maxLengthCm && m.maxHeightCm ? `desky až ${m.maxLengthCm} × ${m.maxHeightCm} cm` : '';
    return `
      <div class="sr-info-meta">
        <div class="sr-info-eyebrow">${esc(sideLabel)} · ${esc(m.categoryLabel)}</div>
        <strong>${esc(m.name)}</strong>
        <span>${m.blockCount} bloků · ${m.totalSlabs} desek${fmt ? ` · ${fmt}` : ''}</span>
      </div>
      <div class="sr-info-actions">
        <a href="index.html#m=${esc(m.slug)}" class="btn-secondary">Detail ve skladu →</a>
      </div>`;
  };
  srEl.infoLeft.innerHTML = renderInfoCard(leftItem, 'Materiál A (vlevo)');
  srEl.infoRight.innerHTML = renderInfoCard(rightItem, 'Materiál B (vpravo)');

  srEl.leftCount.textContent = `(${items.length})`;
  srEl.rightCount.textContent = `(${items.length})`;

  const renderSwatchList = (selectedSlug, sideAttr) =>
    items
      .map((it) => {
        const m = it.mat;
        const thumb = m.detailSwatchUrl || m.cardImage || it.viz.url;
        const isActive = m.slug === selectedSlug;
        return `
        <button type="button" class="sr-swatch-btn${isActive ? ' active' : ''}" data-${sideAttr}="${esc(m.slug)}">
          <img src="${esc(thumb)}" alt="${esc(m.name)}" loading="lazy">
          <span class="sr-swatch-text">
            <strong>${esc(m.name)}</strong>
            <small>${esc(m.categoryLabel)} · ${m.totalSlabs} desek</small>
          </span>
        </button>`;
      })
      .join('');

  srEl.listLeft.innerHTML = renderSwatchList(leftItem.mat.slug, 'sr-left');
  srEl.listRight.innerHTML = renderSwatchList(rightItem.mat.slug, 'sr-right');

  syncHash();
}

function updateSplitFromPointer(clientX) {
  const rect = srEl.compare.getBoundingClientRect();
  if (!rect.width) return;
  const pct = ((clientX - rect.left) / rect.width) * 100;
  setSplit(pct);
}

function bindShowroomEvents() {
  srEl.tabs.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-sr-scene]');
    if (!btn) return;
    srState.activeScene = btn.getAttribute('data-sr-scene');
    renderShowroom();
  });

  srEl.listLeft.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-sr-left]');
    if (!btn) return;
    srState.leftSlug = btn.getAttribute('data-sr-left');
    renderShowroom();
  });

  srEl.listRight.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-sr-right]');
    if (!btn) return;
    srState.rightSlug = btn.getAttribute('data-sr-right');
    renderShowroom();
  });

  srEl.compare.addEventListener('pointerdown', (e) => {
    srState.dragging = true;
    srEl.compare.setPointerCapture(e.pointerId);
    updateSplitFromPointer(e.clientX);
  });

  srEl.compare.addEventListener('pointermove', (e) => {
    if (!srState.dragging) return;
    updateSplitFromPointer(e.clientX);
  });

  const stopDrag = () => {
    srState.dragging = false;
  };
  srEl.compare.addEventListener('pointerup', stopDrag);
  srEl.compare.addEventListener('pointercancel', stopDrag);

  srEl.compare.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setSplit(srState.splitPct - 5);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setSplit(srState.splitPct + 5);
    }
  });
}

async function initShowroom() {
  bindShowroomEvents();
  setSplit(50);

  const res = await fetch('data/sklad.json', { cache: 'no-cache' });
  if (!res.ok) return;
  const data = await res.json();
  srState.materials = (data.materials || []).filter((m) => (m.demoVisualizations || []).length > 0);

  const slotCounts = new Map();
  for (const m of srState.materials) {
    for (const v of m.demoVisualizations || []) {
      if (!v.slot) continue;
      slotCounts.set(v.slot, (slotCounts.get(v.slot) || 0) + 1);
    }
  }

  srState.scenes = [...SLOT_LABELS.entries()]
    .filter(([key]) => (slotCounts.get(key) || 0) >= 2)
    .map(([key, label]) => ({ key, label, count: slotCounts.get(key) }));

  if (!srState.scenes.length) {
    srState.scenes = [...slotCounts.entries()].map(([key, count]) => ({
      key,
      label: SLOT_LABELS.get(key) || key,
      count,
    }));
  }

  const hash = parseHash();
  if (hash.scene && srState.scenes.some((s) => s.key === hash.scene)) {
    srState.activeScene = hash.scene;
  } else if (srState.scenes.length) {
    srState.activeScene = srState.scenes[0].key;
  }
  if (hash.a) srState.leftSlug = hash.a;
  if (hash.b) srState.rightSlug = hash.b;

  renderShowroom();
}

initShowroom();
