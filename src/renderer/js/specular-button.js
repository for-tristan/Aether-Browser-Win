// specular-button.js — Vanilla JS port of React Bits SpecularButton component
// WebGL2 shader-based glass button with specular light that follows the cursor
window.Aether = window.Aether || {};

Aether.SpecularButton = (() => {
  const PAD = 24;
  const TAU = Math.PI * 2;

  const VERTEX = `#version 300 es
in vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }`;

  const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 uCenter; uniform vec2 uHalf; uniform float uRadius; uniform float uPx;
uniform float uSpot; uniform vec2 uEntry; uniform vec3 uLineColor; uniform vec3 uBaseColor;
uniform float uIntensity; uniform vec2 uWindow; uniform float uThickness; uniform float uGlow;
out vec4 outColor;
float roundedBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
float loopPosition(vec2 p, vec2 b, float r) {
  vec2 inner = b - r; float arc = 1.5707963 * r; float quarter = inner.x + inner.y + arc;
  vec2 a = abs(p); vec2 q = a - inner; float s;
  s = q.x > 0.0 && q.y > 0.0 ? inner.y + atan(q.y, q.x) * r : (q.x > q.y ? min(a.y, inner.y) : inner.y + arc + inner.x - min(a.x, inner.x));
  if (p.x < 0.0) s = p.y >= 0.0 ? 2.0 * quarter - s : 2.0 * quarter + s;
  else if (p.y < 0.0) s = 4.0 * quarter - s;
  return s / max(4.0 * quarter, 0.0001);
}
float lobe(float position, float center) { float gap = abs(fract(position - center + 0.5) - 0.5); return 1.0 - smoothstep(uWindow.x, uWindow.x + uWindow.y, gap); }
void main() {
  vec2 p = gl_FragCoord.xy - uCenter; float d = roundedBox(p, uHalf, uRadius);
  float position = loopPosition(p, uHalf, uRadius);
  float key = lobe(position, uSpot); float back = lobe(position, uSpot + 0.5);
  float streak = key + back * 0.45;
  float width = max(uThickness * uPx * mix(1.0, max(key, back), 0.6), 0.35);
  float band = smoothstep(-width - 0.6, -width + 0.6, d) * (1.0 - smoothstep(-0.6, 0.6, d));
  float hair = smoothstep(-uPx - 0.6, -uPx + 0.6, d) * (1.0 - smoothstep(-0.6, 0.6, d));
  float inside = 1.0 - smoothstep(-0.6, 0.6, d);
  vec2 pool = (p - uEntry) / (uHalf.y * vec2(1.6, 1.1));
  float glow = streak * 0.2 * exp(-abs(d + width * 0.5) / (5.0 * uPx)) + inside * 0.08 * exp(-dot(pool, pool));
  float light = clamp((band * streak + glow * uGlow) * uIntensity, 0.0, 1.0);
  vec4 base = vec4(uBaseColor, 1.0) * hair * 0.6;
  outColor = vec4(uLineColor, 1.0) * light + base * (1.0 - light);
}`;

  const UNIFORMS = ['uCenter','uHalf','uRadius','uPx','uSpot','uEntry','uLineColor','uBaseColor','uIntensity','uWindow','uThickness','uGlow'];
  const clampVal = (v, mn, mx) => Math.min(mx, Math.max(mn, v));
  const wrap = v => v - Math.floor(v);

  function loopPos(x, y, hx, hy, r) {
    const ix = hx - r, iy = hy - r, arc = (Math.PI/2)*r, q = ix + iy + arc;
    const ax = Math.abs(x), ay = Math.abs(y), qx = ax - ix, qy = ay - iy;
    let s;
    if (qx > 0 && qy > 0) s = iy + Math.atan2(qy, qx) * r;
    else if (qx > qy) s = Math.min(ay, iy);
    else s = iy + arc + ix - Math.min(ax, ix);
    if (x < 0) s = y >= 0 ? 2*q - s : 2*q + s;
    else if (y < 0) s = 4*q - s;
    return wrap(s / Math.max(4*q, 0.0001));
  }

  function rimPoint(pos, hx, hy, r) {
    const ix = hx - r, iy = hy - r, arc = (Math.PI/2)*r, q = ix + iy + arc;
    let s = wrap(pos) * 4 * q, sx = 1, sy = 1;
    if (s > 3*q) { s = 4*q - s; sy = -1; }
    else if (s > 2*q) { s -= 2*q; sx = -1; sy = -1; }
    else if (s > q) { s = 2*q - s; sx = -1; }
    let x = ix - (s - iy - arc), y = hy;
    if (s <= iy) { x = hx; y = s; }
    else if (s <= iy + arc) { const a = (s - iy) / Math.max(r, 0.0001); x = ix + Math.cos(a)*r; y = iy + Math.sin(a)*r; }
    return [x * sx, y * sy];
  }

  function compile(gl, type, src) {
    const sh = gl.createShader(type); if (!sh) return null;
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (gl.getShaderParameter(sh, gl.COMPILE_STATUS)) return sh;
    gl.deleteShader(sh); return null;
  }

  function link(gl) {
    const v = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const f = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    const prog = gl.createProgram(); if (!v || !f || !prog) return null;
    gl.attachShader(prog, v); gl.attachShader(prog, f);
    gl.bindAttribLocation(prog, 0, 'aPosition'); gl.linkProgram(prog);
    gl.deleteShader(v); gl.deleteShader(f);
    if (gl.getProgramParameter(prog, gl.LINK_STATUS)) return prog;
    gl.deleteProgram(prog); return null;
  }

  function init(buttonEl, props = {}) {
    const p = {
      radius: props.radius !== undefined ? props.radius : 42,
      tint: props.tint || '#ffffff',
      tintOpacity: props.tintOpacity !== undefined ? props.tintOpacity : 0.04,
      blur: props.blur !== undefined ? props.blur : 0,
      textColor: props.textColor || '#f5f5f5',
      lineColor: props.lineColor || '#ffffff',
      baseColor: props.baseColor || '#525252',
      intensity: props.intensity !== undefined ? props.intensity : 1,
      idleIntensity: props.idleIntensity !== undefined ? props.idleIntensity : 0.35,
      shineSize: props.shineSize !== undefined ? props.shineSize : 10,
      shineFade: props.shineFade !== undefined ? props.shineFade : 34,
      thickness: props.thickness !== undefined ? props.thickness : 1.2,
      glow: props.glow !== undefined ? props.glow : 1,
      followMouse: props.followMouse !== undefined ? props.followMouse : true,
      proximity: props.proximity !== undefined ? props.proximity : 250,
      autoAnimate: props.autoAnimate !== undefined ? props.autoAnimate : false,
      speed: props.speed !== undefined ? props.speed : 0.35,
    };

    // Create canvas overlay
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;top:-' + PAD + 'px;left:-' + PAD + 'px;z-index:0;display:block;width:calc(100% + ' + (PAD*2) + 'px);height:calc(100% + ' + (PAD*2) + 'px);pointer-events:none;';
    buttonEl.style.setProperty('--sb-radius', p.radius + 'px');
    buttonEl.style.setProperty('--sb-tint', p.tint);
    buttonEl.style.setProperty('--sb-tint-opacity', p.tintOpacity);
    buttonEl.style.setProperty('--sb-blur', p.blur + 'px');
    buttonEl.style.setProperty('--sb-text-color', p.textColor);
    buttonEl.classList.add('specular-button');
    buttonEl.appendChild(canvas);

    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
    if (!gl) return null;
    const program = link(gl);
    if (!program) return null;

    const uniforms = {};
    UNIFORMS.forEach(n => { uniforms[n] = gl.getUniformLocation(program, n); });
    const buffer = gl.createBuffer();
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    const colors = new Map();
    const view = { width: 1, height: 1, ratio: 1 };
    const pointer = { x: 0, y: 0, known: false };
    const state = { spot: 0, level: 0, press: 0, ready: false };
    let raf = 0, last = 0, visible = true;

    const settings = {
      radius: Math.max(0, p.radius), lineColor: String(p.lineColor), baseColor: String(p.baseColor),
      intensity: Math.max(0, p.intensity), idleIntensity: clampVal(p.idleIntensity, 0, 1),
      shineSize: Math.max(0, p.shineSize), shineFade: Math.max(0, p.shineFade),
      thickness: Math.max(0, p.thickness), glow: Math.max(0, p.glow), speed: p.speed,
      followMouse: p.followMouse, proximity: Math.max(1, p.proximity), autoAnimate: p.autoAnimate,
    };

    function toRgb(v) {
      if (colors.has(v)) return colors.get(v);
      let rgb = [1,1,1];
      if (probe) { probe.clearRect(0,0,1,1); probe.fillStyle = '#000'; probe.fillStyle = v; probe.fillRect(0,0,1,1); const [r,g,b] = probe.getImageData(0,0,1,1).data; rgb = [r/255, g/255, b/255]; }
      colors.set(v, rgb); return rgb;
    }
    function cornerR(s) { return Math.min(s.radius, view.width/2, view.height/2); }
    function restSpot(s) { const r = cornerR(s); const ins = r * (1 - Math.SQRT1_2); return loopPos(ins - view.width/2, view.height/2 - ins, view.width/2, view.height/2, r); }
    function aim(s) {
      if (!s.followMouse || !pointer.known) return null;
      const rect = buttonEl.getBoundingClientRect();
      const scale = rect.width / view.width || 1;
      const hx = view.width/2, hy = view.height/2;
      const x = (pointer.x - rect.left - rect.width/2) / scale;
      const y = (rect.top + rect.height/2 - pointer.y) / scale;
      const dist = Math.hypot(Math.max(Math.abs(x) - hx, 0), Math.max(Math.abs(y) - hy, 0));
      const t = clampVal(1 - dist / s.proximity, 0, 1);
      const near = t * t * (3 - 2 * t);
      const nearest = loopPos(x, y, hx, hy, cornerR(s));
      if (dist > 0) return { spot: nearest, near };
      const depth = clampVal(Math.min(hx - Math.abs(x), hy - Math.abs(y)) / (hy * 0.8), 0, 1);
      const sway = restSpot(s) - (x / hx) * 0.06 - (y / hy) * 0.02;
      const offset = sway - nearest - Math.round(sway - nearest);
      return { spot: wrap(nearest + offset * depth * depth * (3 - 2 * depth)), near };
    }
    function draw(s) {
      const { width, height } = view;
      const sX = canvas.width / (width + PAD * 2), sY = canvas.height / (height + PAD * 2);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniform2f(uniforms.uCenter, (PAD + width/2) * sX, (PAD + height/2) * sY);
      gl.uniform2f(uniforms.uHalf, (width/2) * sX, (height/2) * sY);
      gl.uniform1f(uniforms.uRadius, Math.min(s.radius, width/2, height/2) * sX);
      gl.uniform1f(uniforms.uPx, view.ratio);
      const r = Math.min(s.radius, width/2, height/2);
      const [rx, ry] = rimPoint(state.spot, width/2, height/2, r);
      const pull = 1 - Math.min(0.35 * (height/2), Math.hypot(rx, ry)) / Math.max(Math.hypot(rx, ry), 0.0001);
      gl.uniform1f(uniforms.uSpot, state.spot);
      gl.uniform2f(uniforms.uEntry, rx * pull * sX, ry * pull * sY);
      gl.uniform3fv(uniforms.uLineColor, toRgb(s.lineColor));
      gl.uniform3fv(uniforms.uBaseColor, toRgb(s.baseColor));
      gl.uniform1f(uniforms.uIntensity, s.intensity * (state.level + state.press * 0.8));
      gl.uniform2f(uniforms.uWindow, s.shineSize / 360 + state.press * 0.06, s.shineFade / 360 + 0.0001);
      gl.uniform1f(uniforms.uThickness, s.thickness);
      gl.uniform1f(uniforms.uGlow, s.glow);
      gl.bindVertexArray(vao); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.bindVertexArray(null);
    }
    function frame(now) {
      raf = 0; if (!visible) return;
      const s = settings; const dt = last ? Math.min(0.05, (now - last) / 1000) : 1/60;
      last = now; const target = aim(s);
      const spinning = s.autoAnimate; const steering = !!target && target.near > 0;
      if (!state.ready) { state.spot = restSpot(s); state.level = s.autoAnimate ? 1 : s.idleIntensity; state.ready = true; }
      let diff = 0;
      if (spinning && !steering) state.spot = wrap(state.spot + (s.speed / TAU) * dt);
      else { diff = (steering ? target.spot : restSpot(s)) - state.spot; diff -= Math.round(diff); state.spot = wrap(state.spot + diff * (1 - Math.exp(-dt * 8))); }
      const level = s.autoAnimate ? 1 : s.idleIntensity + (1 - s.idleIntensity) * (target ? target.near : 0);
      state.level += (level - state.level) * (1 - Math.exp(-dt * 7));
      state.press *= Math.exp(-dt * 5);
      draw(s);
      const settling = Math.abs(diff) > 0.0002 || Math.abs(level - state.level) > 0.001 || state.press > 0.002;
      if (settling || (spinning && !steering)) raf = requestAnimationFrame(frame); else last = 0;
    }
    function wake() { if (!raf && visible) raf = requestAnimationFrame(frame); }
    function measure() {
      view.width = Math.max(1, buttonEl.offsetWidth);
      view.height = Math.max(1, buttonEl.offsetHeight);
      view.ratio = Math.min(window.devicePixelRatio || 1, 3);
      canvas.width = Math.max(1, Math.round((view.width + PAD * 2) * view.ratio));
      canvas.height = Math.max(1, Math.round((view.height + PAD * 2) * view.ratio));
      if (state.ready) draw(settings); wake();
    }
    function onMove(e) { pointer.x = e.clientX; pointer.y = e.clientY; pointer.known = true; wake(); }
    function onDown(e) { pointer.x = e.clientX; pointer.y = e.clientY; pointer.known = true; state.press = 1; wake(); }
    function onEnd(e) { if (e.pointerType === 'mouse') return; pointer.known = false; wake(); }
    function onLeave() { pointer.known = false; wake(); }

    const ro = new ResizeObserver(measure); ro.observe(buttonEl);
    const io = new IntersectionObserver(es => { visible = es.some(e => e.isIntersecting); if (visible) { last = 0; wake(); } });
    io.observe(buttonEl);
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onEnd, { passive: true });
    window.addEventListener('pointercancel', onEnd, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    buttonEl.addEventListener('pointerdown', onDown);
    measure();

    return {
      destroy() {
        cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onEnd);
        window.removeEventListener('pointercancel', onEnd);
        document.documentElement.removeEventListener('pointerleave', onLeave);
        buttonEl.removeEventListener('pointerdown', onDown);
        gl.deleteBuffer(buffer); gl.deleteVertexArray(vao); gl.deleteProgram(program);
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        canvas.remove();
      }
    };
  }

  return { init };
})();
