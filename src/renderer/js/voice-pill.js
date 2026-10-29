// voice-pill.js — Vanilla JS port of React Bits VoicePill component
// A mic button that expands into a capsule with waveform + timer when active
window.Aether = window.Aether || {};

Aether.VoicePill = (() => {
  const LOOP = 4.8;
  const SYLLABLES = [
    [0.1, 0.16, 0.9], [0.3, 0.12, 0.7], [0.5, 0.2, 1], [0.95, 0.14, 0.8],
    [1.15, 0.1, 0.6], [1.3, 0.22, 0.95], [1.9, 0.16, 0.85], [2.12, 0.12, 0.7],
    [2.3, 0.18, 0.9], [2.55, 0.1, 0.5], [3.05, 0.24, 1], [3.4, 0.12, 0.75], [3.6, 0.16, 0.9]
  ];
  const MIC_BINS = [[1, 4], [4, 11], [11, 33]];
  const MIC_GAIN = 2.2;
  const DT_MAX = 0.05;
  const SLIDE_MIN = 4;
  const WAVE_EVERY = 4;
  const WAVE_MAX = 80;

  function simulatedLevel(t) {
    const u = t % LOOP;
    let a = 0.06;
    for (const [s, d, p] of SYLLABLES) {
      const x = (u - s) / d;
      if (x >= 0 && x <= 1) a = Math.max(a, p * 0.5 * (1 - Math.cos(2 * Math.PI * x)));
    }
    return a * (0.7 + 0.3 * Math.abs(Math.sin(2 * Math.PI * 7.1 * u)));
  }

  function micLevel(analyser, buf) {
    analyser.getByteFrequencyData(buf);
    let total = 0;
    for (const [lo, hi] of MIC_BINS) {
      let s = 0;
      for (let i = lo; i < hi; i++) s += buf[i];
      total += s / ((hi - lo) * 255);
    }
    return (total / MIC_BINS.length) * MIC_GAIN;
  }

  function drawWave(s, canvas, level, color, floor) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    const W = Math.max(1, Math.round(rect.width * dpr));
    const H = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    s.acc = Math.max(s.acc, level);
    s.tick = (s.tick + 1) % WAVE_EVERY;
    if (s.tick === 0) { s.hist.push(s.acc); s.acc = 0; if (s.hist.length > WAVE_MAX) s.hist.shift(); }
    const bw = 2 * dpr, step = 3 * dpr, shift = (s.tick / WAVE_EVERY) * step;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = color;
    for (let i = 0; i < s.hist.length; i++) {
      const v = s.hist[s.hist.length - 1 - i];
      const x = W - (i + 1) * step - shift;
      if (x + bw < 0) break;
      const h = Math.max(bw, (floor + (1 - floor) * v) * H);
      const t = Math.min(1, Math.max(0, (x + bw / 2) / (W * 0.55)));
      const fade = t * t * (3 - 2 * t);
      ctx.globalAlpha = (0.35 + 0.65 * v) * fade;
      ctx.beginPath();
      ctx.roundRect(x, (H - h) / 2, bw, h, bw / 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function clock(ms) {
    const s = Math.floor(ms / 1000);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  async function openMic(s) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx || !navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
    s.audio = s.audio || { ctx: new Ctx() };
    const a = s.audio;
    if (a.ctx.state === 'suspended') a.ctx.resume();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (!s.listening) { stream.getTracks().forEach(t => t.stop()); return; }
    a.stream = stream;
    a.src = a.ctx.createMediaStreamSource(stream);
    a.analyser = a.ctx.createAnalyser();
    a.analyser.fftSize = 256;
    a.analyser.smoothingTimeConstant = 0;
    a.src.connect(a.analyser);
    a.buf = new Uint8Array(a.analyser.frequencyBinCount);
  }

  function closeMic(s) {
    const a = s.audio;
    if (!a?.stream) return;
    a.stream.getTracks().forEach(t => t.stop());
    a.src?.disconnect();
    a.stream = null; a.src = null; a.analyser = null; a.buf = null;
  }

  function init(container, opts) {
    const p = Object.assign({
      accentColor: '#f5f5f5', iconColor: '#a1a1aa', background: '#27272a',
      size: 28, shape: 'pill', reach: 8, showTime: true, waveform: true,
      slideToCancel: true, cancelDistance: 64, attack: 40, release: 240,
      sensitivity: 1, floor: 0.1, openDuration: 200, pressScale: 0.95,
      mode: 'auto', holdAfter: 300, reactive: 'mic', disabled: false,
      onStart: null, onStop: null,
    }, opts || {});

    const radius = p.shape === 'rounded' ? Math.round(p.size * 0.29) : p.size / 2;
    const timeSize = Math.max(10, Math.round(p.size * 0.36));
    const clockW = p.showTime ? Math.round(timeSize * 2.5) + 4 : 0;
    const waveW = p.waveform ? Math.round(p.size * 1.9) : 0;
    const extra = clockW + waveW;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'voice-pill';
    btn.setAttribute('aria-label', 'Dictate');
    btn.style.cssText = `
      --vp-accent:${p.accentColor};--vp-icon:${p.iconColor};--vp-bg:${p.background};
      --vp-size:${p.size}px;--vp-radius:${radius}px;--vp-reach:${p.reach}px;
      --vp-extra:${extra}px;--vp-clock-w:${clockW}px;--vp-wave-w:${waveW}px;
      --vp-stop:${Math.round(p.size * 0.32)}px;--vp-icon-size:${Math.round(p.size * 0.54)}px;
      --vp-time-size:${timeSize}px;--vp-open:${p.openDuration}ms;--vp-press:${p.pressScale};
    `;

    btn.innerHTML = `
      <span class="voice-pill__capsule" aria-hidden="true"></span>
      ${p.waveform ? '<canvas class="voice-pill__wave" aria-hidden="true"></canvas>' : ''}
      ${p.slideToCancel ? '<span class="voice-pill__cancel" aria-hidden="true"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg><span>Cancel</span></span>' : ''}
      ${p.showTime ? '<span class="voice-pill__time" aria-hidden="true">0:00</span>' : ''}
      <span class="voice-pill__glyph">
        <span class="voice-pill__mic"><svg viewBox="0 0 24 24" width="${Math.round(p.size * 0.54)}" height="${Math.round(p.size * 0.54)}" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg></span>
        <span class="voice-pill__stop" aria-hidden="true"></span>
      </span>
    `;
    container.appendChild(btn);

    const waveCanvas = btn.querySelector('.voice-pill__wave');
    const timeEl = btn.querySelector('.voice-pill__time');

    const st = {
      listening: false, pointerId: null, ownPress: false,
      downX: 0, sliding: false, hist: [], tick: 0, acc: 0,
      downAt: 0, startedAt: 0, raf: 0, last: 0, env: 0, t0: 0, audio: null,
    };

    function frame(now) {
      const dt = Math.min((now - st.last) / 1000, DT_MAX);
      st.last = now;
      let target = 0;
      if (st.listening) {
        if (st.audio?.analyser) target = micLevel(st.audio.analyser, st.audio.buf);
        else if (p.reactive !== 'mic') target = simulatedLevel((now - st.t0) / 1000);
      }
      target = Math.min(1, target * p.sensitivity);
      const tau = Math.max(1, target > st.env ? p.attack : p.release) / 1000;
      st.env += (target - st.env) * (1 - Math.exp(-dt / tau));
      if (st.listening && p.showTime && timeEl) {
        const text = clock(now - st.startedAt);
        if (timeEl.textContent !== text) timeEl.textContent = text;
      }
      if (st.listening && p.waveform && waveCanvas) drawWave(st, waveCanvas, st.env, p.accentColor, p.floor);
      st.raf = st.listening ? requestAnimationFrame(frame) : 0;
    }

    function begin(kind) {
      if (st.listening || p.disabled) return;
      st.listening = true;
      st.hist = []; st.tick = 0; st.acc = 0; st.env = 0;
      st.startedAt = performance.now(); st.t0 = st.startedAt; st.last = st.startedAt;
      if (timeEl) timeEl.textContent = '0:00';
      btn.dataset.state = 'listening';
      if (!st.raf) st.raf = requestAnimationFrame(frame);
      p.onStart?.({ source: p.reactive });
      if (p.reactive === 'mic') openMic(st).catch(() => end('mic-denied'));
    }

    function end(reason) {
      if (!st.listening) return;
      st.listening = false;
      closeMic(st);
      btn.dataset.state = 'idle';
      p.onStop?.({ reason, duration: Math.round(performance.now() - st.startedAt) });
    }

    function settleSlide() {
      st.sliding = false;
      delete btn.dataset.sliding;
      btn.style.setProperty('--vp-slide', '0px');
      btn.style.setProperty('--vp-cancel', '0');
    }

    btn.addEventListener('pointerdown', e => {
      if (p.disabled || e.button !== 0 || !e.isPrimary || st.pointerId !== null) return;
      st.pointerId = e.pointerId;
      st.downX = e.clientX;
      st.downAt = performance.now();
      try { btn.setPointerCapture(e.pointerId); } catch {}
      btn.dataset.pressed = '';
      st.ownPress = !st.listening;
      if (!st.listening) begin('pointer');
    });

    btn.addEventListener('pointermove', e => {
      if (btn !== e.currentTarget || st.pointerId !== e.pointerId || !p.slideToCancel || !st.listening || !st.ownPress) return;
      const dx = e.clientX - st.downX;
      if (!st.sliding && dx > -SLIDE_MIN) return;
      st.sliding = true;
      btn.dataset.sliding = '';
      const pull = Math.min(p.cancelDistance + 24, Math.max(0, -dx));
      btn.style.setProperty('--vp-slide', -pull + 'px');
      const progress = Math.min(1, pull / p.cancelDistance);
      btn.style.setProperty('--vp-cancel', progress.toFixed(3));
      if (progress >= 1) { settleSlide(); end('cancel'); }
    });

    btn.addEventListener('pointerup', e => {
      if (e.pointerId !== st.pointerId) return;
      st.pointerId = null;
      delete btn.dataset.pressed;
      if (st.sliding) settleSlide();
      try { if (btn.hasPointerCapture(e.pointerId)) btn.releasePointerCapture(e.pointerId); } catch {}
      if (!st.listening) return;
      const held = performance.now() - st.downAt;
      const isHold = p.mode === 'hold' || (p.mode === 'auto' && held >= p.holdAfter);
      if (st.ownPress) { if (isHold) end('release'); }
      else { end(held < p.holdAfter ? 'tap' : 'release'); }
    });

    btn.addEventListener('pointercancel', e => {
      if (e.pointerId !== st.pointerId) return;
      st.pointerId = null;
      delete btn.dataset.pressed;
      if (st.sliding) settleSlide();
    });

    btn.addEventListener('keydown', e => {
      if (e.key === 'Escape') { end('escape'); return; }
      if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
        e.preventDefault();
        if (st.listening) end('key'); else begin('key');
      }
    });

    return {
      button: btn,
      destroy() {
        end('unmount');
        cancelAnimationFrame(st.raf);
        st.audio?.ctx.close();
        btn.remove();
      }
    };
  }

  return { init };
})();
