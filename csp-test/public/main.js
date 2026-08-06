/**
 * main.js — client behaviors for the Nimbus CSP test site.
 * Exercises DOM APIs page analyzers typically observe, plus Worker creation.
 */

'use strict';

const log = (...args) => console.log('[nimbus]', ...args);
const warn = (...args) => console.warn('[nimbus]', ...args);

/** Attempt to start a dedicated Web Worker (subject to CSP worker-src). */
function initWorkerTest() {
  const statusEl = document.getElementById('worker-status');
  const setStatus = (text, ok) => {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.dataset.state = ok ? 'ok' : 'error';
  };

  try {
    const worker = new Worker('/worker.js');

    worker.addEventListener('message', (event) => {
      log('Worker message:', event.data);
      if (event.data?.type === 'ready') {
        setStatus('running', true);
      } else if (event.data?.type === 'heartbeat') {
        setStatus(`heartbeat #${event.data.tick}`, true);
      }
    });

    worker.addEventListener('error', (event) => {
      warn('Worker error event:', event.message || event);
      setStatus(`error: ${event.message || 'failed'}`, false);
    });

    log('Worker created successfully');
    setStatus('started', true);
    window.__nimbusWorker = worker;
  } catch (err) {
    warn('Worker creation failed (likely CSP):', err);
    setStatus(`blocked: ${err.message}`, false);
  }

  // Surface CSP violation reports when available.
  document.addEventListener('securitypolicyviolation', (event) => {
    if (event.violatedDirective?.includes('worker-src') || event.effectiveDirective?.includes('worker')) {
      warn('CSP violation (worker):', {
        violatedDirective: event.violatedDirective,
        blockedURI: event.blockedURI,
        disposition: event.disposition,
      });
      setStatus(`csp: ${event.violatedDirective} (${event.disposition})`, false);
    } else {
      warn('CSP violation:', event.violatedDirective, event.blockedURI);
    }
  });
}

function initRouteLabel() {
  const el = document.getElementById('current-route');
  if (el) el.textContent = location.pathname;
}

function initBanner() {
  const banner = document.getElementById('top-banner');
  const dismiss = document.getElementById('dismiss-banner');
  dismiss?.addEventListener('click', () => {
    banner?.remove();
    sessionStorage.setItem('nimbus_banner_dismissed', '1');
  });
  if (sessionStorage.getItem('nimbus_banner_dismissed') === '1') {
    banner?.remove();
  }
}

function initNav() {
  const toggle = document.getElementById('nav-toggle');
  const nav = document.getElementById('primary-nav');
  toggle?.addEventListener('click', () => {
    const open = nav?.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(Boolean(open)));
  });

  document.querySelectorAll('.nav-link').forEach((link) => {
    link.addEventListener('click', () => {
      document.querySelectorAll('.nav-link').forEach((l) => l.classList.remove('is-active'));
      link.classList.add('is-active');
      nav?.classList.remove('is-open');
      toggle?.setAttribute('aria-expanded', 'false');
    });
  });
}

function initSearch() {
  const form = document.getElementById('search-form');
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const q = new FormData(form).get('q')?.toString().trim() || '';
    history.pushState({ q }, '', q ? `?q=${encodeURIComponent(q)}` : location.pathname);
    log('Search submitted:', q || '(empty)');
    const slot = document.getElementById('dynamic-slot');
    if (slot) {
      const chip = document.createElement('span');
      chip.className = 'dynamic-chip';
      chip.textContent = q ? `Search: ${q}` : 'Empty search';
      chip.dataset.query = q;
      slot.appendChild(chip);
      // Attribute mutation + delayed removal
      requestAnimationFrame(() => chip.setAttribute('data-ready', '1'));
      setTimeout(() => chip.remove(), 5000);
    }
  });
}

