import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_PATH = path.join(ROOT_DIR, 'data', 'sklad.json');
const KATALOG_OUT_PATH = path.join(ROOT_DIR, 'data', 'katalog.json');
const REALIZATIONS_OUT_PATH = path.join(ROOT_DIR, 'data', 'realizace.json');
const NOTES_PATH = path.join(ROOT_DIR, 'data', 'material_notes.json');

const STOCK_URL = 'https://www.stoneconnection.cz/online-sklad/';
const CATALOG_URL = 'https://www.stoneconnection.cz/katalog/';
const REALIZATIONS_URL = 'https://www.stoneconnection.cz/realizace/';

const REALIZATION_CATEGORIES = [
  ['kuchyne', 'Kuchyně', 'https://www.stoneconnection.cz/realizace/kuchyne'],
  ['koupelny', 'Koupelny', 'https://www.stoneconnection.cz/realizace/koupelny'],
  ['interiery', 'Interiéry', 'https://www.stoneconnection.cz/realizace/interiery'],
  ['fasady-a-obklady', 'Fasády a obklady', 'https://www.stoneconnection.cz/realizace/fasady-a-obklady'],
  ['exteriery', 'Exteriéry', 'https://www.stoneconnection.cz/realizace/exteriery'],
  ['hrbitovni-architektura', 'Hřbitovní architektura', 'https://www.stoneconnection.cz/realizace/hrbitovni-architektura'],
  ['bazeny-a-wellness', 'Bazény a Wellness', 'https://www.stoneconnection.cz/realizace/bazeny-a-wellness'],
];

const REALIZATION_ALIASES = new Map([
  ['aurora-india', ['hrob_aurora', 'aurora_india']],
  ['vizag-blue', ['vizag']],
  ['nero-impala', ['nero_impala', 'hrob_impala']],
  ['nero-assoluto-zimbabwe', ['nero_zimbabwe', 'nero_assoluto']],
  ['zambezia-white', ['zambezia']],
  ['belvedere', ['belvedere_kuchyn', 'belvedere_obklad']],
  ['absolut-black-w', ['absolut_black']],
  ['multicolour-red', ['multicolor_red', 'multicolour_red']],
  ['yellow-river-vyska-70-cm', ['yellow_river']],
  ['misty-brown-vyska-90-cm', ['misty_brown']],
]);

const FLAGSHIP_DEMO_RENDERS = new Map([
  ['azul-platino', [
    { url: 'assets/viz/azul-platino-hrob.jpg', label: 'Ukázka pomníku — Azul Platino (leštěná žula)', kind: 'demo-viz' },
    { url: 'assets/viz/azul-platino-hala.jpg', label: 'Ukázka interiérové haly a schodiště — Azul Platino', kind: 'demo-viz' },
  ]],
  ['bianco-carrara', [
    { url: 'assets/viz/bianco-carrara-koupelna.jpg', label: 'Ukázka koupelny — Bianco Carrara (velkoformát)', kind: 'demo-viz' },
  ]],
  ['absolut-black-w', [
    { url: 'assets/viz/absolut-black-w-kuchyne.jpg', label: 'Ukázka kuchyňského ostrůvku — Absolut Black (matte/leather)', kind: 'demo-viz' },
  ]],
  ['imperial-red', [
    { url: 'assets/viz/imperial-red-hrob.jpg', label: 'Ukázka pomníku — Imperial Red (leštěná žula)', kind: 'demo-viz' },
  ]],
]);

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'cs-CZ,cs;q=0.9,en;q=0.8',
  'Cache-Control': 'no-cache',
};

/**
 * Extracts and evaluates a JS array literal immediately following `marker`
 * using balanced bracket scanning with string/escape awareness.
 */
