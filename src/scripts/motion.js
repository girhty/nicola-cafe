import { state, clamp, lerp, damp, reduced, onReady } from './state.js';

/* ---------------------------------------------------------------
   1. Smooth-scroll value + central frame loop (drives all motion)
----------------------------------------------------------------*/
function initLoop() {
  let last = performance.now();
  let prevX = state.pointer.x;
  let prevY = state.pointer.y;
  const parallaxEls = Array.from(document.querySelectorAll('[data-parallax]'));

  const onMove = (e) => {
    state.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    state.pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
    state.px = e.clientX;
    state.py = e.clientY;
  };
  window.addEventListener('pointermove', onMove, { passive: true });

  const frame = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    state.dt = dt;
    state.t += reduced ? 0 : dt;

    // smooth scroll (lerped value used for all visual motion)
    state.scrollTarget = window.scrollY || window.pageYOffset || 0;
    state.scroll = reduced ? state.scrollTarget : damp(state.scroll, state.scrollTarget, 9, dt);

    // pointer velocity
    const vx = state.pointer.x - prevX;
    const vy = state.pointer.y - prevY;
    prevX = state.pointer.x;
    prevY = state.pointer.y;
    const speed = Math.hypot(vx, vy) / Math.max(dt, 0.001);
    state.vel = damp(state.vel, clamp(speed * 0.32, 0, 1.5), 6, dt);

    // parallax elements
    if (!reduced) {
      for (const el of parallaxEls) {
        const strength = parseFloat(el.dataset.parallax) || 10;
        const rect = el.getBoundingClientRect();
        if (rect.bottom < -200 || rect.top > window.innerHeight + 200) continue;
        const rel = (rect.top + rect.height / 2 - window.innerHeight / 2) / window.innerHeight;
        el.style.transform = `translate3d(0, ${(-rel * strength).toFixed(2)}px, 0)`;
      }
    }

    for (const cb of state.hooks) cb(state);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/* ---------------------------------------------------------------
   2. Fixed nav: recolour against the surface passing beneath it
----------------------------------------------------------------*/
function initNavTheme() {
  const nav = document.getElementById('site-nav');
  const sections = Array.from(document.querySelectorAll('[data-surface]'));
  if (!nav || !sections.length) return;

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const surface = e.target.getAttribute('data-surface') || 'dark';
        nav.setAttribute('data-theme', surface === 'light' ? 'light' : 'dark');
        const id = e.target.id ? `#${e.target.id}` : null;
        document.querySelectorAll('[data-nav-link]').forEach((a) => {
          const match = id && a.getAttribute('data-nav-link') === id;
          if (match) a.setAttribute('aria-current', 'true');
          else a.removeAttribute('aria-current');
        });
      });
    },
    { rootMargin: '-72px 0px -100% 0px', threshold: 0 },
  );
  sections.forEach((s) => io.observe(s));
}

/* ---------------------------------------------------------------
   3. Staggered reveals + line masks
----------------------------------------------------------------*/
function initReveals() {
  const els = document.querySelectorAll('.reveal, .line-mask');
  if (!('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      });
    },
    { threshold: 0.16, rootMargin: '0px 0px -8% 0px' },
  );
  els.forEach((el) => io.observe(el));
}

/* ---------------------------------------------------------------
   4. Digit rolling / count-up reveals
----------------------------------------------------------------*/
function initCounters() {
  const els = document.querySelectorAll('[data-count]');
  const run = (el) => {
    const target = parseFloat(el.dataset.count || '0');
    const decimals = parseInt(el.dataset.decimals || '0', 10);
    if (reduced) {
      el.textContent = target.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
      return;
    }
    const dur = 1500;
    const start = performance.now();
    const tick = (now) => {
      const p = clamp((now - start) / dur, 0, 1);
      const eased = 1 - Math.pow(1 - p, 4);
      const val = target * eased;
      el.textContent = val.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  if (!('IntersectionObserver' in window)) {
    els.forEach(run);
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          run(e.target);
          io.unobserve(e.target);
        }
      });
    },
    { threshold: 0.5 },
  );
  els.forEach((el) => io.observe(el));
}

/* ---------------------------------------------------------------
   5. Card tilt physics (rotateX / rotateY + spring release)
----------------------------------------------------------------*/
function initTilt() {
  if (reduced || window.matchMedia('(pointer: coarse)').matches) return;
  document.querySelectorAll('[data-tilt]').forEach((el) => {
    const max = 9;
    el.addEventListener(
      'pointermove',
      (e) => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        el.style.transition = 'transform 120ms linear, box-shadow .45s ease';
        el.style.transform = `perspective(900px) rotateX(${(-y * max).toFixed(2)}deg) rotateY(${(x * max).toFixed(2)}deg) scale(1.03)`;
        el.style.boxShadow = '0 34px 60px -34px rgba(0,0,0,.75)';
      },
      { passive: true },
    );
    const release = () => {
      el.style.transition = 'transform .7s cubic-bezier(.2,.9,.25,1), box-shadow .6s ease';
      el.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg) scale(1)';
      el.style.boxShadow = 'none';
    };
    el.addEventListener('pointerleave', release, { passive: true });
    el.addEventListener('blur', release, true);
  });
}