function initLoginModal() {
  const modal = document.getElementById('login-modal');
  const openBtn = document.getElementById('login-btn');
  const form = document.getElementById('login-form');

  const open = () => {
    modal?.removeAttribute('hidden');
    document.getElementById('login-email')?.focus();
  };
  const close = () => modal?.setAttribute('hidden', '');

  openBtn?.addEventListener('click', open);
  modal?.querySelectorAll('[data-close-modal]').forEach((el) => {
    el.addEventListener('click', close);
  });

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const email = document.getElementById('login-email')?.value || '';
    localStorage.setItem('nimbus_last_login', email);
    log('Login form submitted for', email);
    close();
  });
}

function initButtons() {
  document.getElementById('cta-demo')?.addEventListener('click', () => {
    history.pushState({ demo: true }, '', '#demo-requested');
    log('Demo CTA clicked');
    alert('Thanks — a demo request was recorded locally.');
  });

  document.querySelectorAll('.product-cta').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sku = btn.getAttribute('data-sku');
      const cart = JSON.parse(localStorage.getItem('nimbus_cart') || '[]');
      cart.push({ sku, at: Date.now() });
      localStorage.setItem('nimbus_cart', JSON.stringify(cart));
      btn.classList.add('is-added');
      btn.textContent = 'Added';
      log('Added to cart:', sku);
    });
  });

  document.querySelectorAll('.plan-cta').forEach((btn) => {
    btn.addEventListener('click', () => {
      const plan = btn.getAttribute('data-plan');
      sessionStorage.setItem('nimbus_selected_plan', plan || '');
      log('Plan selected:', plan);
    });
  });

  document.getElementById('privacy-btn')?.addEventListener('click', () => {
    log('Privacy clicked');
  });

  document.querySelectorAll('.social-link').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      log('Social:', link.dataset.network);
    });
  });
}

function initContactForm() {
  const form = document.getElementById('contact-form');
  const status = document.getElementById('contact-status');

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    status?.classList.remove('is-ok', 'is-error');
    if (status) status.textContent = 'Sending…';

    const payload = Object.fromEntries(new FormData(form).entries());
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      if (status) {
        status.textContent = 'Message sent. We will reply soon.';
        status.classList.add('is-ok');
      }
      form.reset();
      log('Contact submitted', data);
    } catch (err) {
      if (status) {
        status.textContent = err.message || 'Something went wrong';
        status.classList.add('is-error');
      }
      warn('Contact failed', err);
    }
  });
}

