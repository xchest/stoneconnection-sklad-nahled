(() => {
  const LS_USER = 'sc_b2b_user_v1';
  const LS_ACCOUNTS = 'sc_b2b_accounts_v1';
  const LS_CART = 'sc_b2b_cart_v1';
  const LS_ORDERS = 'sc_b2b_orders_v1';

  const DARK_GABBRO_SLUGS = new Set([
    'absolut-black-w',
    'nero-assoluto-zimbabwe',
    'nero-impala',
    'regal-black',
    'star-galaxy',
    'mist-black',
    'premium-black',
    'nero-angola',
    'nero-cohiba',
  ]);

  const DENSITY_BY_CATEGORY = {
    zula: 2750,
    mramor: 2700,
    onyx: 2700,
    vapenec: 2650,
    kvarcit: 2650,
    travertin: 2500,
    keramika: 2450,
    ostatni: 2700,
  };

  const FRAGILE_CATEGORIES = new Set(['mramor', 'kvarcit', 'onyx', 'travertin', 'keramika']);

  const DEMO_ACCOUNT = {
    email: 'kamenik@ukazka.cz',
    pass: 'stone2026',
    ico: '26827301',
    companyName: 'Kamenictví Ukázka s.r.o.',
    dic: 'CZ26827301',
    address: 'Průmyslová 408, 756 61 Rožnov pod Radhoštěm',
    contactName: 'Jan Novák',
    phone: '+420 603 123 456',
    isDemo: true,
  };

  function esc(v) {
    return String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatNumber(n, decimals = 0) {
    return new Intl.NumberFormat('cs-CZ', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(n);
  }

  function getDensityKgM3(categoryKey, slug) {
    if (slug && DARK_GABBRO_SLUGS.has(slug)) return 2950;
    return DENSITY_BY_CATEGORY[categoryKey] || 2700;
  }

  function calcSlabWeightKg(slab, categoryKey, slug) {
    const area = Number(slab?.areaM2) || ((Number(slab?.length) || 0) * (Number(slab?.height) || 0)) / 10000;
    const thickCm = Number(slab?.thickness) || 0;
    const density = getDensityKgM3(categoryKey, slug);
    return Math.round(area * (thickCm / 100) * density * 10) / 10;
  }

  function calcBlockWeightKg(block) {
    if (!block?.slabs?.length) return 0;
    let sum = 0;
    for (const s of block.slabs) {
      sum += calcSlabWeightKg(s, block.categoryKey, block.materialSlug);
    }
    return Math.round(sum * 10) / 10;
  }

  function calcMaterialWeightKg(mat) {
    if (!mat?.blocks?.length) return 0;
    let sum = 0;
    for (const b of mat.blocks) {
      sum += calcBlockWeightKg(b);
    }
    return Math.round(sum * 10) / 10;
  }

  function formatWeight(kg, showTonAlways = false) {
    const rounded = Math.round(Number(kg) || 0);
    if (rounded >= 1000 || showTonAlways) {
      const tons = rounded / 1000;
      return `${formatNumber(rounded)} kg (${formatNumber(tons, 2)} t)`;
    }
    return `${formatNumber(rounded)} kg`;
  }

  function classifyTransport(totalKg) {
    const kg = Number(totalKg) || 0;
    if (kg <= 0) {
      return { label: 'Zatím bez vybraných desek', hint: 'Přidejte desky nebo celé bloky pro výpočet hmotnosti.', pct: 0, tone: 'ok' };
    }
    if (kg <= 1200) {
      return {
        label: 'Dodávka / přívěsný vozík (do 1,2 t)',
        hint: 'Vhodné pro lehkou dodávku nebo jednoosý přívěs se stojanem.',
        pct: Math.max(8, Math.round((kg / 1200) * 100)),
        tone: 'ok',
      };
    }
    if (kg <= 3500) {
      return {
        label: 'Dodávka se stojanem / vlek do 3,5 t',
        hint: 'Zkontrolujte užitečnou nosnost vozidla a upevnění A-rámu.',
        pct: Math.min(100, Math.round((kg / 3500) * 100)),
        tone: 'mid',
      };
    }
    if (kg <= 12000) {
      return {
        label: 'Nákladní auto / vozidlo s hydraulickou rukou (3,5–12 t)',
        hint: 'Doporučujeme nákladní automobil vybavený A-stojany a kurty.',
        pct: Math.min(100, Math.round((kg / 12000) * 100)),
        tone: 'warn',
      };
    }
    return {
      label: 'Kamion / tahač se stojany (nad 12 t)',
      hint: 'Objem odpovídá kamionové přepravě — nutná koordinace nakládky jeřábem.',
      pct: Math.min(100, Math.round((kg / 24000) * 100)),
      tone: 'heavy',
    };
  }

  function formatAresAddress(sidlo) {
    if (!sidlo) return '';
    if (sidlo.textovaAdresa) return sidlo.textovaAdresa;
    const ulice = sidlo.nazevUlice || sidlo.nazevCastiObce || sidlo.nazevObce || '';
    const cp = sidlo.cisloDomovni ? String(sidlo.cisloDomovni) : '';
    const co = sidlo.cisloOrientacni ? `/${sidlo.cisloOrientacni}` : '';
    const street = [ulice, `${cp}${co}`.trim()].filter(Boolean).join(' ');
    const city = [sidlo.psc ? String(sidlo.psc) : '', sidlo.nazevObce || ''].filter(Boolean).join(' ');
    return [street, city].filter(Boolean).join(', ');
  }

  async function lookupAresByIco(rawIco) {
    const ico = String(rawIco || '').replace(/\D+/g, '');
    if (ico.length !== 8) {
      throw new Error('Zadejte platné 8místné IČO.');
    }
    let res;
    try {
      res = await fetch(`https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/${ico}`, {
        headers: { Accept: 'application/json' },
      });
    } catch {
      throw new Error('Registr ARES je dočasně nedostupný — údaje můžete vyplnit ručně.');
    }
    if (res.status === 404) {
      throw new Error(`Subjekt s IČO ${ico} nebyl v registru ARES nalezen.`);
    }
    if (!res.ok) {
      throw new Error(`Chyba registru ARES (HTTP ${res.status}). Údaje můžete doplnit ručně.`);
    }
    const data = await res.json();
    const sidlo = data.sidlo || {};
    return {
      ico: data.ico || ico,
      companyName: data.obchodniJmeno || '',
      dic: data.dic || '',
      address: formatAresAddress(sidlo),
      city: sidlo.nazevObce || '',
      zip: sidlo.psc ? String(sidlo.psc) : '',
    };
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch {
      // Ignore storage quota issues gracefully
    }
  }

  function emitChange() {
    renderBar();
    window.dispatchEvent(new CustomEvent('sc-b2b-change'));
  }

  function getUser() {
    const u = readJson(LS_USER, null);
    return u && u.email ? u : null;
  }

  function isLoggedIn() {
    return Boolean(getUser());
  }

  function getAccounts() {
    const list = readJson(LS_ACCOUNTS, []);
    return Array.isArray(list) ? list : [];
  }

  function login(email, password) {
    const em = String(email || '').trim().toLowerCase();
    const pw = String(password || '');
    if (!em || !pw) throw new Error('Vyplňte e-mail a heslo.');
    if (em === DEMO_ACCOUNT.email && pw === DEMO_ACCOUNT.pass) {
      const { pass: _omit, ...profile } = DEMO_ACCOUNT;
      writeJson(LS_USER, profile);
      emitChange();
      return profile;
    }
    const found = getAccounts().find((a) => a.email?.toLowerCase() === em && a.pass === pw);
    if (!found) {
      throw new Error('Neplatný e-mail nebo heslo. Pro ukázku můžete použít tlačítko Rychlé demo přihlášení.');
    }
    const { pass: _omit, ...profile } = found;
    writeJson(LS_USER, profile);
    emitChange();
    return profile;
  }

  function loginDemo() {
    const { pass: _omit, ...profile } = DEMO_ACCOUNT;
    writeJson(LS_USER, profile);
    emitChange();
    return profile;
  }

  function registerAndLogin(input) {
    const ico = String(input.ico || '').replace(/\D+/g, '');
    const companyName = String(input.companyName || '').trim();
    const address = String(input.address || '').trim();
    const contactName = String(input.contactName || '').trim();
    const email = String(input.email || '').trim().toLowerCase();
    const phone = String(input.phone || '').trim();
    const dic = String(input.dic || '').trim();
    const pass = String(input.pass || '');
    if (ico.length !== 8) throw new Error('Zadejte platné 8místné IČO.');
    if (!companyName || !address) throw new Error('Doplňte název firmy a sídlo (lze načíst z ARES).');
    if (!contactName || !email || !phone) throw new Error('Vyplňte kontaktní osobu, e-mail a telefon.');
    if (pass.length < 4) throw new Error('Heslo musí mít alespoň 4 znaky.');

    const account = { ico, companyName, dic, address, contactName, email, phone, pass };
    const accounts = getAccounts().filter((a) => a.email?.toLowerCase() !== email);
    accounts.push(account);
    writeJson(LS_ACCOUNTS, accounts);

    const { pass: _omit, ...profile } = account;
    writeJson(LS_USER, profile);
    emitChange();
    return profile;
  }

  function logout() {
    try {
      localStorage.removeItem(LS_USER);
    } catch {
      // Ignore
    }
    emitChange();
  }

  function getCart() {
    const items = readJson(LS_CART, []);
    return Array.isArray(items) ? items : [];
  }

  function makeSlabKey(blockId, slabIdx) {
    return `${blockId}#${slabIdx}`;
  }

  function hasItem(key) {
    return getCart().some((it) => it.key === key);
  }

  function createCartItem(mat, block, slab, slabIdx) {
    const key = makeSlabKey(block.id, slabIdx);
    const areaM2 = Number(slab.areaM2) || ((Number(slab.length) || 0) * (Number(slab.height) || 0)) / 10000;
    const weightKg = calcSlabWeightKg(slab, block.categoryKey || mat.categoryKey, block.materialSlug || mat.slug);
    return {
      key,
      materialSlug: mat?.slug || block.materialSlug,
      materialName: mat?.name || block.materialName,
      categoryKey: mat?.categoryKey || block.categoryKey || 'ostatni',
      categoryLabel: mat?.categoryLabel || block.categoryLabel || '',
      blockId: block.id,
      blockNumber: block.blockNumber,
      slabIdx,
      length: Number(slab.length) || 0,
      height: Number(slab.height) || 0,
      thickness: Number(slab.thickness) || 0,
      surface: slab.surface || '',
      warehouse: slab.warehouse || block.warehouses?.[0] || 'Praha',
      areaM2: Math.round(areaM2 * 100) / 100,
      weightKg,
    };
  }

  function addSlab(mat, block, slab, slabIdx) {
    if (!isLoggedIn()) {
      openAuth('login');
      return { added: false, reason: 'auth' };
    }
    const cart = getCart();
    const key = makeSlabKey(block.id, slabIdx);
    const existingIdx = cart.findIndex((it) => it.key === key);
    if (existingIdx >= 0) {
      cart.splice(existingIdx, 1);
      writeJson(LS_CART, cart);
      emitChange();
      return { added: false, removed: true };
    }
    cart.push(createCartItem(mat, block, slab, slabIdx));
    writeJson(LS_CART, cart);
    emitChange();
    return { added: true, removed: false };
  }

  function addBlock(mat, block) {
    if (!isLoggedIn()) {
      openAuth('login');
      return { addedCount: 0, reason: 'auth' };
    }
    const cart = getCart();
    const existing = new Set(cart.map((it) => it.key));
    let addedCount = 0;
    (block.slabs || []).forEach((slab, idx) => {
      const key = makeSlabKey(block.id, idx);
      if (!existing.has(key)) {
        cart.push(createCartItem(mat, block, slab, idx));
        existing.add(key);
        addedCount += 1;
      }
    });
    if (addedCount > 0) {
      writeJson(LS_CART, cart);
      emitChange();
    }
    return { addedCount, totalInBlock: (block.slabs || []).length };
  }

  function addBlockThickness(mat, block, thickness) {
    if (!isLoggedIn()) {
      openAuth('login');
      return { addedCount: 0, reason: 'auth' };
    }
    const targetThick = Number(thickness);
    const cart = getCart();
    const existing = new Set(cart.map((it) => it.key));
    let addedCount = 0;
    let totalInGroup = 0;
    (block.slabs || []).forEach((slab, idx) => {
      if (Math.abs(Number(slab.thickness) - targetThick) < 0.01) {
        totalInGroup += 1;
        const key = makeSlabKey(block.id, idx);
        if (!existing.has(key)) {
          cart.push(createCartItem(mat, block, slab, idx));
          existing.add(key);
          addedCount += 1;
        }
      }
    });
    if (addedCount > 0) {
      writeJson(LS_CART, cart);
      emitChange();
    }
    return { addedCount, totalInGroup, thickness: targetThick };
  }

  function removeItem(key) {
    const cart = getCart().filter((it) => it.key !== key);
    writeJson(LS_CART, cart);
    emitChange();
  }

  function clearCart() {
    writeJson(LS_CART, []);
    emitChange();
  }

  function getCartSummary() {
    const items = getCart();
    let totalAreaM2 = 0;
    let totalWeightKg = 0;
    let hasFragileOrThin = false;
    const byWarehouseMap = new Map();

    for (const it of items) {
      totalAreaM2 += Number(it.areaM2) || 0;
      totalWeightKg += Number(it.weightKg) || 0;
      if (it.thickness <= 2 || FRAGILE_CATEGORIES.has(it.categoryKey)) {
        hasFragileOrThin = true;
      }
      const wh = it.warehouse || 'Praha';
      if (!byWarehouseMap.has(wh)) {
        byWarehouseMap.set(wh, { warehouse: wh, count: 0, areaM2: 0, weightKg: 0, items: [] });
      }
      const bucket = byWarehouseMap.get(wh);
      bucket.count += 1;
      bucket.areaM2 += Number(it.areaM2) || 0;
      bucket.weightKg += Number(it.weightKg) || 0;
      bucket.items.push(it);
    }

    const byWarehouse = [...byWarehouseMap.values()].sort((a, b) => a.warehouse.localeCompare(b.warehouse, 'cs'));
    return {
      items,
      count: items.length,
      totalAreaM2: Math.round(totalAreaM2 * 100) / 100,
      totalWeightKg: Math.round(totalWeightKg * 10) / 10,
      byWarehouse,
      hasFragileOrThin,
      transport: classifyTransport(totalWeightKg),
    };
  }

  function nextBusinessDayIso() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    while (d.getDay() === 0 || d.getDay() === 6) {
      d.setDate(d.getDate() + 1);
    }
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function todayIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function syncFloatingVisibility() {
    const fl = document.getElementById('b2b-floating-cart');
    const authM = document.getElementById('b2b-auth-modal');
    const orderM = document.getElementById('b2b-order-modal');
    const modalOpen = Boolean((authM && !authM.hidden) || (orderM && !orderM.hidden));
    const show = isLoggedIn() && !modalOpen;
    if (fl) fl.hidden = !show;
    document.body?.classList?.toggle('b2b-has-floating-cart', show);
  }

  function renderFloatingCart() {
    const fl = document.getElementById('b2b-floating-cart');
    if (!fl) {
      document.body?.classList?.toggle('b2b-has-floating-cart', false);
      return;
    }
    if (!isLoggedIn()) {
      fl.hidden = true;
      fl.innerHTML = '';
      document.body?.classList?.toggle('b2b-has-floating-cart', false);
      return;
    }

    const summary = getCartSummary();
    const blockCount = new Set(summary.items.map((it) => it.blockId)).size;
    const whText = summary.byWarehouse.map((g) => `${g.warehouse}: ${g.count} ks`).join(' · ');
    const blockWord = blockCount === 1 ? 'blok' : blockCount <= 4 ? 'bloky' : 'bloků';

    fl.innerHTML = `
      <div class="b2b-float-inner">
        <div class="b2b-float-info">
          <span class="b2b-float-badge${summary.count === 0 ? ' empty' : ''}">${summary.count} ks</span>
          <div class="b2b-float-text">
            ${
              summary.count > 0
                ? `<strong>Objednávka deskoviny · ${formatNumber(summary.totalAreaM2, 2)} m² · ⚖ ${esc(formatWeight(summary.totalWeightKg, true))}</strong>
                   <span>${esc(whText)} · ${blockCount} ${blockWord} · ${esc(summary.transport.label)}</span>`
                : `<strong>B2B objednávka deskoviny</strong>
                   <span>Vyberte jednotlivé desky, celé síly nebo bloky níže</span>`
            }
          </div>
        </div>
        <div class="b2b-float-actions">
          <button type="button" class="b2b-float-cta" data-b2b-open-order>
            ${summary.count > 0 ? 'Otevřít objednávku →' : 'Košík (0 ks)'}
          </button>
        </div>
      </div>`;

    syncFloatingVisibility();
  }

  function renderBar() {
    const host = document.getElementById('b2b-bar');
    const user = getUser();
    if (!host) {
      renderFloatingCart();
      return;
    }
    const summary = getCartSummary();

    if (!user) {
      host.innerHTML = `
        <div class="b2b-bar-inner">
          <span class="b2b-status-note">Skladové bloky a objednávka deskoviny jsou dostupné po přihlášení kameníka.</span>
          <div class="b2b-actions">
            <button type="button" class="btn-secondary b2b-login-btn" data-b2b-open-auth="login">
              🔒 Přihlášení pro kameníky (B2B)
            </button>
            <button type="button" class="btn-secondary b2b-demo-pill" data-b2b-demo-login>
              Rychlé demo
            </button>
          </div>
        </div>`;
      renderFloatingCart();
      return;
    }

    const cartWeightLabel = summary.count > 0 ? ` · ${formatWeight(summary.totalWeightKg)}` : '';
    host.innerHTML = `
      <div class="b2b-bar-inner logged-in">
        <div class="b2b-user-pill">
          <span class="b2b-dot"></span>
          <span><strong>${esc(user.companyName)}</strong> · IČO ${esc(user.ico)}</span>
        </div>
        <div class="b2b-actions">
          <button type="button" class="btn-primary b2b-cart-btn${summary.count ? ' has-items' : ''}" data-b2b-open-order>
            Objednávka deskoviny (${summary.count} ks${esc(cartWeightLabel)})
          </button>
          <button type="button" class="btn-secondary b2b-logout-btn" data-b2b-logout>
            Odhlásit
          </button>
        </div>
      </div>`;
    renderFloatingCart();
  }

  function renderLockCard(context, mat = null) {
    const metaLine = mat
      ? `U materiálu <strong>${esc(mat.name)}</strong> je aktuálně skladem <strong>${mat.blockCount} bloků (${mat.totalSlabs} ks, ${formatNumber(mat.totalAreaM2, 2)} m²)</strong> ve skladech ${esc(mat.warehouses.join(', '))}.`
      : 'Detailní čísla bloků, přesné rozměry jednotlivých desek, výpočet hmotnosti v kg/t a přímá objednávka nakládky jsou určeny pro registrované kameníky a B2B partnery.';

    const title =
      context === 'table'
        ? 'Tabulka skladových bloků je uzamčena pro B2B kameníky'
        : 'Přehled skladových bloků a objednávka desek (B2B)';

    return `
      <div class="b2b-lock-card">
        <div class="b2b-lock-icon" aria-hidden="true">🔒</div>
        <div class="b2b-lock-content">
          <h3>${title}</h3>
          <p>${metaLine}</p>
          <p class="b2b-lock-sub">Po přihlášení nebo registraci firmy přes ARES (stačí IČO) uvidíte všechna čísla bloků, hmotnost každé desky a můžete rovnou objednat nakládku s časem příjezdu, telefonem na řidiče a uložením ve stojanu nebo naležato.</p>
          <div class="b2b-lock-actions">
            <button type="button" class="btn-primary" data-b2b-open-auth="login">Přihlásit se / Registrovat firmu (ARES)</button>
            <button type="button" class="btn-secondary" data-b2b-demo-login>Rychlé demo přihlášení (kameník)</button>
          </div>
        </div>
      </div>`;
  }

  function closeModals() {
    const authM = document.getElementById('b2b-auth-modal');
    const orderM = document.getElementById('b2b-order-modal');
    if (authM) authM.hidden = true;
    if (orderM) orderM.hidden = true;
    const detailM = document.getElementById('detail-modal');
    if (!detailM || detailM.hidden) {
      document.body.style.overflow = '';
    }
    syncFloatingVisibility();
  }

  function openAuth(defaultTab = 'login') {
    const modal = document.getElementById('b2b-auth-modal');
    if (!modal) return;
    let activeTab = defaultTab === 'register' ? 'register' : 'login';

    const draw = () => {
      modal.innerHTML = `
        <div class="modal-dialog b2b-modal-dialog">
          <button type="button" class="modal-close" data-b2b-close aria-label="Zavřít přihlášení">✕</button>
          <div class="modal-scroll b2b-modal-body">
            <h2 id="b2b-auth-title" style="margin:0 0 6px;font-family:var(--font-display);font-size:24px;">B2B zóna pro kameníky</h2>
            <p style="margin:0 0 16px;color:var(--text-muted);font-size:13.5px;">Přístup ke skladovým blokům, přesné hmotnosti desek a objednávce nakládky.</p>

            <div class="b2b-tabs" role="tablist">
              <button type="button" class="b2b-tab${activeTab === 'login' ? ' active' : ''}" data-auth-tab="login">Přihlášení</button>
              <button type="button" class="b2b-tab${activeTab === 'register' ? ' active' : ''}" data-auth-tab="register">Registrace firmy (ARES)</button>
            </div>

            <div id="b2b-auth-err" class="b2b-alert-err" hidden></div>

            ${
              activeTab === 'login'
                ? `
              <form id="b2b-login-form" class="form-grid" style="margin-top:14px;">
                <div class="form-field">
                  <label for="b2b-login-email">E-mail *</label>
                  <input type="email" id="b2b-login-email" required value="${esc(DEMO_ACCOUNT.email)}">
                </div>
                <div class="form-field">
                  <label for="b2b-login-pass">Heslo *</label>
                  <input type="password" id="b2b-login-pass" required value="${esc(DEMO_ACCOUNT.pass)}">
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:4px;">
                  <button type="submit" class="btn-primary">Přihlásit se</button>
                  <button type="button" class="btn-secondary" id="b2b-demo-btn">Rychlé demo (Kamenictví Ukázka)</button>
                </div>
              </form>`
                : `
              <form id="b2b-reg-form" class="form-grid" style="margin-top:14px;">
                <div class="form-field">
                  <label for="b2b-reg-ico">IČO firmy (načtení z ARES) *</label>
                  <div class="ares-row">
                    <input type="text" id="b2b-reg-ico" inputmode="numeric" maxlength="12" placeholder="Např. 26827301" required>
                    <button type="button" class="btn-secondary" id="b2b-reg-ares-btn">Načíst z ARES</button>
                  </div>
                  <div id="b2b-reg-ares-status" class="ares-status" aria-live="polite"></div>
                </div>
                <div class="form-field">
                  <label for="b2b-reg-company">Obchodní firma *</label>
                  <input type="text" id="b2b-reg-company" required placeholder="Název společnosti / OSVČ">
                </div>
                <div class="b2b-grid-2">
                  <div class="form-field">
                    <label for="b2b-reg-dic">DIČ</label>
                    <input type="text" id="b2b-reg-dic" placeholder="CZ... (nepovinné)">
                  </div>
                  <div class="form-field">
                    <label for="b2b-reg-contact">Kontaktní osoba *</label>
                    <input type="text" id="b2b-reg-contact" required placeholder="Jméno a příjmení">
                  </div>
                </div>
                <div class="form-field">
                  <label for="b2b-reg-addr">Sídlo / fakturační adresa *</label>
                  <input type="text" id="b2b-reg-addr" required placeholder="Ulice, PSČ, město">
                </div>
                <div class="b2b-grid-2">
                  <div class="form-field">
                    <label for="b2b-reg-email">E-mail *</label>
                    <input type="email" id="b2b-reg-email" required placeholder="firma@kamenictvi.cz">
                  </div>
                  <div class="form-field">
                    <label for="b2b-reg-phone">Telefon *</label>
                    <input type="tel" id="b2b-reg-phone" required placeholder="+420 ...">
                  </div>
                </div>
                <div class="form-field">
                  <label for="b2b-reg-pass">Heslo *</label>
                  <input type="password" id="b2b-reg-pass" required minlength="4" placeholder="Min. 4 znaky">
                </div>
                <button type="submit" class="btn-primary" style="justify-self:start;">Zaregistrovat firmu a odemknout sklad</button>
              </form>`
            }

            <p style="margin:18px 0 0;padding-top:12px;border-top:1px solid var(--border);font-size:12px;color:var(--text-muted);">
              Klientský B2B náhled (data uložena v prohlížeči). Vyhledání firmy podle IČO probíhá živě přímo z veřejného registru <strong>ARES</strong> (<code>ares.gov.cz</code>).
            </p>
          </div>
        </div>`;

      modal.querySelectorAll('[data-auth-tab]').forEach((btn) => {
        btn.addEventListener('click', () => {
          activeTab = btn.getAttribute('data-auth-tab');
          draw();
        });
      });

      const showErr = (msg) => {
        const box = document.getElementById('b2b-auth-err');
        if (!box) return;
        box.textContent = msg;
        box.hidden = false;
      };

      const loginForm = document.getElementById('b2b-login-form');
      if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
          e.preventDefault();
          try {
            login(document.getElementById('b2b-login-email').value, document.getElementById('b2b-login-pass').value);
            modal.hidden = true;
            closeModals();
          } catch (err) {
            showErr(err.message);
          }
        });
        document.getElementById('b2b-demo-btn')?.addEventListener('click', () => {
          loginDemo();
          modal.hidden = true;
          closeModals();
        });
      }

      const regForm = document.getElementById('b2b-reg-form');
      if (regForm) {
        const aresBtn = document.getElementById('b2b-reg-ares-btn');
        const aresStatus = document.getElementById('b2b-reg-ares-status');
        aresBtn?.addEventListener('click', async () => {
          const icoInput = document.getElementById('b2b-reg-ico');
          aresBtn.disabled = true;
          aresStatus.textContent = 'Načítám z ARES…';
          aresStatus.className = 'ares-status loading';
          try {
            const info = await lookupAresByIco(icoInput.value);
            icoInput.value = info.ico;
            document.getElementById('b2b-reg-company').value = info.companyName;
            document.getElementById('b2b-reg-dic').value = info.dic;
            document.getElementById('b2b-reg-addr').value = info.address;
            aresStatus.textContent = `✓ Načteno: ${info.companyName}`;
            aresStatus.className = 'ares-status ok';
          } catch (err) {
            aresStatus.textContent = err.message;
            aresStatus.className = 'ares-status err';
          } finally {
            aresBtn.disabled = false;
          }
        });

        regForm.addEventListener('submit', (e) => {
          e.preventDefault();
          try {
            registerAndLogin({
              ico: document.getElementById('b2b-reg-ico').value,
              companyName: document.getElementById('b2b-reg-company').value,
              dic: document.getElementById('b2b-reg-dic').value,
              address: document.getElementById('b2b-reg-addr').value,
              contactName: document.getElementById('b2b-reg-contact').value,
              email: document.getElementById('b2b-reg-email').value,
              phone: document.getElementById('b2b-reg-phone').value,
              pass: document.getElementById('b2b-reg-pass').value,
            });
            modal.hidden = true;
            closeModals();
          } catch (err) {
            showErr(err.message);
          }
        });
      }
    };

    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    syncFloatingVisibility();
    draw();
  }

  function printLoadingSheet(order) {
    const win = window.open('', '_blank', 'width=960,height=1100');
    if (!win) return;
    const modeLabel = order.loadingMode === 'nalezato' ? 'NALEŽATO (na paletě / ložné ploše)' : 'VE STOJANU (A-rám / svisle)';
    const rowsHtml = order.items
      .map(
        (it, i) => `
        <tr>
          <td>${i + 1}</td>
          <td><strong>${esc(it.materialName)}</strong></td>
          <td>${esc(it.blockNumber)}</td>
          <td>${formatNumber(it.length)} × ${formatNumber(it.height)} × ${formatNumber(it.thickness, Number.isInteger(it.thickness) ? 0 : 1)} cm</td>
          <td>${esc(it.surface)}</td>
          <td>${esc(it.warehouse)}</td>
          <td>${formatNumber(it.areaM2, 2)} m²</td>
          <td><strong>${formatNumber(Math.round(it.weightKg))} kg</strong></td>
        </tr>`
      )
      .join('');

    win.document.write(`<!doctype html>
<html lang="cs"><head><meta charset="utf-8">
<title>Objednávka ${esc(order.orderId)} — Nakládací list | Stone Connection</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Inter, Segoe UI, Arial, sans-serif; color: #1c1917; font-size: 12px; line-height: 1.45; }
  .head { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #991b1b; padding-bottom: 8px; margin-bottom: 14px; }
  .brand { font-weight: 700; letter-spacing: 0.08em; font-size: 14px; }
  h1 { margin: 0 0 10px; font-size: 20px; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
  .box { border: 1px solid #d6d3d1; border-radius: 6px; padding: 10px 12px; background: #faf8f5; }
  .box.logistics { border: 2px solid #991b1b; background: #fef2f2; }
  .box h3 { margin: 0 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #57534e; }
  .box.logistics h3 { color: #991b1b; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 11px; }
  th, td { border-bottom: 1px solid #e7e5e4; padding: 5px 6px; text-align: left; }
  th { background: #f5f3ef; text-transform: uppercase; font-size: 10px; color: #57534e; }
  .totals { margin-top: 12px; text-align: right; font-size: 13px; font-weight: 700; }
  .foot { margin-top: 16px; padding-top: 8px; border-top: 1px solid #d6d3d1; font-size: 10.5px; color: #57534e; display: flex; justify-content: space-between; }
</style></head><body>
  <div class="head">
    <div class="brand">STONE CONNECTION CZECH · B2B NAKLÁDACÍ LIST</div>
    <div>Číslo objednávky: <strong>${esc(order.orderId)}</strong></div>
  </div>
  <h1>Objednávka deskoviny a dispozice nakládky</h1>
  <div class="grid-2">
    <div class="box">
      <h3>Odběratel (ARES)</h3>
      <div><strong>${esc(order.buyer.companyName)}</strong></div>
      <div>IČO: ${esc(order.buyer.ico)}${order.buyer.dic ? ` · DIČ: ${esc(order.buyer.dic)}` : ''}</div>
      <div>${esc(order.buyer.address)}</div>
      <div style="margin-top:6px;">Kontakt: ${esc(order.buyer.contactName)} · ${esc(order.buyer.phone)} · ${esc(order.buyer.email)}</div>
    </div>
    <div class="box logistics">
      <h3>Logistika nakládky</h3>
      <div><strong>Kdy přijede:</strong> ${esc(order.arrivalDate)} (${esc(order.arrivalTime)}${order.exactTime ? ` — ${esc(order.exactTime)}` : ''})</div>
      <div><strong>Telefon řidiče:</strong> ${esc(order.driverPhone)}</div>
      ${order.driverVehicle ? `<div><strong>Řidič / SPZ:</strong> ${esc(order.driverVehicle)}</div>` : ''}
      <div style="margin-top:4px;"><strong>Uložení desek:</strong> ${esc(modeLabel)}</div>
      ${order.note ? `<div style="margin-top:4px;"><strong>Poznámka:</strong> ${esc(order.note)}</div>` : ''}
    </div>
  </div>
  <table>
    <thead>
      <tr><th>#</th><th>Materiál</th><th>Blok</th><th>Rozměr</th><th>Povrch</th><th>Sklad</th><th>Plocha</th><th>Hmotnost</th></tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="totals">
    Celkem: ${order.summary.count} ks desek · ${formatNumber(order.summary.totalAreaM2, 2)} m² · ${formatWeight(order.summary.totalWeightKg, true)}
  </div>
  <div class="foot">
    <span>Dodavatel: Stone Connection Czech s.r.o., IČO 26827301</span>
    <span>Vystaveno: ${esc(order.createdAtLabel)}</span>
  </div>
</body></html>`);
    win.document.close();
    win.addEventListener('load', () => {
      setTimeout(() => {
        win.focus();
        win.print();
      }, 300);
    });
  }

  function buildOrderPlainText(order) {
    const modeLabel = order.loadingMode === 'nalezato' ? 'NALEZATO (na palete)' : 'VE STOJANU (A-ram / svisle)';
    const lines = [
      `OBJEDNAVKA DESKOVINY ${order.orderId} — Stone Connection`,
      `Odberatel: ${order.buyer.companyName} | ICO: ${order.buyer.ico}${order.buyer.dic ? ` | DIC: ${order.buyer.dic}` : ''}`,
      `Sidlo: ${order.buyer.address}`,
      `Kontakt: ${order.buyer.contactName}, tel: ${order.buyer.phone}, email: ${order.buyer.email}`,
      `--- LOGISTIKA NAKLADKY ---`,
      `Kdy prijede: ${order.arrivalDate} | Okno: ${order.arrivalTime}${order.exactTime ? ` (${order.exactTime})` : ''}`,
      `Telefon ridice: ${order.driverPhone}${order.driverVehicle ? ` | Ridic/SPZ: ${order.driverVehicle}` : ''}`,
      `Zpusob nalozeni: ${modeLabel}`,
      order.note ? `Poznamka: ${order.note}` : '',
      `--- POLOZKY (${order.summary.count} ks, ${formatNumber(order.summary.totalAreaM2, 2)} m2, ${formatWeight(order.summary.totalWeightKg, true)}) ---`,
      ...order.items.map(
        (it, i) =>
          `${i + 1}. ${it.materialName} | Blok ${it.blockNumber} | ${it.length}x${it.height}x${it.thickness} cm | ${it.surface} | ${it.warehouse} | ${formatNumber(it.areaM2, 2)} m2 | ${Math.round(it.weightKg)} kg`
      ),
    ].filter(Boolean);
    return lines.join('\n');
  }

  function openOrder() {
    if (!isLoggedIn()) {
      openAuth('login');
      return;
    }
    const modal = document.getElementById('b2b-order-modal');
    if (!modal) return;
    let submittedOrder = null;

    const draw = () => {
      const user = getUser();
      const summary = getCartSummary();

      if (submittedOrder) {
        const modeLabel =
          submittedOrder.loadingMode === 'nalezato'
            ? 'Naležato (na paletě / ložné ploše)'
            : 'Ve stojanu (A-rám / svisle)';
        const plain = buildOrderPlainText(submittedOrder);
        const mailtoHref = `mailto:info@stoneconnection.cz?subject=${encodeURIComponent(`Objednávka deskoviny ${submittedOrder.orderId} — ${submittedOrder.buyer.companyName}`)}&body=${encodeURIComponent(plain)}`;

        modal.innerHTML = `
          <div class="modal-dialog b2b-modal-dialog order-drawer">
            <button type="button" class="modal-close" data-b2b-close aria-label="Zavřít objednávku">✕</button>
            <div class="modal-scroll b2b-modal-body">
              <div class="b2b-success-banner">
                <strong>✓ Objednávka ${esc(submittedOrder.orderId)} byla připravena a zaevidována</strong>
                <span>Všechny položky, váha i dispozice pro skladníka jsou připravené k tisku nebo odeslání.</span>
              </div>

              <div class="b2b-grid-2" style="margin-top:14px;">
                <div class="b2b-panel-box">
                  <h4>Odběratel (ARES)</h4>
                  <div><strong>${esc(submittedOrder.buyer.companyName)}</strong></div>
                  <div>IČO: ${esc(submittedOrder.buyer.ico)}${submittedOrder.buyer.dic ? ` · DIČ: ${esc(submittedOrder.buyer.dic)}` : ''}</div>
                  <div>${esc(submittedOrder.buyer.address)}</div>
                  <div style="margin-top:6px;font-size:13px;color:var(--text-muted);">${esc(submittedOrder.buyer.contactName)} · ${esc(submittedOrder.buyer.phone)}</div>
                </div>
                <div class="b2b-panel-box highlight">
                  <h4>Logistika nakládky</h4>
                  <div><strong>Příjezd:</strong> ${esc(submittedOrder.arrivalDate)} · ${esc(submittedOrder.arrivalTime)}${submittedOrder.exactTime ? ` (${esc(submittedOrder.exactTime)})` : ''}</div>
                  <div><strong>Telefon řidiče:</strong> ${esc(submittedOrder.driverPhone)}</div>
                  ${submittedOrder.driverVehicle ? `<div><strong>Řidič / SPZ:</strong> ${esc(submittedOrder.driverVehicle)}</div>` : ''}
                  <div><strong>Uložení desek:</strong> ${esc(modeLabel)}</div>
                </div>
              </div>

              <div class="order-summary-grid" style="margin-top:14px;">
                <div class="kpi-box"><strong>${submittedOrder.summary.count} ks</strong><span>vybraných desek</span></div>
                <div class="kpi-box"><strong>${formatNumber(submittedOrder.summary.totalAreaM2, 2)} m²</strong><span>celková plocha</span></div>
                <div class="kpi-box accent"><strong>${formatWeight(submittedOrder.summary.totalWeightKg, true)}</strong><span>orientační hmotnost</span></div>
              </div>

              <div class="b2b-confirm-actions">
                <button type="button" class="btn-primary" id="b2b-print-order">Tisk / PDF nakládací list ⎙</button>
                <a href="${mailtoHref}" class="btn-secondary">Odeslat e-mailem (info@stoneconnection.cz) →</a>
                <button type="button" class="btn-secondary" id="b2b-copy-order">Zkopírovat text objednávky</button>
                <button type="button" class="btn-secondary" id="b2b-clear-done">Vyprázdnit košík</button>
              </div>
            </div>
          </div>`;

        document.getElementById('b2b-print-order')?.addEventListener('click', () => printLoadingSheet(submittedOrder));
        document.getElementById('b2b-copy-order')?.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(plain);
            document.getElementById('b2b-copy-order').textContent = '✓ Zkopírováno';
          } catch {
            // ignore
          }
        });
        document.getElementById('b2b-clear-done')?.addEventListener('click', () => {
          clearCart();
          submittedOrder = null;
          draw();
        });
        return;
      }

      const byWhHtml = summary.byWarehouse
        .map(
          (bucket) => `
          <div class="b2b-wh-group">
            <div class="b2b-wh-head">
              <span><strong>Sklad ${esc(bucket.warehouse)}</strong> · ${bucket.count} ks · ${formatNumber(bucket.areaM2, 2)} m² · <strong>${formatWeight(bucket.weightKg)}</strong></span>
            </div>
            <div class="slab-table-wrap">
              <table class="slab-table">
                <thead>
                  <tr><th>Materiál</th><th>Blok</th><th>Rozměr</th><th>Povrch</th><th>Plocha</th><th>Hmotnost</th><th></th></tr>
                </thead>
                <tbody>
                  ${bucket.items
                    .map(
                      (it) => `
                    <tr>
                      <td><strong>${esc(it.materialName)}</strong></td>
                      <td>${esc(it.blockNumber)}</td>
                      <td>${formatNumber(it.length)} × ${formatNumber(it.height)} × ${formatNumber(it.thickness, Number.isInteger(it.thickness) ? 0 : 1)} cm</td>
                      <td>${esc(it.surface)}</td>
                      <td>${formatNumber(it.areaM2, 2)} m²</td>
                      <td><strong>${formatNumber(Math.round(it.weightKg))} kg</strong></td>
                      <td><button type="button" class="b2b-rm-btn" data-b2b-rm="${esc(it.key)}" title="Odebrat z objednávky">✕</button></td>
                    </tr>`
                    )
                    .join('')}
                </tbody>
              </table>
            </div>
          </div>`
        )
        .join('');

      modal.innerHTML = `
        <div class="modal-dialog b2b-modal-dialog order-drawer">
          <button type="button" class="modal-close" data-b2b-close aria-label="Zavřít objednávku">✕</button>
          <div class="modal-scroll b2b-modal-body">
            <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px;padding-right:36px;">
              <div>
                <h2 id="b2b-order-title" style="margin:0;font-family:var(--font-display);font-size:24px;">Objednávka deskoviny a nakládka</h2>
                <p style="margin:4px 0 0;color:var(--text-muted);font-size:13.5px;">Přehled váhy podle skladu, identifikace firmy z ARES a dispozice pro řidiče.</p>
              </div>
              ${summary.count ? `<button type="button" class="btn-secondary" id="b2b-empty-cart">Vyprázdnit košík</button>` : ''}
            </div>

            <div class="order-summary-grid" style="margin-top:14px;">
              <div class="kpi-box"><strong>${summary.count} ks</strong><span>vybraných desek</span></div>
              <div class="kpi-box"><strong>${formatNumber(summary.totalAreaM2, 2)} m²</strong><span>celková plocha</span></div>
              <div class="kpi-box accent"><strong>${formatWeight(summary.totalWeightKg, true)}</strong><span>celková hmotnost</span></div>
            </div>

            <div class="load-meter ${esc(summary.transport.tone)}">
              <div class="load-meter-top">
                <strong>Doporučená doprava: ${esc(summary.transport.label)}</strong>
                <span>${esc(summary.transport.hint)}</span>
              </div>
              <div class="load-meter-track"><div class="load-meter-fill" style="width:${summary.transport.pct}%"></div></div>
              <div class="load-meter-note">Orientační výpočet dle objemové hmotnosti: žula ~2 750 kg/m³, tmavé gabro ~2 950 kg/m³, mramor/onyx ~2 700 kg/m³, kvarcit/vápenec ~2 650 kg/m³, travertin ~2 500 kg/m³, keramika ~2 450 kg/m³.</div>
            </div>

            ${
              !summary.count
                ? `<div class="b2b-empty-cart">Zatím jste nevybrali žádné desky. Otevřete detail materiálu nebo <strong>Tabulku bloků (B2B)</strong> a klikněte na <code>+ Deska</code> nebo <code>+ Celý blok</code>.</div>`
                : `
              <section style="margin-top:16px;">
                <h3 class="b2b-subhead">1. Vybraná deskovina podle skladu</h3>
                ${byWhHtml}
              </section>

              <form id="b2b-order-form" style="margin-top:18px;">
                <div id="b2b-order-err" class="b2b-alert-err" hidden></div>

                <section class="b2b-form-section">
                  <h3 class="b2b-subhead">2. Odběratel (načtení firmy podle IČO v ARES)</h3>
                  <div class="form-field">
                    <label for="ord-ico">IČO odběratele *</label>
                    <div class="ares-row">
                      <input type="text" id="ord-ico" required inputmode="numeric" maxlength="12" value="${esc(user.ico)}">
                      <button type="button" class="btn-secondary" id="ord-ares-btn">Načíst z ARES</button>
                    </div>
                    <div id="ord-ares-status" class="ares-status" aria-live="polite"></div>
                  </div>
                  <div class="b2b-grid-2">
                    <div class="form-field">
                      <label for="ord-company">Obchodní firma *</label>
                      <input type="text" id="ord-company" required value="${esc(user.companyName)}">
                    </div>
                    <div class="form-field">
                      <label for="ord-dic">DIČ</label>
                      <input type="text" id="ord-dic" value="${esc(user.dic || '')}">
                    </div>
                  </div>
                  <div class="form-field">
                    <label for="ord-addr">Sídlo firmy *</label>
                    <input type="text" id="ord-addr" required value="${esc(user.address)}">
                  </div>
                  <div class="b2b-grid-3">
                    <div class="form-field">
                      <label for="ord-contact">Kontaktní osoba *</label>
                      <input type="text" id="ord-contact" required value="${esc(user.contactName)}">
                    </div>
                    <div class="form-field">
                      <label for="ord-email">E-mail *</label>
                      <input type="email" id="ord-email" required value="${esc(user.email)}">
                    </div>
                    <div class="form-field">
                      <label for="ord-phone">Telefon *</label>
                      <input type="tel" id="ord-phone" required value="${esc(user.phone)}">
                    </div>
                  </div>
                </section>

                <section class="b2b-form-section" style="margin-top:16px;">
                  <h3 class="b2b-subhead">3. Termín příjezdu, řidič a způsob naložení desek</h3>
                  <div class="b2b-grid-3">
                    <div class="form-field">
                      <label for="ord-date">Datum příjezdu *</label>
                      <input type="date" id="ord-date" required min="${todayIso()}" value="${nextBusinessDayIso()}">
                    </div>
                    <div class="form-field">
                      <label for="ord-time-slot">Čas příjezdu *</label>
                      <select id="ord-time-slot" required>
                        <option value="07:00 – 09:00">07:00 – 09:00</option>
                        <option value="09:00 – 11:00" selected>09:00 – 11:00</option>
                        <option value="11:00 – 13:00">11:00 – 13:00</option>
                        <option value="13:00 – 15:00">13:00 – 15:00</option>
                        <option value="Přesný čas">Přesný čas (upřesnit)</option>
                      </select>
                    </div>
                    <div class="form-field" id="ord-exact-wrap" hidden>
                      <label for="ord-exact-time">Přesný čas příjezdu</label>
                      <input type="time" id="ord-exact-time" value="09:30">
                    </div>
                  </div>
                  <div class="b2b-grid-2">
                    <div class="form-field">
                      <label for="ord-driver-phone">Telefon řidiče *</label>
                      <input type="tel" id="ord-driver-phone" required placeholder="+420 777 ...">
                    </div>
                    <div class="form-field">
                      <label for="ord-driver-vehicle">Jméno řidiče / SPZ vozidla</label>
                      <input type="text" id="ord-driver-vehicle" placeholder="Nepovinné, např. 5Z2 4418">
                    </div>
                  </div>

                  <div class="form-field" style="margin-top:8px;">
                    <label>Uložení a nakládka desek *</label>
                    <div class="loading-mode-grid">
                      <label class="loading-mode-card">
                        <input type="radio" name="ord-loading-mode" value="stojan" checked>
                        <div>
                          <strong>Ve stojanu (A-rám / svisle)</strong>
                          <span>Doporučeno. Bezpečný svislý převoz na A-stojanu, nakládka jeřábem / VZV.</span>
                        </div>
                      </label>
                      <label class="loading-mode-card">
                        <input type="radio" name="ord-loading-mode" value="nalezato">
                        <div>
                          <strong>Naležato (na paletě / ložné ploše)</strong>
                          <span>Vodorovné uložení na dřevěné proklady nebo paletu.</span>
                        </div>
                      </label>
                    </div>
                    <div id="ord-fragile-warn" class="fragile-warn" hidden>
                      ⚠ Upozornění: objednávka obsahuje 2cm nebo křehké desky (mramor / kvarcit / onyx / keramika). Převoz <strong>naležato</strong> zvyšuje riziko prasknutí a probíhá na odpovědnost odběratele.
                    </div>
                  </div>

                  <div class="form-field">
                    <label for="ord-note">Poznámka pro skladníka</label>
                    <textarea id="ord-note" rows="2" placeholder="Např. upřesnění nájezdu, pořadí složení na stojan…"></textarea>
                  </div>

                  <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:6px;">
                    <button type="submit" class="btn-primary">Potvrdit objednávku a vystavit nakládací list →</button>
                  </div>
                </section>
              </form>`
            }
          </div>
        </div>`;

      modal.querySelectorAll('[data-b2b-rm]').forEach((btn) => {
        btn.addEventListener('click', () => {
          removeItem(btn.getAttribute('data-b2b-rm'));
          draw();
        });
      });

      document.getElementById('b2b-empty-cart')?.addEventListener('click', () => {
        clearCart();
        draw();
      });

      const slotSelect = document.getElementById('ord-time-slot');
      const exactWrap = document.getElementById('ord-exact-wrap');
      slotSelect?.addEventListener('change', () => {
        if (exactWrap) exactWrap.hidden = slotSelect.value !== 'Přesný čas';
      });

      const warnBox = document.getElementById('ord-fragile-warn');
      modal.querySelectorAll('input[name="ord-loading-mode"]').forEach((r) => {
        r.addEventListener('change', () => {
          if (warnBox) {
            warnBox.hidden = !(r.checked && r.value === 'nalezato' && summary.hasFragileOrThin);
          }
        });
      });

      const aresBtn = document.getElementById('ord-ares-btn');
      const aresStatus = document.getElementById('ord-ares-status');
      aresBtn?.addEventListener('click', async () => {
        const icoEl = document.getElementById('ord-ico');
        aresBtn.disabled = true;
        aresStatus.textContent = 'Načítám z ARES…';
        aresStatus.className = 'ares-status loading';
        try {
          const info = await lookupAresByIco(icoEl.value);
          icoEl.value = info.ico;
          document.getElementById('ord-company').value = info.companyName;
          document.getElementById('ord-dic').value = info.dic;
          document.getElementById('ord-addr').value = info.address;
          aresStatus.textContent = `✓ Načteno z ARES: ${info.companyName}`;
          aresStatus.className = 'ares-status ok';
        } catch (err) {
          aresStatus.textContent = err.message;
          aresStatus.className = 'ares-status err';
        } finally {
          aresBtn.disabled = false;
        }
      });

      const orderForm = document.getElementById('b2b-order-form');
      orderForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        const errBox = document.getElementById('b2b-order-err');
        const driverPhone = document.getElementById('ord-driver-phone').value.trim();
        const arrivalDate = document.getElementById('ord-date').value;
        const arrivalTime = document.getElementById('ord-time-slot').value;
        const exactTime = arrivalTime === 'Přesný čas' ? document.getElementById('ord-exact-time').value : '';
        const modeEl = orderForm.querySelector('input[name="ord-loading-mode"]:checked');
        const loadingMode = modeEl ? modeEl.value : 'stojan';

        if (!arrivalDate || !driverPhone) {
          errBox.textContent = 'Vyplňte prosím datum příjezdu a telefon řidiče.';
          errBox.hidden = false;
          return;
        }

        const now = new Date();
        const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        const rand = String(Math.floor(1000 + Math.random() * 9000));
        const order = {
          orderId: `SC-${ymd}-${rand}`,
          createdAtIso: now.toISOString(),
          createdAtLabel: new Intl.DateTimeFormat('cs-CZ', { dateStyle: 'medium', timeStyle: 'short' }).format(now),
          buyer: {
            ico: document.getElementById('ord-ico').value.trim(),
            companyName: document.getElementById('ord-company').value.trim(),
            dic: document.getElementById('ord-dic').value.trim(),
            address: document.getElementById('ord-addr').value.trim(),
            contactName: document.getElementById('ord-contact').value.trim(),
            email: document.getElementById('ord-email').value.trim(),
            phone: document.getElementById('ord-phone').value.trim(),
          },
          arrivalDate,
          arrivalTime,
          exactTime,
          driverPhone,
          driverVehicle: document.getElementById('ord-driver-vehicle').value.trim(),
          loadingMode,
          note: document.getElementById('ord-note').value.trim(),
          items: summary.items,
          summary,
        };

        const history = readJson(LS_ORDERS, []);
        history.unshift(order);
        writeJson(LS_ORDERS, history.slice(0, 20));
        submittedOrder = order;
        draw();
      });
    };

    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    syncFloatingVisibility();
    draw();
  }

  function bindGlobal() {
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-b2b-close]')) {
        closeModals();
        return;
      }
      const authBackdrop = document.getElementById('b2b-auth-modal');
      if (e.target === authBackdrop) {
        closeModals();
        return;
      }
      const orderBackdrop = document.getElementById('b2b-order-modal');
      if (e.target === orderBackdrop) {
        closeModals();
        return;
      }
      const authBtn = e.target.closest('[data-b2b-open-auth]');
      if (authBtn) {
        openAuth(authBtn.getAttribute('data-b2b-open-auth') || 'login');
        return;
      }
      if (e.target.closest('[data-b2b-demo-login]')) {
        loginDemo();
        return;
      }
      if (e.target.closest('[data-b2b-open-order]')) {
        openOrder();
        return;
      }
      if (e.target.closest('[data-b2b-logout]')) {
        logout();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const authM = document.getElementById('b2b-auth-modal');
      const orderM = document.getElementById('b2b-order-modal');
      if ((authM && !authM.hidden) || (orderM && !orderM.hidden)) {
        closeModals();
      }
    });
  }

  window.SC_B2B = {
    DARK_GABBRO_SLUGS,
    DENSITY_BY_CATEGORY,
    getDensityKgM3,
    calcSlabWeightKg,
    calcBlockWeightKg,
    calcMaterialWeightKg,
    formatWeight,
    classifyTransport,
    lookupAresByIco,
    isLoggedIn,
    getUser,
    login,
    loginDemo,
    registerAndLogin,
    logout,
    getCart,
    getCartSummary,
    makeSlabKey,
    hasItem,
    addSlab,
    addBlock,
    addBlockThickness,
    removeItem,
    clearCart,
    openAuth,
    openOrder,
    renderLockCard,
    refreshUI: renderBar,
  };

  document.addEventListener('DOMContentLoaded', () => {
    bindGlobal();
    renderBar();
  });
})();
