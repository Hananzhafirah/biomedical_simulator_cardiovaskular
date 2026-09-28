(() => {
  const q = (s, r=document) => r.querySelector(s);
  const qa = (s, r=document) => [...r.querySelectorAll(s)];

  const menu = q('.site-menu');
  const links = q('.site-nav-links');
  if (menu && links) {
    menu.addEventListener('click', () => {
      const open = links.classList.toggle('open');
      menu.setAttribute('aria-expanded', String(open));
    });
    qa('.site-nav-links a').forEach(a => a.addEventListener('click', () => links.classList.remove('open')));
  }

  const progress = q('.site-progress');
  const updateProgress = () => {
    if (!progress) return;
    const h = document.documentElement;
    const max = Math.max(1, h.scrollHeight - h.clientHeight);
    progress.style.width = `${Math.min(100, Math.max(0, h.scrollTop / max * 100))}%`;
  };
  addEventListener('scroll', updateProgress, {passive:true});
  addEventListener('resize', updateProgress);
  updateProgress();

  const io = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    });
  }, {threshold:.12, rootMargin:'0px 0px -40px 0px'}) : null;
  qa('.reveal').forEach(el => io ? io.observe(el) : el.classList.add('is-visible'));

  const counters = qa('[data-count]');
  const counterIO = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting || entry.target.dataset.counted) return;
      entry.target.dataset.counted = '1';
      const el = entry.target;
      const target = Number(el.dataset.count || 0);
      const decimals = Number(el.dataset.decimals || 0);
      const suffix = el.dataset.suffix || '';
      const start = performance.now();
      const duration = 900;
      const tick = now => {
        const t = Math.min(1, (now - start)/duration);
        const eased = 1 - Math.pow(1-t,3);
        el.textContent = `${(target*eased).toFixed(decimals)}${suffix}`;
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      counterIO.unobserve(el);
    });
  }, {threshold:.6}) : null;
  counters.forEach(el => counterIO ? counterIO.observe(el) : (el.textContent = `${el.dataset.count}${el.dataset.suffix||''}`));
})();
