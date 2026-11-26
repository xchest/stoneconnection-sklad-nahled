import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_PATH = path.join(ROOT_DIR, 'data', 'sklad.json');
const KATALOG_OUT_PATH = path.join(ROOT_DIR, 'data', 'katalog.json');
const NOTES_PATH = path.join(ROOT_DIR, 'data', 'material_notes.json');

const STOCK_URL = 'https://www.stoneconnection.cz/online-sklad/';
const CATALOG_URL = 'https://www.stoneconnection.cz/katalog/';
const REALIZATIONS_URL = 'https://www.stoneconnection.cz/realizace/';

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
    sceneUrl: rewriteCloudinary(url, 'f_auto,q_85,w_900,h_640,c_fill,g_center'),
    rawUrl: url,
  };
}

function findCatalogMatch(materialName, catalogByKey) {
  const fullKey = normalizeKey(materialName);
  if (catalogByKey.has(fullKey)) return catalogByKey.get(fullKey);

  const withoutComma = fullKey.split(',')[0].trim();
  if (withoutComma && catalogByKey.has(withoutComma)) {
    return catalogByKey.get(withoutComma);
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

function extractRealizationMap(html, materialSlugs) {
  const map = new Map();
  if (!html) return map;

  const urls = [...new Set(html.match(/https:\/\/res\.cloudinary\.com\/diizxq7gf\/image\/upload\/[^"'\s)]+/g) || [])];
  for (const rawUrl of urls) {
    if (rawUrl.includes('favicon_')) continue;
    const filename = (rawUrl.split('/').pop() || '').toLowerCase();
    for (const slug of materialSlugs) {
      const underscoreSlug = slug.replace(/-/g, '_');
      if (filename.includes(`_${underscoreSlug}_`) || filename.startsWith(`${underscoreSlug}_`)) {
        const list = map.get(slug) || [];
        const normalizedBase = filename.replace(/\.[a-z0-9]+$/, '');
        if (!list.some((item) => item.rawUrl.toLowerCase().includes(normalizedBase))) {
          list.push(makeImageVariants(rawUrl, 'Reálná realizace Stone Connection', 'realization'));
          map.set(slug, list);
        }
      }
    }
  }
  return map;
}

function computeAlternatives(materials) {
  const lightCompat = new Set(['mramor', 'vapenec', 'travertin', 'onyx']);
  const hardCompat = new Set(['zula', 'kvarcit', 'keramika']);

  for (const a of materials) {
    const aColors = a.colors.map((c) => c.key);
    const aColorSet = new Set(aColors);
    const scored = [];

    for (const b of materials) {
      if (b.slug === a.slug) continue;
      let score = 0;
      const bColors = b.colors.map((c) => c.key);
      const sharedColors = bColors.filter((c) => aColorSet.has(c));

      if (sharedColors.length > 0) {
        score += aColors[0] && bColors[0] === aColors[0] ? 5 : 4;
        score += Math.max(0, sharedColors.length - 1) * 3;
      }

      if (a.categoryKey === b.categoryKey) {
        score += 3.5;
      } else if (
        (hardCompat.has(a.categoryKey) && hardCompat.has(b.categoryKey)) ||
        (lightCompat.has(a.categoryKey) && lightCompat.has(b.categoryKey))
      ) {
        score += 1.5;
      }

      if (a.tone === b.tone) score += 2.5;
      if (a.pattern === b.pattern) score += 2;
      if (b.cardImage) score += 1.5;

      const reasonParts = [];
      if (sharedColors.length) {
        const cName = (COLOR_LABELS.get(sharedColors[0]) || sharedColors[0]).toLowerCase();
        reasonParts.push(`Podobný odstín (${cName})`);
      } else if (a.tone === b.tone) {
        const toneLabel = a.tone === 'dark' ? 'tmavý tón' : a.tone === 'light' ? 'světlý tón' : 'střední tón';
        reasonParts.push(`Blízký ${toneLabel}`);
      }
      if (a.categoryKey === b.categoryKey) {
        reasonParts.push(b.categoryLabel.toLowerCase());
      } else {
        reasonParts.push(`alternativa: ${b.categoryLabel.toLowerCase()}`);
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

  const [stockHtml, catalogHtml, realizationsHtml] = await Promise.all([
    fetchHtml(STOCK_URL),
    fetchHtml(CATALOG_URL),
    fetchHtml(REALIZATIONS_URL).catch(() => ''),
  ]);

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
      catalogMatch?.colors?.length
        ? catalogMatch.colors
        : note?.colors?.length
          ? note.colors
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

  const realizationMap = extractRealizationMap(realizationsHtml, [...materialsMap.keys()]);

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

    // Interior visualization texture keeps clean close-up texture priority (no crane clamp/warehouse background)
    let sceneTextureUrl = null;
    if (mat.catalogImage) {
      sceneTextureUrl = mat.catalogImage.sceneUrl;
    } else if (firstDetail) {
      sceneTextureUrl = firstDetail.sceneUrl;
    } else if (firstSlab) {
      sceneTextureUrl = firstSlab.sceneUrl;
    }

    const colorKeys = [...mat.colors];
    const colorObjs = colorKeys.map((c) => ({ key: c, label: COLOR_LABELS.get(c) || c }));
    const surfaces = [...mat.surfaces].sort((a, b) => a.localeCompare(b, 'cs'));
    const tone = inferTone(colorKeys, mat.note);
    const pattern = inferPattern(mat.note);
    const comment = mat.note?.comment || buildFallbackComment(
      mat.name,
      mat.categoryLabel,
      mat.origin,
      colorObjs.map((c) => c.label),
      surfaces
    );

    return {
      slug: mat.slug,
      name: mat.name,
      categoryKey: mat.categoryKey,
      categoryLabel: mat.categoryLabel,
      totalAreaM2: mat.totalAreaM2,
      totalSlabs: mat.totalSlabs,
      blockCount: mat.blockCount,
      warehouses: [...mat.warehouses].sort((a, b) => a.localeCompare(b, 'cs')),
      thicknesses: [...mat.thicknesses].sort((a, b) => a - b),
      surfaces,
      colors: colorObjs,
      tone,
      pattern,
      origin: mat.origin,
      applications: mat.applications,
      catalogUrl: mat.catalogUrl,
      comment,
      cardImage,
      sceneTextureUrl,
      cardImageSource,
      realizationImages: realizationMap.get(mat.slug) || [],
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
      const colorKeys = Array.isArray(item.colors) ? item.colors : [];
      const imgs = makeImageVariants(item.image, name, 'catalog');

      return {
        id: item.id,
        slug,
        name,
        categoryKey: typeInfo.key,
        categoryLabel: typeInfo.label,
        origin: normalizeWhitespace(item.origin),
        colors: colorKeys.map((c) => ({ key: c, label: COLOR_LABELS.get(c) || c })),
        applications: Array.isArray(item.appIcons) ? item.appIcons.map((a) => a.name) : [],
        collections: Array.isArray(item.collections) ? item.collections : [],
        cardUrl: imgs?.cardUrl || null,
        fullUrl: imgs?.fullUrl || null,
        sceneUrl: imgs?.sceneUrl || null,
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

  console.log('Synchronizace dokoncena:', JSON.stringify(payload.meta, null, 2));
  console.log('Katalog synchronizovan:', JSON.stringify(katalogPayload.meta, null, 2));
}

main().catch((err) => {
  console.error('CHYBA synchronizace:', err);
  process.exit(1);
});