function extractJsArray(source, marker) {
  const markerIdx = source.indexOf(marker);
  if (markerIdx === -1) {
    throw new Error(`Marker "${marker}" nebyl v HTML nalezen.`);
  }
  const startIdx = source.indexOf('[', markerIdx + marker.length);
  if (startIdx === -1) {
    throw new Error(`Oteviraci "[" za "${marker}" nebyla nalezena.`);
  }

  let depth = 0;
  let inString = null;
  let escaped = false;
  let endIdx = -1;

  for (let i = startIdx; i < source.length; i += 1) {
    const ch = source[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === inString) {
        inString = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
    } else if (ch === '[') {
      depth += 1;
    } else if (ch === ']') {
      depth -= 1;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }

  if (endIdx === -1) {
    throw new Error(`Ukoncovaci "]" pro "${marker}" nebyla nalezena.`);
  }

  const arraySource = source.slice(startIdx, endIdx + 1);
  const parsed = vm.runInNewContext(`(${arraySource})`, {}, { timeout: 2500 });
  if (!Array.isArray(parsed)) {
    throw new Error(`Extrahovana data pro "${marker}" nejsou pole.`);
  }
  return parsed;
}

function normalizeWhitespace(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function normalizeKey(value) {
  return normalizeWhitespace(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function slugify(value) {
  return normalizeKey(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const PRODUCT_TYPE_MAP = new Map([
  ['zula', { key: 'zula', label: 'Žula' }],
  ['žula', { key: 'zula', label: 'Žula' }],
  ['quartzite', { key: 'kvarcit', label: 'Kvarcit' }],
  ['kvarcit', { key: 'kvarcit', label: 'Kvarcit' }],
  ['mramor', { key: 'mramor', label: 'Mramor' }],
  ['onyx', { key: 'onyx', label: 'Onyx' }],
  ['travertin', { key: 'travertin', label: 'Travertin' }],
  ['vapenec', { key: 'vapenec', label: 'Vápenec' }],
  ['vápenec', { key: 'vapenec', label: 'Vápenec' }],
  ['keramika', { key: 'keramika', label: 'Keramika' }],
  ['lava stone', { key: 'ostatni', label: 'Lava stone' }],
  ['rula', { key: 'ostatni', label: 'Rula' }],
]);

function mapProductType(rawType) {
  const key = normalizeKey(rawType);
  return PRODUCT_TYPE_MAP.get(key) || {
    key: 'ostatni',
    label: normalizeWhitespace(rawType) || 'Ostatní',
  };
}

function mapWarehouse(rawWarehouse) {
  const k = normalizeKey(rawWarehouse);
  if (k === 'prague' || k === 'praha') return 'Praha';
  if (k === 'roznov' || k === 'roznov pod radhostem') return 'Rožnov';
  return normalizeWhitespace(rawWarehouse) || 'Neuvedeno';
}

function rewriteCloudinary(url, transform) {
  if (!url || typeof url !== 'string') return null;
  const marker = '/image/upload/';
  const idx = url.indexOf(marker);
  if (idx === -1) return url;

  const prefix = url.slice(0, idx + marker.length);
  const rest = url.slice(idx + marker.length);
  const parts = rest.split('/');
  if (parts.length > 1 && !/^v\d+$/.test(parts[0])) {
    parts.shift();
  }
  return `${prefix}${transform}/${parts.join('/')}`;
}

const DETAIL_PREFERRED_SLUGS = new Set([
  'daino-reale',
  'nero-assoluto-zimbabwe',
  'nero-impala',
  'nero-marquina',
  'steel-grey',
  'via-lattea',
]);

const CATALOG_PREFERRED_SLUGS = new Set([
  'daino-reale',
]);

const CERAMIC_SLAB_SLUGS = new Set([
  'doret',
  'statuario-extra',
]);

const DETAIL_SIZE_CM = new Map([
  ['azul-aran', [32, 22]],
  ['cinza-ariz', [28, 20]],
  ['daino-reale', [65, 45]],
  ['nero-assoluto-zimbabwe', [30, 21]],
  ['nero-impala', [24, 24]],
  ['nero-marquina', [65, 46]],
  ['olive-green', [36, 25]],
  ['premium-black', [30, 21]],
  ['shivakashi', [45, 32]],
  ['star-galaxy', [30, 21]],
  ['steel-grey', [35, 25]],
  ['verde-bahia', [30, 21]],
  ['via-lattea', [65, 46]],
]);

const DETAIL_CROP_SPEC = new Map([
  ['nero-impala', 'c_crop,w_0.58,h_0.44,g_east,x_0.02/c_limit,w_900,f_auto,q_90'],
  ['shivakashi', 'c_crop,w_0.92,h_0.65,g_center/c_limit,w_900,f_auto,q_90'],
  ['verde-bahia', 'c_crop,w_0.82,h_0.82,g_east/c_limit,w_900,f_auto,q_90'],
]);

const DEFAULT_SLAB_CROP = { w: 0.46, h: 0.36, g: 'center', x: 0, y: 0.08, slabWFrac: 0.78, slabHFrac: 0.64 };

const SLAB_CROP_SPEC = new Map([
  ['absolut-black-w', { w: 0.44, h: 0.30, g: 'center', x: 0, y: 0.14, slabWFrac: 0.76, slabHFrac: 0.58 }],
  ['black-vermont', { w: 0.28, h: 0.56, g: 'center', x: 0.03, y: 0.04, slabWFrac: 0.72, slabHFrac: 0.88 }],
  ['pietra-di-luserna', { w: 0.46, h: 0.28, g: 'center', x: 0, y: 0.04, slabWFrac: 0.80, slabHFrac: 0.50 }],
  ['onyx-white', { g: 'north_west', x: 0.48, y: 0.20, w: 0.40, h: 0.56, slabWFrac: 0.80, slabHFrac: 0.84 }],
  ['colonial-gold', { w: 0.42, h: 0.34, g: 'center', x: 0, y: 0.06, slabWFrac: 0.78, slabHFrac: 0.64 }],
  ['imperial-red', { w: 0.40, h: 0.52, g: 'center', x: 0, y: 0.04, slabWFrac: 0.80, slabHFrac: 0.88 }],
  ['madura-gold', { g: 'north_west', x: 0.35, y: 0.36, w: 0.37, h: 0.42, slabWFrac: 0.72, slabHFrac: 0.68 }],
  ['nero-cohiba', { w: 0.40, h: 0.52, g: 'center', x: 0, y: 0.02, slabWFrac: 0.76, slabHFrac: 0.88 }],
  ['quartzite-cielo', { g: 'north_west', x: 0.50, y: 0.28, w: 0.34, h: 0.44, slabWFrac: 0.78, slabHFrac: 0.68 }],
  ['sahara-white', { g: 'north_west', x: 0.27, y: 0.20, w: 0.42, h: 0.52, slabWFrac: 0.80, slabHFrac: 0.76 }],
  ['silvestre', { w: 0.54, h: 0.34, g: 'center', x: 0, y: 0.06, slabWFrac: 0.80, slabHFrac: 0.58 }],
  ['bararp', { w: 0.46, h: 0.26, g: 'center', x: 0, y: 0.08, slabWFrac: 0.78, slabHFrac: 0.46 }],
  ['cape-red', { w: 0.46, h: 0.30, g: 'center', x: 0, y: 0.08, slabWFrac: 0.76, slabHFrac: 0.54 }],
  ['vanga-red', { w: 0.46, h: 0.28, g: 'center', x: 0, y: 0.08, slabWFrac: 0.78, slabHFrac: 0.50 }],
  ['misty-brown-vyska-90-cm', { w: 0.46, h: 0.24, g: 'center', x: 0, y: 0.08, slabWFrac: 0.78, slabHFrac: 0.44 }],
  ['yellow-river-vyska-70-cm', { g: 'north_west', x: 0.60, y: 0.42, w: 0.24, h: 0.20, slabWFrac: 0.78, slabHFrac: 0.38 }],
  ['palm-green', { g: 'north_west', x: 0.56, y: 0.38, w: 0.32, h: 0.21, slabWFrac: 0.80, slabHFrac: 0.36 }],
]);

function isLikelyDetailTexture(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  const filename = (rawUrl.split('/').pop() || '').toLowerCase();
  const base = filename.replace(/\.[a-z0-9]+$/, '');
  return base.includes('detail');
}

const USAGE_LABELS = new Map([
  ['interior', 'Interiér'],
  ['monument_exterior', 'Pomníky & dlažby'],
  ['versatile', 'Univerzální'],
]);

function inferUsageSegment(note, thicknesses, surfaces) {
  if (note?.usageSegment) return note.usageSegment;
  const hasThickMonument = thicknesses.some((t) => t >= 5);
  const hasExtSurface = surfaces.some((s) => /trysk|opal|štíp|stip|kart/i.test(s));
  return hasThickMonument || hasExtSurface ? 'monument_exterior' : 'interior';
}

function inferSurfaceFinish(surfaces) {
  const joined = surfaces.join(' ').toLowerCase();
  const hasPolished = /lesk|lešt|lest|plněn|plnen/i.test(joined);
  const hasAntislip = /trysk|opal|štíp|stip/i.test(joined);
  const hasMatte = /leather|broušen|brousen|antic|natural|kartáč|kartac/i.test(joined);
  if (hasAntislip && !hasPolished) return 'antislip';
  if (hasMatte && !hasPolished) return 'matte';
  return 'polished';
}

function formatCropTransform(spec) {
  const parts = [`c_crop,w_${spec.w.toFixed(2)},h_${spec.h.toFixed(2)},g_${spec.g}`];
  if (spec.g === 'north_west') {
    parts.push(`x_${(spec.x || 0).toFixed(2)}`, `y_${(spec.y || 0).toFixed(2)}`);
  } else {
    if (spec.x) parts.push(`x_${spec.x.toFixed(2)}`);
    if (spec.y) parts.push(`y_${spec.y.toFixed(2)}`);
  }
  return `${parts.join(',')}/c_limit,w_900,f_auto,q_90`;
}

function resolveMaterialSceneTexture(mat, firstSlab, firstDetail, surfaceFinish) {
  const slug = mat.slug;
  const preferDetail = DETAIL_PREFERRED_SLUGS.has(slug);
  const isCeramicSlab = CERAMIC_SLAB_SLUGS.has(slug) || mat.categoryKey === 'velkoformatova-keramika';

  const nonDetailSlabBlock = mat.blocks.find(
    (b) => b.featuredImage?.rawUrl && !isLikelyDetailTexture(b.featuredImage.rawUrl)
  ) || null;

  const detailCandidateUrl =
    mat.blocks.flatMap((b) => b.detailImages || []).find((d) => isLikelyDetailTexture(d.rawUrl))?.rawUrl ||
    mat.blocks.map((b) => b.featuredImage).find((img) => img && isLikelyDetailTexture(img.rawUrl))?.rawUrl ||
    (mat.catalogImage && isLikelyDetailTexture(mat.catalogImage.rawUrl) ? mat.catalogImage.rawUrl : null) ||
    firstDetail?.rawUrl ||
    mat.catalogImage?.rawUrl ||
    null;

  let chosenRaw = null;
  let source = 'none';
  let slabBlock = nonDetailSlabBlock;

  if (isCeramicSlab) {
    chosenRaw = nonDetailSlabBlock?.featuredImage?.rawUrl || firstSlab?.rawUrl || mat.catalogImage?.rawUrl || detailCandidateUrl;
    source = 'ceramic-slab';
  } else if (CATALOG_PREFERRED_SLUGS.has(slug) && mat.catalogImage?.rawUrl) {
    chosenRaw = mat.catalogImage.rawUrl;
    source = 'detail';
  } else if (!preferDetail && nonDetailSlabBlock) {
    chosenRaw = nonDetailSlabBlock.featuredImage.rawUrl;
    source = 'slab';
  } else if (detailCandidateUrl) {
    chosenRaw = detailCandidateUrl;
    source = 'detail';
  } else if (firstSlab?.rawUrl) {
    chosenRaw = firstSlab.rawUrl;
    source = isLikelyDetailTexture(firstSlab.rawUrl) ? 'detail' : 'slab';
    slabBlock = mat.blocks.find((b) => b.featuredImage?.rawUrl === firstSlab.rawUrl) || null;
  }

  if (!chosenRaw) {
    return { url: null, widthCm: 60, heightCm: 42, source: 'none', finish: surfaceFinish };
  }

  if (source === 'ceramic-slab') {
    const slabs = slabBlock?.slabs || mat.blocks.flatMap((b) => b.slabs || []);
    const lengths = slabs.map((s) => Number(s.length) || 0).filter((v) => v > 0);
    const heights = slabs.map((s) => Number(s.height) || 0).filter((v) => v > 0);
    const widthCm = lengths.length ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length) : 320;
    const heightCm = heights.length ? Math.round(heights.reduce((a, b) => a + b, 0) / heights.length) : 160;
    return {
      url: rewriteCloudinary(chosenRaw, 'c_limit,w_1200,f_auto,q_90'),
      widthCm,
      heightCm,
      source: 'ceramic-slab',
      finish: surfaceFinish,
    };
  }

  if (source === 'slab') {
    const spec = SLAB_CROP_SPEC.get(slug) || DEFAULT_SLAB_CROP;
    const slabs = slabBlock?.slabs?.length ? slabBlock.slabs : mat.blocks.flatMap((b) => b.slabs || []);
    const lengths = slabs.map((s) => Number(s.length) || 0).filter((v) => v > 0);
    const heights = slabs.map((s) => Number(s.height) || 0).filter((v) => v > 0);
    const slabLenCm = lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 300;
    const slabHeightCm = heights.length ? heights.reduce((a, b) => a + b, 0) / heights.length : 185;
    const widthCm = Math.max(25, Math.round((spec.w / spec.slabWFrac) * slabLenCm));
    const heightCm = Math.max(20, Math.round((spec.h / spec.slabHFrac) * slabHeightCm));
    return {
      url: rewriteCloudinary(chosenRaw, formatCropTransform(spec)),
      widthCm,
      heightCm,
      source: 'slab',
      finish: surfaceFinish,
    };
  }

  const [dw, dh] = DETAIL_SIZE_CM.get(slug) || [45, 32];
  const detailTf = DETAIL_CROP_SPEC.get(slug) || 'c_limit,w_900,f_auto,q_90';
  return {
    url: rewriteCloudinary(chosenRaw, detailTf),
    widthCm: dw,
    heightCm: dh,
    source: 'detail',
    finish: surfaceFinish,
  };
}

function buildDetailSwatchUrl(sceneTexture) {
  if (!sceneTexture?.url) return null;
  if (sceneTexture.url.includes('/image/upload/')) {
    return sceneTexture.url
      .replace('/c_limit,w_900,f_auto,q_90', '/w_160,h_160,c_fill,g_center,f_auto,q_85')
      .replace('/c_limit,w_1200,f_auto,q_90', '/w_160,h_160,c_fill,g_center,f_auto,q_85');
  }
  return sceneTexture.url;
}

function makeImageVariants(url, label, kind, blockNumber = null) {
  if (!url) return null;
  return {
    label,
    kind,
    blockNumber,
    cardUrl: rewriteCloudinary(url, 'f_auto,q_auto,w_640,h_440,c_fill,g_center'),
    slabCardUrl: rewriteCloudinary(url, 'f_auto,q_auto,w_700,c_limit'),
    thumbUrl: rewriteCloudinary(url, 'f_auto,q_auto,w_240,h_180,c_fill,g_center'),
    fullUrl: rewriteCloudinary(url, 'f_auto,q_auto,w_1400,c_limit'),
    sceneUrl: rewriteCloudinary(url, 'c_limit,w_900,f_auto,q_90'),
    rawUrl: url,
  };
}

const CATALOG_NAME_ALIASES = new Map([
  ['multicolour red', 'multicolor red'],
  ['onyx orange', 'onice orange'],
  ['zambezia white', 'zambezia'],
  ['nero assoluto zimbabwe', 'nero zimbabwe'],
]);

function findCatalogMatch(materialName, catalogByKey) {
  const fullKey = normalizeKey(materialName);
  if (catalogByKey.has(fullKey)) return catalogByKey.get(fullKey);

  const withoutComma = fullKey.split(',')[0].trim();
  if (withoutComma && catalogByKey.has(withoutComma)) {
    return catalogByKey.get(withoutComma);
  }

  const alias = CATALOG_NAME_ALIASES.get(fullKey) || (withoutComma ? CATALOG_NAME_ALIASES.get(withoutComma) : null);
  if (alias && catalogByKey.has(alias)) {
    return catalogByKey.get(alias);
  }
  return null;
}

const COLOR_LABELS = new Map([
  ['bila', 'Bílá'],
  ['cerna', 'Černá'],
  ['seda', 'Šedá'],
  ['bezova', 'Béžová'],
  ['hneda', 'Hnědá'],
  ['modra', 'Modrá'],
  ['zelena', 'Zelená'],
  ['zluta', 'Žlutá'],
  ['zlata', 'Zlatá'],
  ['cervena', 'Červená'],
  ['ruzova', 'Růžová'],
  ['oranzova', 'Oranžová'],
  ['fialova', 'Fialová'],
]);

function inferColorsFromName(name) {
  const k = normalizeKey(name);
  const out = [];
  if (/\b(white|bianco|neve|ivory|alabastro)\b/.test(k)) out.push('bila');
  if (/\b(black|nero|assoluto)\b/.test(k)) out.push('cerna');
  if (/\b(green|verde|olive)\b/.test(k)) out.push('zelena');
  if (/\b(blue|azul|cielo)\b/.test(k)) out.push('modra');
  if (/\b(red|rosso)\b/.test(k)) out.push('cervena');
  if (/\b(gold|macaubas)\b/.test(k)) out.push('zlata');
  if (/\b(yellow|amarelo)\b/.test(k)) out.push('zluta');
  if (/\b(grey|gray|cinza|steel)\b/.test(k)) out.push('seda');
  if (/\b(brown|emperador|cohiba)\b/.test(k)) out.push('hneda');
  if (/\b(beige|marfil|taj|travertin|daino|moleanos)\b/.test(k)) out.push('bezova');
  if (/\b(pink|rosa|shivakashi)\b/.test(k)) out.push('ruzova');
  if (/\b(orange)\b/.test(k)) out.push('oranzova');
  return out.length ? [...new Set(out)] : ['seda'];
}

function inferTone(colors, note) {
  if (note?.tone) return note.tone;
  const set = new Set(colors);
  if (set.has('cerna')) return 'dark';
  if (set.has('bila') || set.has('bezova')) return 'light';
  return 'medium';
}

function inferPattern(note) {
  return note?.pattern || 'veined';
}

function buildFallbackComment(name, categoryLabel, origin, colorLabels, surfaces) {
  const originPart = origin ? ` z oblasti ${origin}` : '';
  const colorPart = colorLabels.length ? ` v odstínech ${colorLabels.join(', ').toLowerCase()}` : '';
  const surfPart = surfaces.length ? ` Dostupný v úpravě ${surfaces.join(' / ')}.` : '';
  return `${categoryLabel}${originPart}${colorPart} s přirozenou kresbou vhodnou pro kuchyňské desky, koupelny i architektonické obklady.${surfPart}`;
}

function extractRealizationsData(categoryPages, materialsMeta) {
  const byMaterialSlug = new Map();
  const seenGlobal = new Set();
  const galleryItems = [];
  const categoryCounts = [];

  for (const { key, label, html } of categoryPages) {
    if (!html) {
      categoryCounts.push({ key, label, count: 0 });
      continue;
    }
    let catCount = 0;
    const seenInCat = new Set();
    const urls = html.match(/https:\/\/res\.cloudinary\.com\/diizxq7gf\/image\/upload\/[^"'\s)]+/g) || [];
    for (const rawUrl of urls) {
      const fn = (rawUrl.split('/').pop() || '').toLowerCase();
      if (!fn || fn.includes('favicon_') || fn.includes('logo') || fn.includes('_detail')) continue;
      const baseKey = fn.replace(/\.[a-z0-9]+$/, '');
      if (seenInCat.has(baseKey)) continue;
      seenInCat.add(baseKey);
      catCount += 1;

      let matchedMat = null;
      for (const m of materialsMeta) {
        if (m.slug === 'belvedere' && fn.includes('belvedere_white')) continue;
        const patterns = REALIZATION_ALIASES.get(m.slug) || [m.slug.replace(/-/g, '_')];
        if (patterns.some((p) => fn.includes(p))) {
          matchedMat = m;
          const list = byMaterialSlug.get(m.slug) || [];
          if (!list.some((item) => item.rawUrl.toLowerCase().includes(baseKey))) {
            const v = makeImageVariants(rawUrl, `${m.name} — Reálná realizace (${label})`, 'realization');
            if (v) {
              v.category = label;
              v.categoryKey = key;
              list.push(v);
              byMaterialSlug.set(m.slug, list);
            }
          }
          break;
        }
      }

      if (!seenGlobal.has(baseKey)) {
        seenGlobal.add(baseKey);
        galleryItems.push({
          id: `${key}-${galleryItems.length + 1}`,
          categoryKey: key,
          categoryLabel: label,
          cardUrl: rewriteCloudinary(rawUrl, 'f_auto,q_80,w_760,h_540,c_fill,g_center'),
          fullUrl: rewriteCloudinary(rawUrl, 'f_auto,q_auto,w_1400,c_limit'),
          rawUrl,
          stockSlug: matchedMat?.slug || null,
          stockName: matchedMat?.name || null,
        });
      }
    }
    categoryCounts.push({ key, label, count: catCount });
  }

  return { byMaterialSlug, galleryItems, categoryCounts };
}

const COMPATIBLE_PRIMARY_COLORS = new Map([
  ['cerna', new Set(['cerna', 'seda'])],
  ['seda', new Set(['seda', 'bila', 'modra', 'cerna'])],
  ['bila', new Set(['bila', 'bezova', 'seda'])],
  ['bezova', new Set(['bezova', 'bila', 'zluta', 'hneda'])],
  ['zluta', new Set(['zluta', 'zlata', 'bezova'])],
  ['zlata', new Set(['zlata', 'zluta', 'bezova', 'hneda'])],
  ['hneda', new Set(['hneda', 'bezova', 'cervena', 'cerna'])],
  ['cervena', new Set(['cervena', 'ruzova', 'hneda', 'fialova'])],
  ['ruzova', new Set(['ruzova', 'cervena', 'bezova'])],
  ['fialova', new Set(['fialova', 'cervena', 'hneda'])],
  ['modra', new Set(['modra', 'seda', 'bila'])],
  ['zelena', new Set(['zelena', 'seda'])],
  ['oranzova', new Set(['oranzova', 'zluta', 'zlata', 'bezova'])],
]);

function computeAlternatives(materials) {
  const lightCompat = new Set(['mramor', 'vapenec', 'travertin', 'onyx']);
  const hardCompat = new Set(['zula', 'kvarcit', 'keramika']);

  for (const a of materials) {
    const aColors = a.colors.map((c) => c.key);
    const aPrimary = aColors[0] || null;
    const aSecondarySet = new Set(aColors.slice(1));
    const scored = [];

    for (const b of materials) {
      if (b.slug === a.slug) continue;
      let score = 0;
      const bColors = b.colors.map((c) => c.key);
      const bPrimary = bColors[0] || null;
      const sharedWithB = bColors.filter((c) => c === aPrimary || aSecondarySet.has(c));
      const compatPrimary = Boolean(
        aPrimary && bPrimary && COMPATIBLE_PRIMARY_COLORS.get(aPrimary)?.has(bPrimary)
      );
      const exactPrimary = Boolean(aPrimary && aPrimary === bPrimary);

      if (exactPrimary) {
        score += 12;
      } else if (compatPrimary && (sharedWithB.length > 0 || aColors.some((c) => COMPATIBLE_PRIMARY_COLORS.get(c)?.has(bPrimary)))) {
        score += 5;
      } else {
        score -= 18;
      }

      if (exactPrimary || compatPrimary) {
        const extraShared = bColors.filter((c) => c !== bPrimary && aColors.includes(c));
        score += extraShared.length * 2;
      }

      if (a.tone === b.tone) {
        score += 3.5;
      } else if (
        (a.tone === 'light' && b.tone === 'dark') ||
        (a.tone === 'dark' && b.tone === 'light')
      ) {
        score -= 14;
      }

      if (a.usageSegment === b.usageSegment) {
        score += 6;
      } else if (a.usageSegment === 'versatile' || b.usageSegment === 'versatile') {
        score += 2.5;
      } else {
        score -= 10;
      }

      if (a.categoryKey === b.categoryKey) {
        score += 4;
      } else if (
        (hardCompat.has(a.categoryKey) && hardCompat.has(b.categoryKey)) ||
        (lightCompat.has(a.categoryKey) && lightCompat.has(b.categoryKey))
      ) {
        score += 1.5;
      }

      if (a.pattern === b.pattern) score += 2.5;
      if (b.cardImage) score += 1.5;

      const reasonParts = [];
      if (exactPrimary) {
        const cName = (COLOR_LABELS.get(aPrimary) || aPrimary).toLowerCase();
        reasonParts.push(`Podobný odstín (${cName})`);
      } else if (compatPrimary && bPrimary) {
        const bName = (COLOR_LABELS.get(bPrimary) || bPrimary).toLowerCase();
        reasonParts.push(`Blízký odstín (${bName})`);
      } else if (a.tone === b.tone) {
        const toneLabel = a.tone === 'dark' ? 'tmavý tón' : a.tone === 'light' ? 'světlý tón' : 'střední tón';
        reasonParts.push(`Blízký ${toneLabel}`);
      }

      if (a.categoryKey === b.categoryKey) {
        reasonParts.push(b.categoryLabel.toLowerCase());
      } else {
        reasonParts.push(`alternativa: ${b.categoryLabel.toLowerCase()}`);
      }

      if (b.usageSegment === 'monument_exterior') {
        reasonParts.push('pomníky & dlažby');
      }

      scored.push({
        score,
        item: {
          slug: b.slug,
          name: b.name,
          categoryLabel: b.categoryLabel,
          cardImage: b.cardImage,
          reason: reasonParts.join(' · '),
        },
      });
    }

    scored.sort((x, y) => y.score - x.score || x.item.name.localeCompare(y.item.name, 'cs'));
    a.alternatives = scored.slice(0, 2).map((s) => s.item);
  }
}

async function fetchHtml(url) {
  const res = await fetch(url, { headers: FETCH_HEADERS });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} pri nacitani ${url}`);
  }
  return await res.text();
}

async function main() {
  console.log('Stahuji verejna data ze stoneconnection.cz...');
  let notesBySlug = {};
  if (fs.existsSync(NOTES_PATH)) {
    notesBySlug = JSON.parse(fs.readFileSync(NOTES_PATH, 'utf8'));
  }

  const [stockHtml, catalogHtml, ...realCategoryHtmls] = await Promise.all([
    fetchHtml(STOCK_URL),
    fetchHtml(CATALOG_URL),
    ...REALIZATION_CATEGORIES.map(([, , url]) => fetchHtml(url).catch(() => '')),
  ]);
  const realizationPages = REALIZATION_CATEGORIES.map(([key, label], i) => ({
    key,
    label,
    html: realCategoryHtmls[i] || '',
  }));

  const tsMatch = stockHtml.match(/data-timestamp="([^"]+)"/);
  const sourceUpdatedAt = tsMatch ? tsMatch[1] : null;

  const stockScripts = [...stockHtml.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
  const stockDataScript = stockScripts.reverse().find((m) => m[1].includes('const e=['))?.[1];
  if (!stockDataScript) {
    throw new Error('Skript s daty skladu (const e=[...]) nebyl nalezen.');
  }
  const rawBlocks = extractJsArray(stockDataScript, 'const e=');

  const catalogScripts = [...catalogHtml.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
  const catalogDataScript = catalogScripts.reverse().find((m) => m[1].includes('const productData=['))?.[1];
  const rawCatalog = catalogDataScript ? extractJsArray(catalogDataScript, 'const productData=') : [];

  const catalogByKey = new Map();
  for (const item of rawCatalog) {
    const k = normalizeKey(item.name);
    if (k) catalogByKey.set(k, item);
  }

  if (rawBlocks.length < 50) {
    throw new Error(`Sanity check selhal: nalezeno pouze ${rawBlocks.length} bloku (min 50).`);
  }

  let totalSlabs = 0;
  let totalAreaM2 = 0;

  const normalizedBlocks = rawBlocks.map((raw, idx) => {
    const materialName = normalizeWhitespace(raw.nazev1);
    const materialSlug = slugify(materialName);
    const blockNumber = normalizeWhitespace(raw.blockNumber);
    const typeInfo = mapProductType(raw.productType);
    const catalogMatch = findCatalogMatch(materialName, catalogByKey);
    const note = notesBySlug[materialSlug] || null;

    const slabs = (Array.isArray(raw.items) ? raw.items : []).map((it) => ({
      id: it.id ?? null,
      length: Number(it.length) || 0,
      height: Number(it.height) || 0,
      thickness: Number(it.thickness) || 0,
      surface: normalizeWhitespace(it.surface) || 'neuvedeno',
      warehouse: mapWarehouse(it.warehouse),
      areaM2: Number((Number(it.availableQuantity) || 0).toFixed(2)),
    }));

    const slabCount = slabs.length;
    const areaSum = slabs.reduce((acc, s) => acc + s.areaM2, 0);
    const blockArea = Number((Number(raw.totalQuantity) || areaSum).toFixed(2));
    totalSlabs += slabCount;
    totalAreaM2 += blockArea;

    const warehouses = [...new Set(slabs.map((s) => s.warehouse))].sort((a, b) => a.localeCompare(b, 'cs'));
    const thicknesses = [...new Set(slabs.map((s) => s.thickness).filter((t) => t > 0))].sort((a, b) => a - b);
    const surfaces = [...new Set(slabs.map((s) => s.surface).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'cs'));

    const featuredUrl = raw.featuredImage?.url || null;
    const detailUrls = (Array.isArray(raw.images) ? raw.images : [])
      .map((img) => img?.url)
      .filter(Boolean);

    const featuredVariant = makeImageVariants(featuredUrl, `Blok ${blockNumber} — celá deska`, 'slab', blockNumber);
    const detailVariants = detailUrls.map((u, i) =>
      makeImageVariants(u, `Blok ${blockNumber} — detail${detailUrls.length > 1 ? ` ${i + 1}` : ''}`, 'detail', blockNumber)
    );

    const hasRealPhoto = Boolean(featuredVariant || detailVariants.length > 0);
    const mergedColors =
      note?.colors?.length
        ? note.colors
        : catalogMatch?.colors?.length
          ? catalogMatch.colors
          : inferColorsFromName(materialName);

    return {
      id: `${materialSlug}-${slugify(blockNumber) || idx}`,
      blockNumber,
      materialName,
      materialSlug,
      categoryKey: typeInfo.key,
      categoryLabel: typeInfo.label,
      productTypeRaw: normalizeWhitespace(raw.productType),
      totalAreaM2: blockArea,
      slabCount,
      warehouses,
      thicknesses,
      surfaces,
      colors: mergedColors,
      featuredImage: featuredVariant,
      detailImages: detailVariants,
      hasRealPhoto,
      cardImage: featuredVariant?.slabCardUrl || detailVariants[0]?.slabCardUrl || null,
      cardImageSource: featuredVariant ? 'slab' : (detailVariants[0] ? 'detail' : 'none'),
      catalogMatch: catalogMatch
        ? {
            slug: catalogMatch.slug,
            url: `https://www.stoneconnection.cz/katalog/${catalogMatch.slug}`,
            origin: normalizeWhitespace(catalogMatch.origin),
            colors: Array.isArray(catalogMatch.colors) ? catalogMatch.colors : [],
            applications: Array.isArray(catalogMatch.appIcons) ? catalogMatch.appIcons.map((a) => a.name) : [],
            image: makeImageVariants(catalogMatch.image, `${materialName} — katalogová kresba`, 'catalog'),
          }
        : null,
      slabs,
    };
  });

  if (totalSlabs < 100) {
    throw new Error(`Sanity check selhal: nalezeno pouze ${totalSlabs} desek (min 100).`);
  }

  const siblingPhotoByMaterial = new Map();
  for (const b of normalizedBlocks) {
    if (!siblingPhotoByMaterial.has(b.materialSlug) && (b.featuredImage || b.detailImages[0])) {
      siblingPhotoByMaterial.set(b.materialSlug, b.featuredImage || b.detailImages[0]);
    }
  }

  let blocksWithPhoto = 0;
  let blocksFallbackPhoto = 0;
  let blocksWithoutPhoto = 0;

  for (const b of normalizedBlocks) {
    if (b.hasRealPhoto) {
      blocksWithPhoto += 1;
    } else if (siblingPhotoByMaterial.has(b.materialSlug)) {
      b.cardImage = siblingPhotoByMaterial.get(b.materialSlug).slabCardUrl;
      b.cardImageSource = 'material-fallback';
      blocksFallbackPhoto += 1;
    } else if (b.catalogMatch?.image) {
      b.cardImage = b.catalogMatch.image.cardUrl;
      b.cardImageSource = 'catalog-fallback';
      blocksFallbackPhoto += 1;
    } else {
      blocksWithoutPhoto += 1;
    }
  }

  const materialsMap = new Map();
  for (const block of normalizedBlocks) {
    let mat = materialsMap.get(block.materialSlug);
    if (!mat) {
      const note = notesBySlug[block.materialSlug] || null;
      mat = {
        slug: block.materialSlug,
        name: block.materialName,
        categoryKey: block.categoryKey,
        categoryLabel: block.categoryLabel,
        totalAreaM2: 0,
        totalSlabs: 0,
        blockCount: 0,
        warehouses: new Set(),
        thicknesses: new Set(),
        surfaces: new Set(),
        colors: new Set(block.colors),
        origin: block.catalogMatch?.origin || note?.origin || '',
        applications: block.catalogMatch?.applications || [],
        catalogUrl: block.catalogMatch?.url || null,
        catalogImage: block.catalogMatch?.image || null,
        note,
        blocks: [],
      };
      materialsMap.set(block.materialSlug, mat);
    }
    mat.totalAreaM2 = Number((mat.totalAreaM2 + block.totalAreaM2).toFixed(2));
    mat.totalSlabs += block.slabCount;
    mat.blockCount += 1;
    block.warehouses.forEach((w) => mat.warehouses.add(w));
    block.thicknesses.forEach((t) => mat.thicknesses.add(t));
    block.surfaces.forEach((s) => mat.surfaces.add(s));
    block.colors.forEach((c) => mat.colors.add(c));
    mat.blocks.push(block);
  }

  const materialsMetaList = [...materialsMap.values()].map((m) => ({ slug: m.slug, name: m.name }));
  const { byMaterialSlug: realizationMap, galleryItems: realizationGallery, categoryCounts: realizationCategories } =
    extractRealizationsData(realizationPages, materialsMetaList);

  const materials = [...materialsMap.values()].map((mat) => {
    const galleryImages = [];
    const seenUrls = new Set();

    const pushUnique = (img) => {
      if (!img || !img.rawUrl) return;
      const base = img.rawUrl.split('/').pop();
      if (seenUrls.has(base)) return;
      seenUrls.add(base);
      galleryImages.push(img);
    };

    // Online Sklad modal gallery: real slab photos (deskovina) FIRST, then block detail shots, then catalog texture
    for (const b of mat.blocks) {
      if (b.featuredImage) pushUnique(b.featuredImage);
    }
    for (const b of mat.blocks) {
      for (const d of b.detailImages) pushUnique(d);
    }
    if (mat.catalogImage) pushUnique(mat.catalogImage);

    const firstDetail = mat.blocks.find((b) => b.detailImages.length > 0)?.detailImages[0] || null;
    const firstSlab = mat.blocks.find((b) => b.featuredImage)?.featuredImage || null;

    // Online Sklad card image MUST prioritize real full slab photo (deskovina)
    let cardImage = null;
    let cardImageSource = 'none';
    if (firstSlab) {
      cardImage = firstSlab.slabCardUrl;
      cardImageSource = 'slab';
    } else if (firstDetail) {
      cardImage = firstDetail.slabCardUrl;
      cardImageSource = 'detail';
    } else if (mat.catalogImage) {
      cardImage = mat.catalogImage.cardUrl;
      cardImageSource = 'catalog';
    }

    const allSlabs = mat.blocks.flatMap((b) => b.slabs || []);
    const lengths = allSlabs.map((s) => Number(s.length) || 0).filter((v) => v > 0);
    const heights = allSlabs.map((s) => Number(s.height) || 0).filter((v) => v > 0);
    const maxLengthCm = lengths.length ? Math.max(...lengths) : 0;
    const maxHeightCm = heights.length ? Math.max(...heights) : 0;
    const minHeightCm = heights.length ? Math.min(...heights) : 0;

    const colorKeys = [...mat.colors];
    const colorObjs = colorKeys.map((c) => ({ key: c, label: COLOR_LABELS.get(c) || c }));
    const surfaces = [...mat.surfaces].sort((a, b) => a.localeCompare(b, 'cs'));
    const thicknesses = [...mat.thicknesses].sort((a, b) => a - b);
    const usageSegment = inferUsageSegment(mat.note, thicknesses, surfaces);
    const usageLabel = USAGE_LABELS.get(usageSegment) || 'Interiér';
    const surfaceFinish = inferSurfaceFinish(surfaces);
    const sceneTexture = resolveMaterialSceneTexture(mat, firstSlab, firstDetail, surfaceFinish);
    const sceneTextureUrl = sceneTexture.url;
    const detailSwatchUrl =
      cardImageSource === 'slab' && firstSlab && !isLikelyDetailTexture(firstSlab.rawUrl) && sceneTextureUrl
        ? buildDetailSwatchUrl(sceneTexture)
        : null;
    const textureScale = sceneTexture.source === 'detail' ? 'fine' : 'slab';
    const tone = inferTone(colorKeys, mat.note);
    const pattern = inferPattern(mat.note);
    const comment = mat.note?.comment || buildFallbackComment(
      mat.name,
      mat.categoryLabel,
      mat.origin,
      colorObjs.map((c) => c.label),
      surfaces
    );

    let applications = Array.isArray(mat.applications) ? [...mat.applications] : [];
    if (usageSegment === 'monument_exterior') {
      applications = applications.filter((a) => !/kuchyn|koupeln/i.test(a));
      if (!applications.some((a) => /pomník|pomnik/i.test(a))) {
        applications.push('Pomníky');
      }
      if (surfaceFinish === 'antislip' && !applications.some((a) => /dlažb|dlazb/i.test(a))) {
        applications.push('Dlažby a exteriér');
      }
    }

    return {
      slug: mat.slug,
      name: mat.name,
      categoryKey: mat.categoryKey,
      categoryLabel: mat.categoryLabel,
      totalAreaM2: mat.totalAreaM2,
      totalSlabs: mat.totalSlabs,
      blockCount: mat.blockCount,
      warehouses: [...mat.warehouses].sort((a, b) => a.localeCompare(b, 'cs')),
      thicknesses,
      surfaces,
      surfaceFinish,
      colors: colorObjs,
      tone,
      pattern,
      usageSegment,
      usageLabel,
      textureScale,
      maxLengthCm,
      maxHeightCm,
      minHeightCm,
      origin: mat.origin,
      applications,
      catalogUrl: mat.catalogUrl,
      comment,
      cardImage,
      detailSwatchUrl,
      sceneTextureUrl,
      sceneTexture,
      cardImageSource,
      realizationImages: realizationMap.get(mat.slug) || [],
      demoVisualizations: FLAGSHIP_DEMO_RENDERS.get(mat.slug) || [],
      galleryImages,
      alternatives: [],
      blocks: mat.blocks.map((b) => ({
        id: b.id,
        blockNumber: b.blockNumber,
        totalAreaM2: b.totalAreaM2,
        slabCount: b.slabCount,
        warehouses: b.warehouses,
        thicknesses: b.thicknesses,
        surfaces: b.surfaces,
        hasRealPhoto: b.hasRealPhoto,
        featuredImage: b.featuredImage,
        detailImages: b.detailImages,
        slabs: b.slabs,
      })),
    };
  });

  computeAlternatives(materials);

  materials.sort((a, b) => {
    const aHas = a.cardImage ? 0 : 1;
    const bHas = b.cardImage ? 0 : 1;
    if (aHas !== bHas) return aHas - bHas;
    return a.name.localeCompare(b.name, 'cs');
  });

  normalizedBlocks.sort((a, b) => {
    const aHas = a.cardImage ? 0 : 1;
    const bHas = b.cardImage ? 0 : 1;
    if (aHas !== bHas) return aHas - bHas;
    const cmp = a.materialName.localeCompare(b.materialName, 'cs');
    if (cmp !== 0) return cmp;
    return a.blockNumber.localeCompare(b.blockNumber, 'cs');
  });

  const payload = {
    meta: {
      sourceUrl: STOCK_URL,
      catalogUrl: CATALOG_URL,
      syncedAt: new Date().toISOString(),
      sourceUpdatedAt,
      totalMaterials: materials.length,
      totalBlocks: normalizedBlocks.length,
      totalSlabs,
      totalAreaM2: Number(totalAreaM2.toFixed(2)),
      blocksWithPhoto,
      blocksFallbackPhoto,
      blocksWithoutPhoto,
      materialsWithPhoto: materials.filter((m) => Boolean(m.cardImage)).length,
      materialsWithoutPhoto: materials.filter((m) => !m.cardImage).length,
      materialsWithColors: materials.filter((m) => m.colors.length > 0).length,
      materialsWithRealizations: materials.filter((m) => m.realizationImages.length > 0).length,
      totalRealizationPhotos: realizationGallery.length,
    },
    materials,
    blocks: normalizedBlocks.map((b) => ({
      id: b.id,
      blockNumber: b.blockNumber,
      materialName: b.materialName,
      materialSlug: b.materialSlug,
      categoryKey: b.categoryKey,
      categoryLabel: b.categoryLabel,
      totalAreaM2: b.totalAreaM2,
      slabCount: b.slabCount,
      warehouses: b.warehouses,
      thicknesses: b.thicknesses,
      surfaces: b.surfaces,
      colors: b.colors,
      cardImage: b.cardImage,
      cardImageSource: b.cardImageSource,
      hasRealPhoto: b.hasRealPhoto,
      featuredImage: b.featuredImage,
      detailImages: b.detailImages,
      slabs: b.slabs,
    })),
  };

  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(payload, null, 2) + '\n', 'utf8');

  // Build data/katalog.json for the self-contained Katalog page
  const stockByCatalogSlug = new Map();
  for (const m of materials) {
    if (m.catalogUrl) {
      const cSlug = m.catalogUrl.split('/').filter(Boolean).pop();
      if (cSlug) stockByCatalogSlug.set(cSlug, m);
    }
    stockByCatalogSlug.set(m.slug, m);
  }

  const catalogProducts = rawCatalog
    .map((item) => {
      const name = normalizeWhitespace(item.name);
      const slug = normalizeWhitespace(item.slug) || slugify(name);
      const typeInfo = mapProductType(item.type || item.typeSlug);
      const stockMatch = stockByCatalogSlug.get(slug) || stockByCatalogSlug.get(slugify(name)) || null;
      const note = notesBySlug[slug] || notesBySlug[slugify(name)] || null;
      const colorKeys = Array.isArray(item.colors) ? item.colors : [];
      const imgs = makeImageVariants(item.image, name, 'catalog');
      const usageSegment = stockMatch?.usageSegment || note?.usageSegment || 'interior';
      const usageLabel = USAGE_LABELS.get(usageSegment) || 'Interiér';
      const surfaceFinish = stockMatch?.surfaceFinish || (typeInfo.key === 'granitova-dlazba' ? 'antislip' : 'polished');
      const catalogSceneTexture = stockMatch?.sceneTexture || (item.image
        ? (() => {
            const isCeramic = CERAMIC_SLAB_SLUGS.has(slug) || typeInfo.key === 'velkoformatova-keramika';
            const [dw, dh] = DETAIL_SIZE_CM.get(slug) || (isCeramic ? [320, 160] : [65, 46]);
            return {
              url: rewriteCloudinary(item.image, isCeramic ? 'c_limit,w_1200,f_auto,q_90' : 'c_limit,w_900,f_auto,q_90'),
              widthCm: dw,
              heightCm: dh,
              source: isCeramic ? 'ceramic-slab' : 'detail',
              finish: surfaceFinish,
            };
          })()
        : { url: null, widthCm: 60, heightCm: 42, source: 'none', finish: surfaceFinish });
      const textureScale = stockMatch?.textureScale || note?.textureScale || (catalogSceneTexture.source === 'detail' ? 'fine' : 'slab');
      let applications = Array.isArray(item.appIcons) ? item.appIcons.map((a) => a.name) : [];
      if (usageSegment === 'monument_exterior') {
        applications = applications.filter((a) => !/kuchyn|koupeln/i.test(a));
      }

      return {
        id: item.id,
        slug,
        name,
        categoryKey: typeInfo.key,
        categoryLabel: typeInfo.label,
        origin: normalizeWhitespace(item.origin),
        colors: colorKeys.map((c) => ({ key: c, label: COLOR_LABELS.get(c) || c })),
        applications,
        collections: Array.isArray(item.collections) ? item.collections : [],
        usageSegment,
        usageLabel,
        surfaceFinish,
        textureScale,
        cardUrl: imgs?.cardUrl || null,
        fullUrl: imgs?.fullUrl || null,
        sceneUrl: catalogSceneTexture.url,
        sceneTexture: catalogSceneTexture,
        realizationImages: stockMatch?.realizationImages || [],
        demoVisualizations: FLAGSHIP_DEMO_RENDERS.get(stockMatch?.slug || slug) || [],
        inStockSlug: stockMatch ? stockMatch.slug : null,
        inStockBlocks: stockMatch ? stockMatch.blockCount : 0,
        inStockSlabs: stockMatch ? stockMatch.totalSlabs : 0,
        comment: stockMatch?.comment || buildFallbackComment(name, typeInfo.label, normalizeWhitespace(item.origin), colorKeys.map((c) => COLOR_LABELS.get(c) || c), []),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'cs'));

  const katalogPayload = {
    meta: {
      sourceUrl: CATALOG_URL,
      syncedAt: payload.meta.syncedAt,
      totalProducts: catalogProducts.length,
      inStockCount: catalogProducts.filter((p) => Boolean(p.inStockSlug)).length,
    },
    products: catalogProducts,
  };

  fs.writeFileSync(KATALOG_OUT_PATH, JSON.stringify(katalogPayload, null, 2) + '\n', 'utf8');

  const realizacePayload = {
    meta: {
      sourceUrl: REALIZATIONS_URL,
      syncedAt: payload.meta.syncedAt,
      totalPhotos: realizationGallery.length,
      categories: realizationCategories,
    },
    items: realizationGallery,
  };
  fs.writeFileSync(REALIZATIONS_OUT_PATH, JSON.stringify(realizacePayload, null, 2) + '\n', 'utf8');

  console.log('Synchronizace dokoncena:', JSON.stringify(payload.meta, null, 2));
  console.log('Katalog synchronizovan:', JSON.stringify(katalogPayload.meta, null, 2));
  console.log('Realizace synchronizovany:', JSON.stringify(realizacePayload.meta, null, 2));
}

main().catch((err) => {
  console.error('CHYBA synchronizace:', err);
  process.exit(1);
});
