// gradient-waves.js — Vanilla JS port of React Bits GradientWaves component
// WebGL2 shader-based animated wave background
window.Aether = window.Aether || {};

Aether.GradientWaves = (() => {
  const MAX_SWELLS = 4;
  const SWELL_SECONDS = 3.2;
  const SWELL_GAIN = 2.8;
  const SWELL_WIDTH = 8;
  const INTRO_SECONDS = 2.6;
  const CAMERA_HEIGHT = 30;
  const QUALITY = { low: 56, medium: 84, high: 120 };

  const VERTEX = `#version 300 es
in vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }`;

  const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform float uClock;
uniform float uAmplitude;
uniform float uWaveScale;
uniform float uWaveRatio;
uniform float uSwell;
uniform float uTurbulence;
uniform float uHeight;
uniform float uTilt;
uniform float uZoom;
uniform vec2 uLook;
uniform float uFogDepth;
uniform float uBrightness;
uniform float uOpacity;
uniform float uGrain;
uniform vec3 uHorizon;
uniform vec3 uWave;
uniform vec3 uCrest;
uniform vec3 uBackground;
uniform float uOpaque;
uniform float uLight;
uniform vec3 uSun;
uniform float uRelief;
uniform float uSheen;
uniform float uSteps;
uniform float uStride;
uniform vec3 uIntro;
uniform vec3 uSwells[${MAX_SWELLS}];
uniform float uSwellWidth;
out vec4 outColor;
const float FAR = 4000.0;
float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 surface(vec2 xy) {
  vec2 freq = vec2(uWaveScale / 7.0, (uWaveScale * uWaveRatio) / 3.0);
  vec4 tc = vec4(uTime / 0.130, uTime / 0.810, uTime / 0.200, uTime / 0.710);
  float a = xy.x + tc.x;
  float swellPhase = (xy.y + a) / 20.0 + tc.y;
  float bend = uSwell * cos(swellPhase) / 20.0;
  float mx = a + uSwell * sin(swellPhase);
  float crossPhase = xy.x / 23.0 + tc.w;
  float my = xy.y - tc.z + uTurbulence * cos(crossPhase);
  float twist = -uTurbulence * sin(crossPhase) / 23.0;
  float cx = cos(mx * freq.x);
  float cy = cos(my * freq.y);
  float rise = 1.0;
  if (uIntro.z > 0.0) rise = mix(1.0, smoothstep(uIntro.y * 0.45, uIntro.y * 1.6, xy.x), uIntro.z);
  float amp = uAmplitude * rise;
  float h = (sin(mx * freq.x) + sin(my * freq.y)) * amp + uHeight;
  float dx = amp * (freq.x * cx * (1.0 + bend) + freq.y * cy * twist);
  float dy = amp * (freq.x * cx * bend + freq.y * cy);
  for (int k = 0; k < ${MAX_SWELLS}; k++) {
    vec3 sw = uSwells[k];
    if (sw.z <= 0.0) continue;
    float u = (xy.x - sw.x) / uSwellWidth;
    float v = (xy.y - sw.y) / (uSwellWidth * 3.5);
    float bump = sw.z * exp(-u * u - v * v);
    h += bump; dx += bump * (-2.0 * u / uSwellWidth); dy += bump * (-2.0 * v / (uSwellWidth * 3.5));
  }
  return vec3(h, dx, dy);
}
float march(vec3 origin, vec3 dir) {
  float dist = 0.0;
  for (int i = 0; i < 128; i++) {
    if (float(i) >= uSteps) break;
    float gap = origin.z + dist * dir.z - surface(origin.xy + dist * dir.xy).x;
    if (abs(gap) < 0.002 * dist + 0.01) break;
    dist += uStride * gap;
    if (!(abs(dist) < FAR)) return FAR;
  }
  return dist;
}
void main() {
  float c; float s;
  float vfov = (3.14159 / 2.3) / max(uZoom, 0.05);
  vec3 cam = vec3(0.0, 0.0, ${CAMERA_HEIGHT.toFixed(1)});
  vec2 uv = gl_FragCoord.xy / uResolution - 0.5;
  uv.x *= uResolution.x / uResolution.y; uv.y *= -1.0;
  vec3 dir = vec3(0.0, 0.0, -1.0);
  float ulen = length(uv);
  float xrot = vfov * ulen;
  c = cos(xrot); s = sin(xrot);
  dir = mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c) * dir;
  vec2 nuv = ulen > 1e-5 ? uv / ulen : vec2(1.0, 0.0);
  dir = mat3(nuv.x, -nuv.y, 0.0, nuv.y, nuv.x, 0.0, 0.0, 0.0, 1.0) * dir;
  c = cos(uTilt + uLook.y); s = sin(uTilt + uLook.y);
  dir = mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c) * dir;
  c = cos(uLook.x); s = sin(uLook.x);
  dir = mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0) * dir;
  float dist = march(cam, dir);
  vec3 pos = cam + dist * dir;
  vec3 field = surface(pos.xy);
  vec3 view = -dir;
  float crest = clamp((field.x - uHeight) / max(2.0 * uAmplitude, 0.001) * 0.5 + 0.5, 0.0, 1.0);
  vec3 body = mix(uWave, uCrest, smoothstep(0.45, 1.0, crest) * 0.5);
  vec3 normal = normalize(vec3(-field.yz * (1.0 + 1.5 * uRelief), 1.0));
  float diffuse = clamp(dot(normal, uSun) * 0.5 + 0.5, 0.0, 1.0);
  float lightness = mix(1.0, diffuse * diffuse * (3.0 - 2.0 * diffuse), uRelief);
  float sheen = pow(clamp(dot(normal, normalize(uSun + view)), 0.0, 1.0), 14.0) * uSheen * (0.4 + 0.6 * uRelief);
  float rim = pow(1.0 - clamp(dot(normal, view), 0.0, 1.0), 3.0);
  vec3 col; float alpha;
  float haze = 1.0 - exp(-dist / (uFogDepth * 5.0));
  float fade = 1.0 - smoothstep(0.35, 1.0, haze);
  if (uLight < 0.5) {
    vec3 lit = mix(uHorizon * 0.18, body, lightness) + uCrest * sheen;
    lit = mix(lit, uHorizon, rim * 0.15 * uRelief);
    col = mix(lit, uHorizon, smoothstep(0.0, 1.0, haze)) * 0.85 * uBrightness;
    alpha = fade;
  } else {
    vec3 hue = mix(uHorizon, body, 0.35 + 0.65 * lightness);
    float density = mix(0.16, 0.9, 1.0 - lightness);
    density *= 1.0 - clamp(sheen, 0.0, 1.0) * 0.85;
    density *= 1.0 - 0.5 * smoothstep(0.0, 1.0, haze);
    col = hue; alpha = fade * clamp(density * uBrightness, 0.0, 1.0);
  }
  float reveal = uIntro.x;
  col = clamp(col, 0.0, 1.0);
  float grain = (hash(gl_FragCoord.xy + fract(uClock) * 64.0) - 0.5) * uGrain;
  alpha = clamp(alpha * (1.0 + grain), 0.0, 1.0) * reveal * uOpacity;
  if (uOpaque > 0.5) { outColor = vec4(mix(uBackground, col, alpha), 1.0); }
  else { outColor = vec4(col * alpha, alpha); }
}`;

  const clampVal = (v, mn, mx) => Math.min(mx, Math.max(mn, v));
  const easeInOut = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  let probe = null;
  function parseColor(value, fallback) {
    if (value === 'transparent') return null;
    if (typeof document === 'undefined') return fallback;
    if (!probe) probe = document.createElement('canvas').getContext('2d');
    if (!probe) return fallback;
    probe.fillStyle = '#000000';
    probe.fillStyle = value;
    const text = probe.fillStyle;
    if (text.startsWith('#')) {
      const hex = parseInt(text.slice(1), 16);
      return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
    }
    const match = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(text);
    if (!match) return fallback;
    if (match[4] !== undefined && Number(match[4]) === 0) return null;
    return [Number(match[1]) / 255, Number(match[2]) / 255, Number(match[3]) / 255];
  }

  function compile(gl, type, source) {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { gl.deleteShader(shader); return null; }
    return shader;
  }

  function init(container, props = {}) {
    const p = {
      horizonColor: props.horizonColor || '#1a1a2e',
      waveColor: props.waveColor || '#16213e',
      crestColor: props.crestColor || '#0f3460',
      backgroundColor: props.backgroundColor || 'transparent',
      lightMode: props.lightMode !== undefined ? props.lightMode : false,
      speed: props.speed !== undefined ? props.speed : 0.4,
      amplitude: props.amplitude !== undefined ? props.amplitude : 2.5,
      waveScale: props.waveScale !== undefined ? props.waveScale : 0.6,
      waveRatio: props.waveRatio !== undefined ? props.waveRatio : 0.9,
      swell: props.swell !== undefined ? props.swell : 35,
      turbulence: props.turbulence !== undefined ? props.turbulence : 20,
      tilt: props.tilt !== undefined ? props.tilt : 64,
      zoom: props.zoom !== undefined ? props.zoom : 1,
      height: props.height !== undefined ? props.height : 5.5,
      fogDepth: props.fogDepth !== undefined ? props.fogDepth : 15,
      relief: props.relief !== undefined ? props.relief : 1,
      lightAngle: props.lightAngle !== undefined ? props.lightAngle : 120,
      sheen: props.sheen !== undefined ? props.sheen : 0,
      brightness: props.brightness !== undefined ? props.brightness : 1,
      opacity: props.opacity !== undefined ? props.opacity : 0.6,
      grain: props.grain !== undefined ? props.grain : 0.2,
      quality: props.quality || 'medium',
      intro: props.intro !== undefined ? props.intro : true,
      mouseInteraction: props.mouseInteraction !== undefined ? props.mouseInteraction : true,
      parallaxStrength: props.parallaxStrength !== undefined ? props.parallaxStrength : 0.5,
      mouseStrength: props.mouseStrength !== undefined ? props.mouseStrength : 0.6,
      swellOnClick: props.swellOnClick !== undefined ? props.swellOnClick : true,
      paused: props.paused !== undefined ? props.paused : false,
      dpr: props.dpr !== undefined ? props.dpr : 2,
    };

    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
    container.appendChild(canvas);

    const gl = canvas.getContext('webgl2', { alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, powerPreference: 'high-performance' });
    if (!gl) { canvas.remove(); return null; }

    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl.createProgram();
    if (!vertex || !fragment || !program) { canvas.remove(); return null; }
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.bindAttribLocation(program, 0, 'aPosition');
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { gl.deleteProgram(program); canvas.remove(); return null; }

    const u = {};
    ['uResolution','uTime','uClock','uAmplitude','uWaveScale','uWaveRatio','uSwell','uTurbulence','uHeight','uTilt','uZoom','uLook','uFogDepth','uBrightness','uOpacity','uGrain','uHorizon','uWave','uCrest','uBackground','uOpaque','uLight','uSun','uRelief','uSheen','uSteps','uStride','uIntro','uSwells','uSwellWidth'].forEach(n => { u[n] = gl.getUniformLocation(program, n); });

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.useProgram(program);

    const swellData = new Float32Array(MAX_SWELLS * 3);
    const state = { width: 1, height: 1, cssWidth: 0, cssHeight: 0, time: 0, clock: 0, last: 0, raf: 0, visible: false, introAt: -1, pointer: [0.5, 0.5], inside: false, look: [0, 0], steer: [0, 0], swells: [], quiet: 0 };

    const settings = {
      horizon: parseColor(p.horizonColor, [0.32, 0.15, 1]) || [0.32, 0.15, 1],
      wave: parseColor(p.waveColor, [1, 0.62, 0.99]) || [1, 0.62, 0.99],
      crest: parseColor(p.crestColor, [1, 1, 1]) || [1, 1, 1],
      paper: parseColor(p.backgroundColor, null),
      lightMode: p.lightMode,
      speed: p.speed,
      amplitude: Math.max(0, p.amplitude),
      waveScale: Math.max(0.01, p.waveScale),
      waveRatio: Math.max(0.01, p.waveRatio),
      swell: p.swell, turbulence: p.turbulence,
      tilt: (clampVal(p.tilt, 10, 85) * Math.PI) / 180,
      zoom: Math.max(0.05, p.zoom),
      height: p.height, fogDepth: Math.max(0.5, p.fogDepth),
      relief: clampVal(p.relief, 0, 1),
      lightAngle: (p.lightAngle * Math.PI) / 180,
      sheen: Math.max(0, p.sheen), brightness: Math.max(0, p.brightness),
      opacity: clampVal(p.opacity, 0, 1),
      grain: typeof p.grain === 'number' ? Math.max(0, p.grain) : 0,
      steps: QUALITY[p.quality] || QUALITY.medium,
      intro: p.intro, mouseInteraction: p.mouseInteraction,
      parallaxStrength: Math.max(0, p.parallaxStrength),
      mouseStrength: clampVal(p.mouseStrength, 0, 1),
      swellOnClick: p.swellOnClick, paused: p.paused, dpr: Math.max(0.5, p.dpr),
    };

    function fit() {
      const ratio = Math.min(window.devicePixelRatio || 1, settings.dpr);
      const w = Math.max(1, Math.round(state.cssWidth * ratio));
      const h = Math.max(1, Math.round(state.cssHeight * ratio));
      if (w === state.width && h === state.height) return;
      state.quiet = 0; state.width = w; state.height = h;
      canvas.width = w; canvas.height = h;
    }
    function measure() {
      state.cssWidth = container.clientWidth; state.cssHeight = container.clientHeight;
      fit(); wake();
    }
    function introProgress(s, reduced) {
      if (!s.intro || reduced || state.introAt < 0) return 1;
      return clampVal((state.clock - state.introAt) / INTRO_SECONDS, 0, 1);
    }
    function render(reduced) {
      const s = settings;
      gl.viewport(0, 0, state.width, state.height);
      gl.uniform2f(u.uResolution, state.width, state.height);
      gl.uniform1f(u.uTime, state.time); gl.uniform1f(u.uClock, state.clock);
      gl.uniform1f(u.uAmplitude, s.amplitude); gl.uniform1f(u.uWaveScale, s.waveScale);
      gl.uniform1f(u.uWaveRatio, s.waveRatio); gl.uniform1f(u.uSwell, s.swell);
      gl.uniform1f(u.uTurbulence, s.turbulence); gl.uniform1f(u.uHeight, s.height);
      gl.uniform1f(u.uTilt, s.tilt); gl.uniform1f(u.uZoom, s.zoom);
      gl.uniform2f(u.uLook, state.look[0], state.look[1]);
      gl.uniform1f(u.uFogDepth, s.fogDepth); gl.uniform1f(u.uBrightness, s.brightness);
      gl.uniform1f(u.uOpacity, s.opacity); gl.uniform1f(u.uGrain, s.grain);
      gl.uniform3fv(u.uHorizon, s.horizon); gl.uniform3fv(u.uWave, s.wave); gl.uniform3fv(u.uCrest, s.crest);
      const pc = s.paper || [0,0,0]; gl.uniform3f(u.uBackground, pc[0], pc[1], pc[2]);
      gl.uniform1f(u.uOpaque, s.paper ? 1 : 0); gl.uniform1f(u.uLight, s.lightMode ? 1 : 0);
      const elev = 0.52; const ang = s.lightAngle + state.steer[0] * s.mouseStrength * 2;
      const alt = elev - state.steer[1] * s.mouseStrength * 0.7;
      gl.uniform3f(u.uSun, Math.cos(alt) * Math.cos(ang), Math.cos(alt) * Math.sin(ang), Math.sin(alt));
      gl.uniform1f(u.uRelief, s.relief); gl.uniform1f(u.uSheen, s.sheen); gl.uniform1f(u.uSteps, s.steps);
      const slope = s.amplitude * ((s.waveScale/7)*(1+Math.abs(s.swell)/20) + ((s.waveScale*s.waveRatio)/3)*(1+Math.abs(s.turbulence)/23));
      const prog = introProgress(s, reduced);
      const shown = Math.min(1, prog / 0.22);
      const crest = 160 * Math.pow(3/160, easeInOut(Math.max(0, (prog - 0.1) / 0.9)));
      const settle = clampVal((prog - 0.75) / 0.25, 0, 1);
      gl.uniform3f(u.uIntro, shown*shown*(3-2*shown), crest, 1 - settle*settle*(3-2*settle));
      swellData.fill(0);
      let swellPeak = 0;
      state.swells.forEach((sw, i) => {
        const age = state.clock - sw.at; const life = age / SWELL_SECONDS;
        const env = (1 - Math.exp(-age / 0.25)) * Math.pow(1 - life, 1.6);
        const lift = s.amplitude * SWELL_GAIN * env;
        swellData.set([sw.x - age * 12, sw.y, lift], i * 3);
        swellPeak = Math.max(swellPeak, lift);
      });
      gl.uniform3fv(u.uSwells, swellData);
      gl.uniform1f(u.uSwellWidth, SWELL_WIDTH);
      gl.uniform1f(u.uStride, 0.9 / Math.max(1, (slope + (swellPeak * 0.86) / SWELL_WIDTH) / 1.5));
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    function tick(now) {
      state.raf = 0;
      if (!state.visible || document.hidden) return;
      const s = settings; const dt = state.last ? Math.min((now - state.last) / 1000, 0.1) : 0;
      state.last = now; const reduced = false;
      state.clock += dt;
      if (state.introAt < 0) state.introAt = state.clock;
      if (!s.paused) state.time += dt * s.speed;
      const steering = s.mouseInteraction && state.inside;
      const target = steering ? state.pointer : [0.5, 0.5];
      const ease = 1 - Math.exp(-dt / 0.45);
      const goalX = (target[0] - 0.5) * s.parallaxStrength * 0.35;
      const goalY = (target[1] - 0.5) * s.parallaxStrength * 0.18;
      state.look[0] += (goalX - state.look[0]) * ease;
      state.look[1] += (goalY - state.look[1]) * ease;
      const se = 1 - Math.exp(-dt / 0.6);
      const sx = steering ? state.pointer[0] - 0.5 : 0;
      const sy = steering ? 0.5 - state.pointer[1] : 0;
      state.steer[0] += (sx - state.steer[0]) * se;
      state.steer[1] += (sy - state.steer[1]) * se;
      state.swells = state.swells.filter(sw => state.clock - sw.at < SWELL_SECONDS);
      const still = s.paused;
      const transient = state.swells.length > 0 || introProgress(s, reduced) < 1;
      if (transient || !still) state.quiet = 0; else state.quiet += 1;
      if (state.quiet > 3) return;
      state.raf = requestAnimationFrame(tick);
      fit(); render(reduced);
    }
    function wake() { if (!state.raf && state.visible && !document.hidden) { state.last = 0; state.raf = requestAnimationFrame(tick); } }

    function local(e) {
      const r = container.getBoundingClientRect();
      return { x: (e.clientX - r.left) / Math.max(r.width, 1), y: (e.clientY - r.top) / Math.max(r.height, 1), inside: e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom };
    }
    function onMove(e) { const pt = local(e); state.inside = pt.inside; if (pt.inside) state.pointer = [pt.x, pt.y]; if ((pt.inside) && settings.mouseInteraction) wake(); }
    function onLeave() { state.inside = false; wake(); }

    const vis = new IntersectionObserver(es => { state.visible = es.some(e => e.isIntersecting); wake(); });
    vis.observe(container);
    const sizes = new ResizeObserver(measure);
    sizes.observe(container);
    measure();
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    state.raf = requestAnimationFrame(tick);

    return {
      destroy() {
        cancelAnimationFrame(state.raf);
        document.removeEventListener('visibilitychange', wake);
        vis.disconnect(); sizes.disconnect();
        window.removeEventListener('pointermove', onMove);
        document.documentElement.removeEventListener('pointerleave', onLeave);
        gl.deleteProgram(program); gl.deleteBuffer(buffer); gl.deleteVertexArray(vao);
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        canvas.remove();
      }
    };
  }

  return { init };
})();