function initNewsletter() {
  const form = document.getElementById('newsletter-form');
  const status = document.getElementById('newsletter-status');
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const email = document.getElementById('newsletter-email')?.value || '';
    localStorage.setItem('nimbus_newsletter', email);
    document.cookie = `nimbus_newsletter=1; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
    if (status) {
      status.textContent = 'Subscribed — check your inbox.';
      status.classList.add('is-ok');
    }
    form.reset();
  });
}

function initCookieBanner() {
  const banner = document.getElementById('cookie-banner');
  const consent = localStorage.getItem('nimbus_cookie_consent');
  if (!consent && banner) {
    banner.hidden = false;
  }

  document.getElementById('cookie-accept')?.addEventListener('click', () => {
    localStorage.setItem('nimbus_cookie_consent', 'accepted');
    document.cookie = 'nimbus_consent=accepted; path=/; max-age=31536000; SameSite=Lax';
    if (banner) banner.hidden = true;
  });

  document.getElementById('cookie-reject')?.addEventListener('click', () => {
    localStorage.setItem('nimbus_cookie_consent', 'rejected');
    document.cookie = 'nimbus_consent=rejected; path=/; max-age=31536000; SameSite=Lax';
    if (banner) banner.hidden = true;
  });
}

function initFetchApi() {
  const status = document.getElementById('api-status');
  fetch('/api/data')
    .then((res) => res.json())
    .then((data) => {
      log('API /api/data', data);
      if (status) status.textContent = 'ok';
    })
    .catch((err) => {
      warn('API failed', err);
      if (status) status.textContent = 'error';
    });

  fetch('/api/products')
    .then((res) => res.json())
    .then((data) => log('API /api/products count:', data.products?.length))
    .catch((err) => warn('Products API failed', err));
}

function initMutationObserver() {
  const target = document.getElementById('dynamic-slot');
  const counter = document.getElementById('mutation-count');
  if (!target || !counter) return;

  let count = 0;
  const observer = new MutationObserver((mutations) => {
    count += mutations.length;
    counter.textContent = String(count);
  });
  observer.observe(target, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: true,
  });
  window.__nimbusMutationObserver = observer;
}

function initIntersectionObserver() {
  const reveals = document.querySelectorAll('.section, .product-card, .plan');
  reveals.forEach((el) => el.classList.add('reveal'));

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
  );

  reveals.forEach((el) => io.observe(el));

  // Lazy-load product images when near viewport
  const lazyImages = document.querySelectorAll('img.lazy[data-src]');
  const lazyIo = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const img = /** @type {HTMLImageElement} */ (entry.target);
      img.src = img.dataset.src || '';
      img.addEventListener('load', () => img.classList.add('is-loaded'), { once: true });
      img.removeAttribute('data-src');
      lazyIo.unobserve(img);
    }
  }, { rootMargin: '120px' });

  lazyImages.forEach((img) => lazyIo.observe(img));
}

function initTimersAndIdle() {
  const idleEl = document.getElementById('idle-count');
  let idleTicks = 0;

  setInterval(() => {
    const year = document.getElementById('year');
    if (year) year.textContent = String(new Date().getFullYear());
  }, 30_000);

  const scheduleIdle = window.requestIdleCallback
    || ((cb) => setTimeout(() => cb({ timeRemaining: () => 0, didTimeout: true }), 200));

  const tickIdle = () => {
    scheduleIdle(() => {
      idleTicks += 1;
      if (idleEl) idleEl.textContent = String(idleTicks);
      // Periodic attribute / text mutation for analyzers
      document.body.dataset.idleTicks = String(idleTicks);
      tickIdle();
    }, { timeout: 2000 });
  };
  tickIdle();

  let frame = 0;
  const animate = () => {
    frame += 1;
    if (frame % 120 === 0) {
      document.documentElement.style.setProperty('--raf-tick', String(frame));
    }
    requestAnimationFrame(animate);
  };
  requestAnimationFrame(animate);
}

function initScrollResize() {
  const scrollEl = document.getElementById('scroll-y');
  const viewportEl = document.getElementById('viewport-size');

  const onScroll = () => {
    if (scrollEl) scrollEl.textContent = String(Math.round(window.scrollY));
    document.body.classList.toggle('is-scrolled', window.scrollY > 40);
  };

  const onResize = () => {
    if (viewportEl) viewportEl.textContent = `${window.innerWidth}×${window.innerHeight}`;
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize);
  onScroll();
  onResize();
}

function seedDynamicDom() {
  const slot = document.getElementById('dynamic-slot');
  if (!slot) return;
  for (let i = 1; i <= 3; i += 1) {
    const chip = document.createElement('span');
    chip.className = 'dynamic-chip';
    chip.id = `seed-chip-${i}`;
    chip.textContent = `Live chip ${i}`;
    slot.appendChild(chip);
  }
  // Remove one to exercise element removal
  setTimeout(() => document.getElementById('seed-chip-2')?.remove(), 2500);
}

document.addEventListener('DOMContentLoaded', () => {
  log('DOMContentLoaded');
  initRouteLabel();
  initBanner();
  initNav();
  initSearch();
  initLoginModal();
  initButtons();
  initContactForm();
  initNewsletter();
  initCookieBanner();
  initFetchApi();
  initMutationObserver();
  initIntersectionObserver();
  initTimersAndIdle();
  initScrollResize();
  seedDynamicDom();
  initWorkerTest();

  // Baseline cookie for analyzers
  document.cookie = `nimbus_session=${Date.now()}; path=/; SameSite=Lax`;
});
