import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_PATH = path.join(ROOT_DIR, 'data', 'sklad.json');

const STOCK_URL = 'https://www.stoneconnection.cz/online-sklad/';
const CATALOG_URL = 'https://www.stoneconnection.cz/katalog/';

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
    thumbUrl: rewriteCloudinary(url, 'f_auto,q_auto,w_240,h_180,c_fill,g_center'),
    fullUrl: rewriteCloudinary(url, 'f_auto,q_auto,w_1400,c_limit'),
    rawUrl: url,
  };
}

function findCatalogMatch(materialName, catalogByKey) {
  const fullKey = normalizeKey(materialName);
  if (catalogByKey.has(fullKey)) return catalogByKey.get(fullKey);

  // Strip suffixes such as ", výška 90 cm" or trailing " W" if needed
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

async function fetchHtml(url) {
  const res = await fetch(url, { headers: FETCH_HEADERS });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} pri nacitani ${url}`);
  }
  return await res.text();
}

async function main() {
  console.log('Stahuji verejna data ze stoneconnection.cz...');
  const [stockHtml, catalogHtml] = await Promise.all([
    fetchHtml(STOCK_URL),
    fetchHtml(CATALOG_URL),
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

  const blocksWithoutOwnPhoto = [];
  const normalizedBlocks = rawBlocks.map((raw, idx) => {
    const materialName = normalizeWhitespace(raw.nazev1);
    const materialSlug = slugify(materialName);
    const blockNumber = normalizeWhitespace(raw.blockNumber);
    const typeInfo = mapProductType(raw.productType);
    const catalogMatch = findCatalogMatch(materialName, catalogByKey);

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
    if (!hasRealPhoto) {
      blocksWithoutOwnPhoto.push(idx);
    }

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
      featuredImage: featuredVariant,
      detailImages: detailVariants,
      hasRealPhoto,
      cardImage: featuredVariant?.cardUrl || detailVariants[0]?.cardUrl || null,
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

  // Build sibling photo lookup per material for fallback
  const siblingPhotoByMaterial = new Map();
  for (const b of normalizedBlocks) {
    if (!siblingPhotoByMaterial.has(b.materialSlug) && (b.detailImages[0] || b.featuredImage)) {
      siblingPhotoByMaterial.set(b.materialSlug, b.detailImages[0] || b.featuredImage);
    }
  }

  let blocksWithPhoto = 0;
  let blocksFallbackPhoto = 0;
  let blocksWithoutPhoto = 0;

  for (const b of normalizedBlocks) {
    if (b.hasRealPhoto) {
      blocksWithPhoto += 1;
    } else if (b.catalogMatch?.image) {
      b.cardImage = b.catalogMatch.image.cardUrl;
      b.cardImageSource = 'catalog-fallback';
      blocksFallbackPhoto += 1;
    } else if (siblingPhotoByMaterial.has(b.materialSlug)) {
      b.cardImage = siblingPhotoByMaterial.get(b.materialSlug).cardUrl;
      b.cardImageSource = 'material-fallback';
      blocksFallbackPhoto += 1;
    } else {
      blocksWithoutPhoto += 1;
    }
  }

  // Group blocks into unique materials
  const materialsMap = new Map();
  for (const block of normalizedBlocks) {
    let mat = materialsMap.get(block.materialSlug);
    if (!mat) {
      mat = {
        slug: block.materialSlug,
        name: block.materialName,
        categoryKey: block.categoryKey,
        categoryLabel: block.categoryLabel,
        productTypes: new Set(),
        totalAreaM2: 0,
        totalSlabs: 0,
        blockCount: 0,
        warehouses: new Set(),
        thicknesses: new Set(),
        surfaces: new Set(),
        colors: new Set(),
        origin: block.catalogMatch?.origin || '',
        applications: block.catalogMatch?.applications || [],
        catalogUrl: block.catalogMatch?.url || null,
        catalogImage: block.catalogMatch?.image || null,
        blocks: [],
      };
      materialsMap.set(block.materialSlug, mat);
    }
    mat.productTypes.add(block.categoryLabel);
    mat.totalAreaM2 = Number((mat.totalAreaM2 + block.totalAreaM2).toFixed(2));
    mat.totalSlabs += block.slabCount;
    mat.blockCount += 1;
    block.warehouses.forEach((w) => mat.warehouses.add(w));
    block.thicknesses.forEach((t) => mat.thicknesses.add(t));
    block.surfaces.forEach((s) => mat.surfaces.add(s));
    if (block.catalogMatch?.colors) {
      block.catalogMatch.colors.forEach((c) => mat.colors.add(c));
    }
    mat.blocks.push(block);
  }

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

    if (mat.catalogImage) pushUnique(mat.catalogImage);
    for (const b of mat.blocks) {
      for (const d of b.detailImages) pushUnique(d);
    }
    for (const b of mat.blocks) {
      if (b.featuredImage) pushUnique(b.featuredImage);
    }

    // Priority for material card photo:
    // 1. catalog close-up texture -> 2. block detail close-up -> 3. block full slab center-cropped -> null
    const firstDetail = mat.blocks.find((b) => b.detailImages.length > 0)?.detailImages[0] || null;
    const firstSlab = mat.blocks.find((b) => b.featuredImage)?.featuredImage || null;

    let cardImage = null;
    let cardImageSource = 'none';
    if (mat.catalogImage) {
      cardImage = mat.catalogImage.cardUrl;
      cardImageSource = 'catalog';
    } else if (firstDetail) {
      cardImage = firstDetail.cardUrl;
      cardImageSource = 'detail';
    } else if (firstSlab) {
      cardImage = firstSlab.cardUrl;
      cardImageSource = 'slab';
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
      thicknesses: [...mat.thicknesses].sort((a, b) => a - b),
      surfaces: [...mat.surfaces].sort((a, b) => a.localeCompare(b, 'cs')),
      colors: [...mat.colors].map((c) => ({ key: c, label: COLOR_LABELS.get(c) || c })),
      origin: mat.origin,
      applications: mat.applications,
      catalogUrl: mat.catalogUrl,
      cardImage,
      cardImageSource,
      galleryImages,
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

  // Sort materials alphabetically (push items with no image to the end)
  materials.sort((a, b) => {
    const aHas = a.cardImage ? 0 : 1;
    const bHas = b.cardImage ? 0 : 1;
    if (aHas !== bHas) return aHas - bHas;
    return a.name.localeCompare(b.name, 'cs');
  });

  // Sort blocks alphabetically, pushing blocks without any photo to the end
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
      colors: b.catalogMatch?.colors || [],
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

  console.log('Synchronizace dokoncena:', JSON.stringify(payload.meta, null, 2));
}

main().catch((err) => {
  console.error('CHYBA synchronizace:', err);
  process.exit(1);
});
