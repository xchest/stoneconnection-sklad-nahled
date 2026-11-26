# Stone Connection — Návrh vizuálního skladu

Návrh modernější vizuální prezentace online skladu společnosti **Stone Connection** (inspirováno galerijním stylem Severe a Dekstone při zachování všech skladových dat).

## Princip řešení
- **Nulový zásah do skladového ERP:** Web nezasahuje do interní skladové integrace. Skript `scripts/sync_sklad.mjs` čte pouze veřejně publikované stránky `https://www.stoneconnection.cz/online-sklad/` a `https://www.stoneconnection.cz/katalog/`.
- **Obrázky bez duplikování:** Fotografie se načítají přímo z existujícího Cloudinary CDN (`res.cloudinary.com/diizxq7gf/`) s úpravou transformačních parametrů pro ostré galerijní karty a detailní zoom.
- **Tři režimy zobrazení:**
  1. **Karty · Materiály** (výchozí): čistá galerie unikátních materiálů (kresba + název), skladové detaily po rozkliku.
  2. **Karty · Bloky**: jednotlivé skladové bloky se štítkem bloku a počtem desek.
  3. **Tabulka**: původní rychlý přehled pro kameníky s rozbalením konkrétních desek.
- **Neindexováno:** Nastaveno `noindex, nofollow` a `robots.txt` (`Disallow: /`).

## Ruční aktualizace dat
Vyžaduje Node.js 20+:

```bash
node scripts/sync_sklad.mjs
```

Automatická denní aktualizace běží přes GitHub Actions v `.github/workflows/sync-sklad.yml` (každý den v 05:20 UTC / 06:20 CET).
