(function initSceneRenderer() {
  'use strict';

  const BASE_W = 960;
  const BASE_H = 720;

  const SC_SCENE_DEFS = {
    hrob: {
      key: 'hrob',
      label: 'Pomník / jednohrob',
      base: 'assets/scenes/hrob_base.jpg',
      mask: 'assets/scenes/hrob_mask.png',
      shine: 'assets/scenes/hrob_shine.png',
      neutralLum: 212,
      planes: [
        {
          name: 'stele',
          match: (_x, y) => y < 432,
          quad: [[350, 58], [608, 76], [582, 405], [382, 405]],
          widthCm: 62,
          heightCm: 82,
          offsetCm: [20, 10],
        },
        {
          name: 'rim',
          match: (x, y) => y >= 548 && y <= 622 && x >= 195 && x <= 605,
          quad: [[195, 548], [605, 548], [605, 622], [195, 622]],
          widthCm: 75,
          heightCm: 22,
          offsetCm: [10, 40],
        },
        {
          name: 'cover',
          match: () => true,
          quad: [[265, 472], [655, 478], [735, 675], [65, 645]],
          widthCm: 130,
          heightCm: 150,
          offsetCm: [55, 0],
        },
      ],
    },
    hala: {
      key: 'hala',
      label: 'Interiérová hala a schodiště',
      base: 'assets/scenes/hala_base.jpg',
      mask: 'assets/scenes/hala_mask.png',
      shine: 'assets/scenes/hala_shine.png',
      neutralLum: 198,
      planes: [
        ...[
          [329, 348],
          [354, 372],
          [379, 400],
          [407, 430],
          [441, 466],
        ].map(([y0, y1], i) => ({
          name: `riser-${i}`,
          match: (x, y) => y >= y0 && y < y1 && x >= 166 && x <= 792,
          quad: [[166, y0], [792, y0], [792, y1], [166, y1]],
          widthCm: 360,
          heightCm: 17,
          offsetCm: [i * 37, i * 23],
        })),
        {
          name: 'landing-treads',
          match: (_x, y) => y < 466,
          quad: [[256, 313], [704, 313], [792, 466], [166, 466]],
          widthCm: 360,
          heightCm: 180,
          offsetCm: [0, 0],
        },
        {
          name: 'floor',
          match: () => true,
          quad: [[134, 466], [826, 466], [1177, 720], [-217, 720]],
          widthCm: 480,
          heightCm: 340,
          offsetCm: [0, 0],
          tileGridCm: 60,
        },
      ],
    },
    dlazba: {
      key: 'dlazba',
      label: 'Venkovní dlažba a terasa',
      base: 'assets/scenes/dlazba_base.jpg',
      mask: 'assets/scenes/dlazba_mask.png',
      shine: 'assets/scenes/dlazba_shine.png',
      neutralLum: 192,
      planes: [
        {
          name: 'terrace',
          match: () => true,
          quad: [[345, 315], [690, 315], [960, 625], [0, 625]],
          widthCm: 360,
          heightCm: 480,
          offsetCm: [0, 0],
          tileGridCm: 60,
        },
      ],
    },
    schody: {
      key: 'schody',
      label: 'Venkovní schodiště a sokl',
      base: 'assets/scenes/schody_base.jpg',
      mask: 'assets/scenes/schody_mask.png',
      shine: 'assets/scenes/schody_shine.png',
      neutralLum: 185,
      planes: [
        ...[
          [347, 366],
          [381, 401],
          [421, 445],
          [470, 500],
          [532, 566],
          [612, 646],
        ].map(([y0, y1], i) => ({
          name: `schody-riser-${i}`,
          match: (_x, y) => y >= y0 && y < y1,
          quad: [[120, y0], [840, y0], [840, y1], [120, y1]],
          widthCm: 280,
          heightCm: 17,
          offsetCm: [i * 41, i * 27],
        })),
        {
          name: 'treads',
          match: () => true,
          quad: [[280, 330], [650, 330], [900, 645], [60, 645]],
          widthCm: 280,
          heightCm: 320,
          offsetCm: [0, 0],
        },
      ],
    },
    kuchyne: {
      key: 'kuchyne',
      label: 'Kuchyně s ostrovem',
      base: 'assets/scenes/kuchyne_base.jpg',
      mask: 'assets/scenes/kuchyne_mask.png',
      shine: null,
      neutralLum: 202,
      planes: [
        {
          name: 'backsplash',
          match: (_x, y) => y < 405,
          quad: [[242, 210], [718, 210], [718, 405], [242, 405]],
          widthCm: 240,
          heightCm: 95,
          offsetCm: [0, 30],
        },
        {
          name: 'island-top',
          match: (_x, y) => y >= 405 && y < 442,
          quad: [[177, 406], [780, 406], [836, 441], [115, 441]],
          widthCm: 300,
          heightCm: 95,
          offsetCm: [0, 0],
        },
        {
          name: 'island-front',
          match: () => true,
          quad: [[115, 441], [836, 441], [836, 675], [115, 675]],
          widthCm: 300,
          heightCm: 90,
          offsetCm: [0, 95],
        },
      ],
    },
    krb: {
      key: 'krb',
      label: 'Krbová stěna',
      base: 'assets/scenes/krb_base.jpg',
      mask: 'assets/scenes/krb_mask.png',
      shine: null,
      neutralLum: 210,
      planes: [
        {
          name: 'fireplace-wall',
          match: () => true,
          quad: [[307, 65], [652, 65], [652, 618], [307, 618]],
          widthCm: 180,
          heightCm: 260,
          offsetCm: [0, 0],
          slabJoints: true,
        },
      ],
    },
    koupelna: {
      key: 'koupelna',
      label: 'Koupelna',
      base: 'assets/scenes/koupelna_base.jpg',
      mask: 'assets/scenes/koupelna_mask.png',
      shine: null,
      neutralLum: 210,
      planes: [
        {
          name: 'bathroom-wall',
          match: () => true,
          quad: [[168, 90], [835, 90], [835, 660], [168, 660]],
          widthCm: 240,
          heightCm: 215,
          offsetCm: [0, 0],
          slabJoints: true,
        },
      ],
    },
  };

  function getScenesForMaterial(mat) {
    const finish = mat?.surfaceFinish || mat?.sceneTexture?.finish || 'polished';
    const seg = mat?.usageSegment || 'interior';
    const cat = mat?.categoryKey || '';
    const isDelicateMarble = cat === 'mramor' || cat === 'vapenec' || cat === 'travertin' || cat === 'onyx';

    if (finish === 'antislip') {
      return [SC_SCENE_DEFS.dlazba, SC_SCENE_DEFS.schody, SC_SCENE_DEFS.hrob];
    }
    if (seg === 'monument_exterior') {
      return [SC_SCENE_DEFS.hrob, SC_SCENE_DEFS.hala, SC_SCENE_DEFS.krb];
    }
    if (seg === 'versatile') {
      return finish === 'matte'
        ? [SC_SCENE_DEFS.kuchyne, SC_SCENE_DEFS.hala, SC_SCENE_DEFS.hrob]
        : [SC_SCENE_DEFS.kuchyne, SC_SCENE_DEFS.hrob, SC_SCENE_DEFS.hala];
    }
    if (isDelicateMarble) {
      return [SC_SCENE_DEFS.koupelna, SC_SCENE_DEFS.krb, SC_SCENE_DEFS.hala];
    }
    return [SC_SCENE_DEFS.kuchyne, SC_SCENE_DEFS.krb, SC_SCENE_DEFS.koupelna];
  }

  /** Solves 8x8 linear system for projective homography mapping srcQuad -> dstQuad. */
  function solveHomography(srcQuad, dstQuad) {
    const A = new Array(8);
    const b = new Array(8);
    for (let i = 0; i < 4; i += 1) {
      const sx = srcQuad[i][0];
      const sy = srcQuad[i][1];
      const dx = dstQuad[i][0];
      const dy = dstQuad[i][1];
      A[2 * i] = [sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy];
      b[2 * i] = dx;
      A[2 * i + 1] = [0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy];
      b[2 * i + 1] = dy;
    }

    for (let col = 0; col < 8; col += 1) {
      let pivotRow = col;
      let maxVal = Math.abs(A[col][col]);
      for (let r = col + 1; r < 8; r += 1) {
        const v = Math.abs(A[r][col]);
        if (v > maxVal) {
          maxVal = v;
          pivotRow = r;
        }
      }
      if (pivotRow !== col) {
        const tmp = A[col];
        A[col] = A[pivotRow];
        A[pivotRow] = tmp;
        const tb = b[col];
        b[col] = b[pivotRow];
        b[pivotRow] = tb;
      }
      const diag = A[col][col] || 1e-12;
      for (let r = col + 1; r < 8; r += 1) {
        const factor = A[r][col] / diag;
        if (factor === 0) continue;
        for (let k = col; k < 8; k += 1) {
          A[r][k] -= factor * A[col][k];
        }
        b[r] -= factor * b[col];
      }
    }

    const h = new Float64Array(9);
    for (let r = 7; r >= 0; r -= 1) {
      let sum = b[r];
      for (let k = r + 1; k < 8; k += 1) {
        sum -= A[r][k] * h[k];
      }
      h[r] = sum / (A[r][r] || 1e-12);
    }
    h[8] = 1.0;
    return h;
  }

  const imagePromiseCache = new Map();
  const sceneBundleCache = new Map();
  const textureDataCache = new Map();
  const planeMatrixCache = new Map();

  function loadImage(src, useCors) {
    const cacheKey = `${useCors ? 'cors:' : 'plain:'}${src}`;
    if (imagePromiseCache.has(cacheKey)) {
      return imagePromiseCache.get(cacheKey);
    }
    const promise = new Promise((resolve, reject) => {
      const img = new Image();
      if (useCors) img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Image load failed: ${src}`));
      img.src = src;
    });
    imagePromiseCache.set(cacheKey, promise);
    return promise;
  }

  function extractImageData(img, w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
  }

  function getSceneBundle(sceneKey, cw, ch) {
    const key = `${sceneKey}:${cw}x${ch}`;
    if (sceneBundleCache.has(key)) return sceneBundleCache.get(key);

    const def = SC_SCENE_DEFS[sceneKey];
    if (!def) return Promise.reject(new Error(`Unknown scene ${sceneKey}`));

    const promise = Promise.all([
      loadImage(def.base, false),
      loadImage(def.mask, false),
      def.shine ? loadImage(def.shine, false).catch(() => null) : Promise.resolve(null),
    ]).then(([baseImg, maskImg, shineImg]) => ({
      def,
      base: extractImageData(baseImg, cw, ch).data,
      mask: extractImageData(maskImg, cw, ch).data,
      shine: shineImg ? extractImageData(shineImg, cw, ch).data : null,
    }));

    sceneBundleCache.set(key, promise);
    return promise;
  }

  function getTextureData(url) {
    if (textureDataCache.has(url)) return textureDataCache.get(url);

    const promise = loadImage(url, true).then((img) => {
      const tw = Math.min(900, img.naturalWidth || 900);
      const th = Math.max(1, Math.round(tw * ((img.naturalHeight || 600) / Math.max(1, img.naturalWidth || 900))));
      const imgData = extractImageData(img, tw, th);
      return { width: tw, height: th, data: imgData.data };
    });

    textureDataCache.set(url, promise);
    return promise;
  }

  function getScaledPlanes(sceneKey, cw, ch) {
    const key = `${sceneKey}:${cw}x${ch}`;
    if (planeMatrixCache.has(key)) return planeMatrixCache.get(key);

    const def = SC_SCENE_DEFS[sceneKey];
    const sx = cw / BASE_W;
    const sy = ch / BASE_H;
    const compiled = def.planes.map((p) => {
      const scaledQuad = p.quad.map(([qx, qy]) => [qx * sx, qy * sy]);
      const worldRect = [
        [0, 0],
        [p.widthCm, 0],
        [p.widthCm, p.heightCm],
        [0, p.heightCm],
      ];
      return {
        ...p,
        h: solveHomography(scaledQuad, worldRect),
      };
    });
    planeMatrixCache.set(key, compiled);
    return compiled;
  }

  function resolveTextureSpec(mat) {
    if (!mat) return null;
    if (mat.sceneTexture?.url) return mat.sceneTexture;
    if (mat.sceneTextureUrl || mat.sceneUrl) {
      return {
        url: mat.sceneTextureUrl || mat.sceneUrl,
        widthCm: mat.textureScale === 'fine' ? 45 : 180,
        heightCm: mat.textureScale === 'fine' ? 32 : 105,
        source: mat.textureScale === 'fine' ? 'detail' : 'slab',
        finish: mat.surfaceFinish || 'polished',
      };
    }
    return null;
  }

  let nextToken = 1;

  async function renderSceneCanvas(canvas, sceneKey, mat) {
    if (!canvas) return;
    const texSpec = resolveTextureSpec(mat);
    if (!texSpec?.url) return;

    const token = String(nextToken++);
    canvas.dataset.renderToken = token;

    const cw = canvas.width || 640;
    const ch = canvas.height || 480;

    try {
      const [bundle, tex] = await Promise.all([
        getSceneBundle(sceneKey, cw, ch),
        getTextureData(texSpec.url),
      ]);
      if (canvas.dataset.renderToken !== token) return;

      const planes = getScaledPlanes(sceneKey, cw, ch);
      const { base, mask, shine, def } = bundle;
      const tData = tex.data;
      const tw = tex.width;
      const th = tex.height;
      const texWcm = Math.max(12, texSpec.widthCm || 160);
      const texHcm = Math.max(12, texSpec.heightCm || 100);
      const finish = mat?.surfaceFinish || texSpec.finish || 'polished';
      const shineWeight = finish === 'polished' ? 0.45 : (finish === 'matte' ? 0.08 : 0.0);
      const slabMaxH = Number(mat?.maxHeightCm) || 0;
      const neutralLum = def.neutralLum || 200;

      const outCtx = canvas.getContext('2d');
      const outImg = outCtx.createImageData(cw, ch);
      const out = outImg.data;
      out.set(base);

      const invSx = BASE_W / cw;
      const invSy = BASE_H / ch;

      for (let y = 0; y < ch; y += 1) {
        const y960 = y * invSy;
        const rowOff = y * cw;
        for (let x = 0; x < cw; x += 1) {
          const idx = (rowOff + x) * 4;
          const mAlpha = mask[idx + 3];
          if (mAlpha <= 2) continue;

          const x960 = x * invSx;
          let plane = planes[planes.length - 1];
          for (let pi = 0; pi < planes.length - 1; pi += 1) {
            if (planes[pi].match(x960, y960)) {
              plane = planes[pi];
              break;
            }
          }

          const h = plane.h;
          let den = h[6] * x + h[7] * y + h[8];
          if (Math.abs(den) < 1e-6) den = 1e-6;
          let uCm = (h[0] * x + h[1] * y + h[2]) / den + (plane.offsetCm?.[0] || 0);
          let vCm = (h[3] * x + h[4] * y + h[5]) / den + (plane.offsetCm?.[1] || 0);
          let tileGain = 1.0;

          if (plane.tileGridCm) {
            const g = plane.tileGridCm;
            const ix = Math.floor(uCm / g);
            const iy = Math.floor(vCm / g);
            const hash = (Math.imul(ix, 73856093) ^ Math.imul(iy, 19349663)) >>> 0;
            uCm += ((hash & 255) / 255) * 0.45 * texWcm;
            vCm += (((hash >>> 8) & 255) / 255) * 0.45 * texHcm;
            tileGain = 0.975 + (((hash >>> 16) & 255) / 255) * 0.05;
          }

          let nu = (uCm / texWcm) % 2.0;
          if (nu < 0) nu += 2.0;
          const fu = nu > 1.0 ? 2.0 - nu : nu;

          let nv = (vCm / texHcm) % 2.0;
          if (nv < 0) nv += 2.0;
          const fv = nv > 1.0 ? 2.0 - nv : nv;

          const tx = fu * (tw - 1);
          const ty = fv * (th - 1);
          const x0 = tx | 0;
          const y0 = ty | 0;
          const dx = tx - x0;
          const dy = ty - y0;
          const x1 = x0 + 1 < tw ? x0 + 1 : x0;
          const y1 = y0 + 1 < th ? y0 + 1 : y0;

          const i00 = (y0 * tw + x0) * 4;
          const i10 = (y0 * tw + x1) * 4;
          const i01 = (y1 * tw + x0) * 4;
          const i11 = (y1 * tw + x1) * 4;

          const w00 = (1 - dx) * (1 - dy);
          const w10 = dx * (1 - dy);
          const w01 = (1 - dx) * dy;
          const w11 = dx * dy;

          let sr = tData[i00] * w00 + tData[i10] * w10 + tData[i01] * w01 + tData[i11] * w11;
          let sg = tData[i00 + 1] * w00 + tData[i10 + 1] * w10 + tData[i01 + 1] * w01 + tData[i11 + 1] * w11;
          let sb = tData[i00 + 2] * w00 + tData[i10 + 2] * w10 + tData[i01 + 2] * w01 + tData[i11 + 2] * w11;

          const baseLum = (base[idx] + base[idx + 1] + base[idx + 2]) / 3;
          let gain = (baseLum / neutralLum) * tileGain;
          if (gain < 0.25) gain = 0.25;
          else if (gain > 1.38) gain = 1.38;

          if (plane.slabJoints && slabMaxH > 0 && slabMaxH < 150) {
            let modV = vCm % slabMaxH;
            if (modV < 0) modV += slabMaxH;
            if (modV < 1.5) gain *= 0.78;
          }

          sr *= gain;
          sg *= gain;
          sb *= gain;

          if (shine && shineWeight > 0) {
            const sa = (shine[idx + 3] / 255) * shineWeight;
            if (sa > 0.002) {
              sr = sr * (1 - sa) + 255 * sa;
              sg = sg * (1 - sa) + 255 * sa;
              sb = sb * (1 - sa) + 255 * sa;
            }
          }

          const a = mAlpha / 255;
          const r = Math.min(255, Math.max(0, base[idx] * (1 - a) + sr * a));
          const g = Math.min(255, Math.max(0, base[idx + 1] * (1 - a) + sg * a));
          const b = Math.min(255, Math.max(0, base[idx + 2] * (1 - a) + sb * a));
          out[idx] = r;
          out[idx + 1] = g;
          out[idx + 2] = b;
        }
      }

      outCtx.putImageData(outImg, 0, 0);
    } catch (_err) {
      // Leave base scene photo intact on image/CORS fallback
    }
  }

  function renderAllSceneCanvases(rootEl, mat) {
    if (!rootEl || !mat) return;
    const canvases = rootEl.querySelectorAll('canvas.scene-canvas[data-scene-key]');
    canvases.forEach((canvas) => {
      renderSceneCanvas(canvas, canvas.dataset.sceneKey, mat);
    });
  }

  window.SC_SCENES = SC_SCENE_DEFS;
  window.SC_getScenesForMaterial = getScenesForMaterial;
  window.SC_renderSceneCanvas = renderSceneCanvas;
  window.SC_renderAllSceneCanvases = renderAllSceneCanvases;
})();
