// Night Radio: the dial. Tune through the rooms (swipe, scroll, arrows, the brass nudges or a station), see each
// room in the radio's window, read its care tag, dive in. With sound on, tuning plays a few seconds of each room
// through a little static. Below: every room by family, and the bill. The studio intro plays once per session.
(() => {
  'use strict';
  const D = window.NIGHT_RADIO || { rooms: [], families: [] };
  const rooms = D.rooms;
  const $ = s => document.querySelector(s);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = { get: k => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} } };
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const money = n => `$${Number(n || 0).toFixed(2)}`;
  const credits = n => `${Number(n || 0).toLocaleString('en')} credits`;
  const words = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty'];
  $('#room-count').textContent = words[rooms.length] || String(rooms.length);

  // ---- the studio intro: once per session, never on the way back from a room
  const fromRoom = /\/demos\//.test(document.referrer || '');
  const playIntro = () => window.LeleliloIntro && window.LeleliloIntro.play({ base: 'lelelilo-intro/' });
  if (!store.get('nr-intro') && !fromRoom && !/[?&]nointro\b/.test(location.search)) { store.set('nr-intro', '1'); playIntro(); }
  $('#intro-btn').addEventListener('click', () => playIntro());

  if (!('gpu' in navigator)) $('#gpu-note').hidden = false;

  // ---- the band of stations
  const band = $('#band'), inner = $('#band-inner'), radio = $('#radio');
  const STEP = 84;
  const padL = document.createElement('div'), padR = document.createElement('div');
  padL.className = padR.className = 'pad';
  inner.appendChild(padL);
  const stations = rooms.map((r, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'station'; b.setAttribute('role', 'option'); b.id = `st-${r.slug}`;
    b.style.setProperty('--c', r.accent);
    b.setAttribute('aria-label', `${r.no}, ${r.title}: ${r.feature}`);
    b.innerHTML = `<span class="g">${r.glyph || ''}</span><span class="f">${r.freq}</span>`;
    b.addEventListener('click', () => { if (current === i) open(i, b); else tune(i, true); });
    inner.appendChild(b);
    return b;
  });
  inner.appendChild(padR);
  function pads() { const w = Math.max(0, band.clientWidth / 2 - STEP / 2); padL.style.width = padR.style.width = `${w}px`; }
  pads();
  addEventListener('resize', () => { pads(); tune(current, false, true); });

  let current = -1, settleTimer = 0, previewTimer = 0;
  function tune(i, smooth, quiet) {
    i = Math.max(0, Math.min(rooms.length - 1, i));
    band.scrollTo({ left: i * STEP, behavior: smooth && !reduced ? 'smooth' : 'auto' });
    if (!smooth) select(i, quiet);
  }
  band.addEventListener('scroll', () => {
    const i = Math.round(band.scrollLeft / STEP);
    $('#knob').style.transform = `rotate(${band.scrollLeft / STEP * 24}deg)`;
    $('#eye').classList.add('hot'); clearTimeout(settleTimer);
    settleTimer = setTimeout(() => { $('#eye').classList.remove('hot'); select(i); }, 90);
    radio.classList.add('tuning'); wake();
  }, { passive: true });
  band.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { tune(current + 1, true); e.preventDefault(); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { tune(current - 1, true); e.preventDefault(); }
    if (e.key === 'Home') { tune(0, true); e.preventDefault(); }
    if (e.key === 'End') { tune(rooms.length - 1, true); e.preventDefault(); }
    if (e.key === 'Enter') { open(current, band); e.preventDefault(); }
  });
  // a mouse wheel turns the dial, a station per notch
  let wheelAcc = 0;
  band.addEventListener('wheel', e => {
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    e.preventDefault(); wheelAcc += e.deltaY;
    if (Math.abs(wheelAcc) > 40) { tune(current + Math.sign(wheelAcc), true); wheelAcc = 0; }
  }, { passive: false });
  $('#prev').addEventListener('click', () => tune(current - 1, true));
  $('#next').addEventListener('click', () => tune(current + 1, true));

  // ---- the window and the tag
  const screen = $('#screen'), img = $('#screen-img'), clip = $('#screen-clip');
  function select(i, quiet) {
    if (i === current || !rooms[i]) return;
    const r = rooms[i];
    current = i;
    stations.forEach((s, k) => s.setAttribute('aria-selected', String(k === i)));
    band.setAttribute('aria-activedescendant', stations[i].id);
    document.documentElement.style.setProperty('--accent', r.accent);
    const href = `demos/${r.slug}/`;
    screen.href = href; screen.setAttribute('aria-label', `Open ${r.title}`);
    $('#screen-label').textContent = `${r.no} · ${r.title}`;
    for (const old of screen.querySelectorAll('.empty-art')) old.remove();
    screen.classList.remove('clip'); clip.pause(); clip.removeAttribute('src');
    if (r.poster) { img.classList.remove('missing'); img.src = r.poster; img.alt = `${r.title}, a still`; }
    else { img.classList.add('missing'); img.removeAttribute('src'); img.alt = ''; screen.insertAdjacentHTML('afterbegin', `<span class="empty-art" style="color:${esc(r.accent)}">${r.glyph || ''}</span>`); }
    if (r.clip && !reduced) {
      clip.src = r.clip; clip.load();
      clip.oncanplay = () => { if (rooms[current] === r) { clip.play().then(() => screen.classList.add('clip')).catch(() => {}); } };
    }
    if (!quiet && !reduced) { screen.classList.remove('fuzz'); void screen.offsetWidth; screen.classList.add('fuzz'); }
    $('#now-no').textContent = `No. ${r.no}`;
    $('#now-freq').textContent = r.freq;
    $('#now-title').textContent = r.title;
    $('#now-feature').textContent = r.feature;
    $('#now-tagline').textContent = r.tagline;
    $('#now-credits').textContent = credits(r.credits);
    $('#now-usd').textContent = `≈ ${money(r.usd)}`;
    $('#now-open').href = href;
    const tag = $('#now'); tag.classList.remove('swap'); void tag.offsetWidth; tag.classList.add('swap');
    if (history.replaceState) history.replaceState(null, '', `#${r.slug}`);
    setTimeout(() => radio.classList.remove('tuning'), 450);
    clearTimeout(previewTimer);
    if (soundOn && !quiet) previewTimer = setTimeout(() => preview(r), 260);
  }
  $('#now-open').addEventListener('click', e => { e.preventDefault(); open(current, e.currentTarget, e); });
  screen.addEventListener('click', e => { e.preventDefault(); open(current, screen, e); });

  // ---- sound: off until asked; then a crackle of static and a few seconds of each station
  let soundOn = false, ac = null, voice = null, fadeTimer = 0;
  const soundBtn = $('#sound-btn');
  soundBtn.addEventListener('click', () => {
    soundOn = !soundOn;
    soundBtn.setAttribute('aria-pressed', String(soundOn));
    soundBtn.setAttribute('aria-label', soundOn ? 'Sound: on. Each station plays a few seconds as you tune.' : 'Sound: off. Turn on to hear each station as you tune.');
    if (soundOn) { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); ac.resume(); preview(rooms[current]); }
    else stopPreview();
  });
  function crackle() {
    if (!ac) return;
    const len = Math.floor(ac.sampleRate * 0.35), buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) { const env = Math.sin(Math.PI * i / len); d[i] = (Math.random() * 2 - 1) * env * (Math.random() < 0.02 ? 1 : 0.35); }
    const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.7; g.gain.value = 0.12;
    src.buffer = buf; src.connect(f).connect(g).connect(ac.destination); src.start();
  }
  function stopPreview() {
    clearInterval(fadeTimer);
    if (voice) { const v = voice; voice = null; let k = v.volume; const t = setInterval(() => { k -= 0.08; if (k <= 0) { clearInterval(t); v.pause(); } else v.volume = k; }, 30); }
    radio.classList.remove('hearing');
  }
  function preview(r) {
    if (!soundOn || !r || !r.preview) return;
    stopPreview(); crackle();
    const a = new Audio(r.preview.src);
    a.preload = 'auto'; a.volume = 0;
    const start = () => {
      try { a.currentTime = r.preview.at || 0; } catch {}
      a.play().then(() => {
        voice = a; radio.classList.add('hearing');
        let k = 0; fadeTimer = setInterval(() => { k = Math.min(0.9, k + 0.06); a.volume = k; if (k >= 0.9) clearInterval(fadeTimer); }, 40);
        setTimeout(() => { if (voice === a) stopPreview(); }, (r.preview.len || 8) * 1000);
      }).catch(() => {});
    };
    if (a.readyState >= 1) start(); else a.addEventListener('loadedmetadata', start, { once: true });
  }

  // ---- the host dozes when nobody touches the dial
  let idleTimer = 0;
  function wake() { radio.classList.remove('dozing'); clearTimeout(idleTimer); idleTimer = setTimeout(() => radio.classList.add('dozing'), 30000); }
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart']) addEventListener(ev, wake, { passive: true });
  wake();

  // ---- the dive: a midnight circle closes on the room, rimmed with a stitch in its colour, then the room opens
  const dive = $('#dive'), svg = $('#dive-svg');
  function open(i, el, ev) {
    const r = rooms[i]; if (!r) return;
    const href = `demos/${r.slug}/`;
    stopPreview();
    if (reduced) { location.href = href; return; }
    const rect = el && el.getBoundingClientRect ? el.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
    const cx = ev && ev.clientX ? ev.clientX : rect.left + rect.width / 2, cy = ev && ev.clientY ? ev.clientY : rect.top + rect.height / 2;
    const W = innerWidth, H = innerHeight, R0 = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy)) + 20;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = `<defs><mask id="hole"><rect width="${W}" height="${H}" fill="#fff"/><circle id="hole-c" cx="${cx}" cy="${cy}" r="${R0}" fill="#000"/></mask></defs>
      <rect width="${W}" height="${H}" fill="#070d18" mask="url(#hole)"/>
      <circle id="rim" cx="${cx}" cy="${cy}" r="${R0}" fill="none" stroke="${esc(r.accent)}" stroke-width="4" stroke-dasharray="14 10" stroke-linecap="round"/>
      <circle id="knot" cx="${cx}" cy="${cy}" r="0" fill="${esc(r.accent)}"/>`;
    dive.classList.add('on');
    const hole = svg.querySelector('#hole-c'), rim = svg.querySelector('#rim'), knot = svg.querySelector('#knot');
    const T = 700, t0 = performance.now();
    (function step(now) {
      const k = Math.min(1, (now - t0) / T), e = 1 - Math.pow(1 - k, 3), rad = Math.max(0, R0 * (1 - e));
      hole.setAttribute('r', rad); rim.setAttribute('r', rad); rim.setAttribute('stroke-dashoffset', String(-k * 120));
      if (k > 0.85) knot.setAttribute('r', String(8 * (k - 0.85) / 0.15));
      if (k < 1) requestAnimationFrame(step); else setTimeout(() => { location.href = href; }, 90);
    })(t0);
  }
  addEventListener('pageshow', () => { dive.classList.remove('on'); svg.innerHTML = ''; });

  // ---- every room, by family; hovering a card plays its clip
  const fam = $('#families');
  for (const f of D.families) {
    const list = rooms.filter(r => r.family === f);
    if (!list.length) continue;
    const sec = document.createElement('section'); sec.className = 'family';
    sec.innerHTML = `<h3>${esc(f)}</h3><div class="cards"></div>`;
    const cards = sec.querySelector('.cards');
    for (const r of list) {
      const a = document.createElement('a');
      a.className = `card${r.public ? '' : ' private'}`; a.href = `demos/${r.slug}/`; a.style.setProperty('--c', r.accent);
      a.innerHTML = `<div class="pic">${r.poster ? `<img src="${esc(r.poster)}" alt="" loading="lazy" decoding="async">` : `<span class="empty-art">${r.glyph || ''}</span>`}
          ${r.clip ? `<video muted loop playsinline preload="none" data-src="${esc(r.clip)}"></video>` : ''}<span class="price">${credits(r.credits)}</span></div>
        <div class="body"><span class="no">${r.glyph || ''}${esc(r.no)} · ${esc(r.freq)} FM${r.public ? '' : ' · private'}</span>
          <h4>${esc(r.title)}</h4><p class="feat">${esc(r.feature)}</p><p>${esc(r.tagline)}</p></div>`;
      a.addEventListener('click', e => { e.preventDefault(); open(rooms.indexOf(r), a, e); });
      const v = a.querySelector('video');
      if (v && !reduced) {
        const on = () => { if (!v.src) v.src = v.dataset.src; v.play().then(() => a.classList.add('live')).catch(() => {}); };
        const off = () => { a.classList.remove('live'); v.pause(); };
        a.addEventListener('pointerenter', on); a.addEventListener('focus', on);
        a.addEventListener('pointerleave', off); a.addEventListener('blur', off);
      }
      cards.appendChild(a);
    }
    fam.appendChild(sec);
  }

  // ---- the bill
  const lines = $('#bill-lines');
  for (const r of rooms) {
    const li = document.createElement('li');
    li.innerHTML = `<span>${esc(r.no)}</span><span class="t">${esc(r.title)} <small>${esc(r.feature)}</small></span><span class="cr">${Number(r.credits).toLocaleString('en')}</span><span class="usd">${money(r.usd)}</span>`;
    lines.appendChild(li);
  }
  const tc = rooms.reduce((s, r) => s + Number(r.credits || 0), 0), tu = rooms.reduce((s, r) => s + Number(r.usd || 0), 0);
  $('#bill-total').textContent = `${tc.toLocaleString('en')} credits · ${money(tu)}`;
  $('#bill-note').textContent = D.note || '';

  // ---- care instructions
  const about = $('#about');
  const openAbout = e => { e && e.preventDefault(); about.showModal(); };
  $('#about-btn').addEventListener('click', openAbout);
  $('#about-link').addEventListener('click', openAbout);
  about.addEventListener('click', e => { if (e.target === about || e.target.closest('[data-close]')) about.close(); });

  // ---- start on the room in the address (#06-bouncing-moon), else the first
  const want = decodeURIComponent(location.hash.slice(1));
  const start = Math.max(0, rooms.findIndex(r => r.slug === want));
  requestAnimationFrame(() => { pads(); tune(start, false, true); if (want && start >= 0 && rooms[start]) band.focus({ preventScroll: true }); });

  // ---- gold motes drifting up the night (paused when hidden or with reduced motion)
  const cv = $('#motes'), cx2 = cv.getContext('2d');
  let motes = [], W = 0, H = 0, dpr = 1, raf = 0;
  function size() {
    dpr = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr;
    const n = Math.round(Math.min(70, W * H / 22000));
    motes = Array.from({ length: n }, () => ({ x: Math.random() * W, y: Math.random() * H, r: .6 + Math.random() * 1.6, v: 4 + Math.random() * 10, p: Math.random() * 6.28, a: .25 + Math.random() * .55 }));
  }
  function frame(t) {
    cx2.setTransform(dpr, 0, 0, dpr, 0, 0); cx2.clearRect(0, 0, W, H);
    for (const m of motes) {
      m.y -= m.v / 60; if (m.y < -4) { m.y = H + 4; m.x = Math.random() * W; }
      const tw = .6 + .4 * Math.sin(t / 900 + m.p);
      cx2.globalAlpha = m.a * tw; cx2.fillStyle = '#ffd77a';
      cx2.beginPath(); cx2.arc(m.x + Math.sin(t / 2400 + m.p) * 6, m.y, m.r, 0, 6.283); cx2.fill();
    }
    raf = requestAnimationFrame(frame);
  }
  size(); addEventListener('resize', size);
  if (!reduced) {
    raf = requestAnimationFrame(frame);
    document.addEventListener('visibilitychange', () => { if (document.hidden) cancelAnimationFrame(raf); else raf = requestAnimationFrame(frame); });
  }
})();
