window.SC_buildRealizationSearchUrl = function buildRealizationSearchUrl(mat) {
  const name = (mat?.name || '').trim();
  const catKey = mat?.categoryKey || '';
  const seg = mat?.usageSegment || 'interior';
  const typeEn =
    catKey === 'mramor' ? 'marble'
      : catKey === 'kvarcit' ? 'quartzite'
        : catKey === 'travertin' ? 'travertine'
          : catKey === 'onyx' ? 'onyx stone'
            : catKey === 'vapenec' ? 'limestone'
              : catKey === 'keramika' ? 'porcelain slab'
                : 'granite';
  const contextEn =
    seg === 'monument_exterior'
      ? 'monument OR stairs OR architecture'
      : 'kitchen countertop OR bathroom interior';
  const query = `"${name}" ${typeEn} (${contextEn})`;
  return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`;
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
