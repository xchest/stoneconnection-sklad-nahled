window.SC_SCENES = {
  kuchyne: { key: 'kuchyne', label: 'Kuchyně s ostrovem', base: 'assets/scenes/kuchyne_base.jpg', mask: 'assets/scenes/kuchyne_mask.png', sceneWidthCm: 330, supportsJoints: false },
  krb: { key: 'krb', label: 'Krbová stěna', base: 'assets/scenes/krb_base.jpg', mask: 'assets/scenes/krb_mask.png', sceneWidthCm: 500, supportsJoints: true },
  koupelna: { key: 'koupelna', label: 'Koupelna', base: 'assets/scenes/koupelna_base.jpg', mask: 'assets/scenes/koupelna_mask.png', sceneWidthCm: 340, supportsJoints: true },
  hrob: { key: 'hrob', label: 'Pomník / jednohrob', base: 'assets/scenes/hrob_base.jpg', mask: 'assets/scenes/hrob_mask.png', sceneWidthCm: 200, supportsJoints: false },
  dlazba: { key: 'dlazba', label: 'Venkovní dlažba a terasa', base: 'assets/scenes/dlazba_base.jpg', mask: 'assets/scenes/dlazba_mask.png', sceneWidthCm: 360, supportsJoints: false },
  schody: { key: 'schody', label: 'Venkovní schodiště a sokl', base: 'assets/scenes/schody_base.jpg', mask: 'assets/scenes/schody_mask.png', sceneWidthCm: 280, supportsJoints: false },
};

window.SC_getScenesForMaterial = function getScenesForMaterial(mat) {
  const seg = mat?.usageSegment || 'interior';
  if (seg === 'monument_exterior') {
    return [window.SC_SCENES.hrob, window.SC_SCENES.dlazba, window.SC_SCENES.schody];
  }
  if (seg === 'versatile') {
    return [window.SC_SCENES.kuchyne, window.SC_SCENES.hrob, window.SC_SCENES.dlazba];
  }
  return [window.SC_SCENES.kuchyne, window.SC_SCENES.krb, window.SC_SCENES.koupelna];
};

window.SC_getSceneBgSize = function getSceneBgSize(scene, textureScale = 'medium') {
  const tileWidthCm = textureScale === 'fine' ? 90 : textureScale === 'slab' ? 300 : 185;
  const sceneWidthCm = scene?.sceneWidthCm || 340;
  const pct = Math.max(18, Math.min(125, Math.round((tileWidthCm / sceneWidthCm) * 100)));
  return `${pct}% auto`;
};

window.SC_TILE_CACHE = new Map();

window.SC_buildSeamlessTile = function buildSeamlessTile(url) {
  if (!url) return Promise.resolve(url);
  if (window.SC_TILE_CACHE.has(url)) {
    return window.SC_TILE_CACHE.get(url);
  }
  const promise = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const w = Math.min(360, img.naturalWidth || 360);
        const h = Math.min(256, img.naturalHeight || 256);
        const canvas = document.createElement('canvas');
        canvas.width = w * 2;
        canvas.height = h * 2;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(url);
          return;
        }
        // Top-left: normal
        ctx.drawImage(img, 0, 0, w, h);
        // Top-right: horizontal mirror
        ctx.save();
        ctx.translate(w * 2, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(img, 0, 0, w, h);
        ctx.restore();
        // Bottom-left: vertical mirror
        ctx.save();
        ctx.translate(0, h * 2);
        ctx.scale(1, -1);
        ctx.drawImage(img, 0, 0, w, h);
        ctx.restore();
        // Bottom-right: both axes mirrored
        ctx.save();
        ctx.translate(w * 2, h * 2);
        ctx.scale(-1, -1);
        ctx.drawImage(img, 0, 0, w, h);
        ctx.restore();

        resolve(canvas.toDataURL('image/jpeg', 0.88));
      } catch {
        resolve(url);
      }
    };
    img.onerror = () => resolve(url);
    img.src = url;
  });
  window.SC_TILE_CACHE.set(url, promise);
  return promise;
};

window.SC_applySeamlessTiles = function applySeamlessTiles(rootEl) {
  if (!rootEl) return;
  rootEl.querySelectorAll('.scene-stone-layer[data-tex-src]').forEach((layer) => {
    const src = layer.getAttribute('data-tex-src');
    if (!src) return;
    window.SC_buildSeamlessTile(src).then((tileUrl) => {
      if (layer.isConnected && tileUrl) {
        layer.style.backgroundImage = `url('${tileUrl}')`;
      }
    });
  });
};

document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('menu-toggle');
  const nav = document.getElementById('main-nav');
  if (!toggle || !nav) return;

  const setOpen = (open) => {
    nav.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  };

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(!nav.classList.contains('open'));
  });

  document.addEventListener('click', (e) => {
    if (nav.classList.contains('open') && !nav.contains(e.target) && !toggle.contains(e.target)) {
      setOpen(false);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav.classList.contains('open')) {
      setOpen(false);
    }
  });
});
