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