/* ---------------------------------------------------------------
   6. Live operating status (Erbil time, 8:30 AM → 12:30 AM)
----------------------------------------------------------------*/
function initStatus() {
  const OPEN_MIN = 8 * 60 + 30;
  const CLOSE_MIN = 24 * 60 + 30; // 12:30 AM next day

  const parts = () => {
    try {
      const f = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Baghdad',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        weekday: 'short',
      });
      const o = {};
      f.formatToParts(new Date()).forEach((p) => (o[p.type] = p.value));
      const h = parseInt(o.hour, 10) % 24;
      const m = parseInt(o.minute, 10);
      return { mins: h * 60 + m, h, m, weekday: o.weekday };
    } catch {
      const d = new Date();
      return { mins: d.getHours() * 60 + d.getMinutes(), h: d.getHours(), m: d.getMinutes(), weekday: d.toLocaleDateString('en', { weekday: 'short' }) };
    }
  };

  const fmt = (h, m, h12 = true) => {
    const hh = h12 ? ((h + 11) % 12) + 1 : h;
    const ap = h >= 12 && h < 24 ? 'PM' : 'AM';
    return `${hh}:${String(m).padStart(2, '0')} ${h12 ? ap : ''}`.trim();
  };

  const update = () => {
    const { mins, h, m, weekday } = parts();
    const open = mins >= OPEN_MIN && mins < CLOSE_MIN;
    const label = open ? 'Open now' : 'Closed now';
    const detail = open ? `Closes 12:30 AM · ${fmt(h, m)}` : `Opens 8:30 AM · ${fmt(h, m)}`;

    document.querySelectorAll('[data-status]').forEach((el) => {
      el.textContent = label;
      el.classList.toggle('text-[#7ee0a1]', open && el.closest('[data-surface="light"]') === null);
      el.classList.toggle('text-[#2f9e63]', open && !!el.closest('[data-surface="light"]'));
      el.classList.toggle('text-[#ff8a6b]', !open);
    });
    document.querySelectorAll('[data-status-sub]').forEach((el) => {
      el.textContent = detail;
    });
    document.querySelectorAll('[data-status-dot]').forEach((el) => {
      el.style.background = open ? (el.closest('[data-surface="light"]') ? '#2f9e63' : '#7ee0a1') : '#ff8a6b';
    });

    const idxMap = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
    const today = idxMap[weekday] ?? (new Date().getDay() + 6) % 7;
    document.querySelectorAll('[data-hours-row]').forEach((row) => {
      const isToday = Number(row.getAttribute('data-hours-row')) === today;
      row.style.background = isToday ? 'rgba(224,162,74,.16)' : '';
      row.style.fontWeight = isToday ? '600' : '';
      row.style.borderRadius = isToday ? '8px' : '';
    });
  };

  update();
  setInterval(update, 30000);
}

/* ---------------------------------------------------------------
   7. Ambient dust / steam particle field (2D canvas, cursor repulsion)
----------------------------------------------------------------*/
function initDust() {
  const canvas = document.getElementById('dust-canvas');
  if (!canvas || reduced) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let w = 0;
  let h = 0;
  let dpr = 1;
  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener('resize', resize, { passive: true });

  const N = window.innerWidth < 768 ? 34 : 64;
  const parts = Array.from({ length: N }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    vx: (Math.random() - 0.5) * 0.12,
    vy: -0.08 - Math.random() * 0.16,
    r: 0.7 + Math.random() * 1.9,
    a: 0.15 + Math.random() * 0.4,
    hue: Math.random() > 0.6 ? '224,162,74' : '241,241,239',
  }));

  const draw = () => {
    ctx.clearRect(0, 0, w, h);
    for (const p of parts) {
      // cursor repulsion
      const dx = p.x - state.px;
      const dy = p.y - state.py;
      const d2 = dx * dx + dy * dy;
      if (d2 < 20000 && d2 > 0.01) {
        const d = Math.sqrt(d2);
        const f = (1 - d / 141) * 0.7;
        p.vx += (dx / d) * f;
        p.vy += (dy / d) * f;
      }
      p.vx *= 0.975;
      p.vy = p.vy * 0.975 - 0.0016;
      p.x += p.vx + Math.sin((state.t + p.r * 40) * 0.5) * 0.14;
      p.y += p.vy;

      if (p.y < -10) { p.y = h + 8; p.x = Math.random() * w; p.vy = -0.08 - Math.random() * 0.16; }
      if (p.x < -10) p.x = w + 8;
      if (p.x > w + 10) p.x = -8;

      ctx.beginPath();
      ctx.fillStyle = `rgba(${p.hue},${p.a})`;
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
}

onReady(() => {
  initNavTheme();
  initReveals();
  initCounters();
  initTilt();
  initStatus();
  initDust();
  initLoop();
});