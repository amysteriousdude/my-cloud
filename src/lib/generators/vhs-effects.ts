export type EffectParams = Record<string, number>;

function clamp(v: number, min = 0, max = 255) {
  return v < min ? min : v > max ? max : v;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1/3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1/3) * 255),
  ];
}

function boxBlurChannel(src: Uint8ClampedArray, dst: Uint8ClampedArray, w: number, h: number, channel: number, radius: number) {
  const r = Math.max(1, Math.round(radius));
  const lineBuf = new Float64Array(w);
  for (let y = 0; y < h; y++) {
    let sum = 0, count = 0;
    for (let x = 0; x < Math.min(r, w); x++) { sum += src[(y * w + x) * 4 + channel]; count++; }
    for (let x = 0; x < w; x++) {
      if (x + r < w) { sum += src[(y * w + x + r) * 4 + channel]; count++; }
      if (x - r - 1 >= 0) { sum -= src[(y * w + x - r - 1) * 4 + channel]; count--; }
      lineBuf[x] = sum / count;
    }
    for (let x = 0; x < w; x++) dst[(y * w + x) * 4 + channel] = lineBuf[x];
  }
  for (let x = 0; x < w; x++) {
    let sum = 0, count = 0;
    for (let y = 0; y < Math.min(r, h); y++) { sum += dst[(y * w + x) * 4 + channel]; count++; }
    for (let y = 0; y < h; y++) {
      if (y + r < h) { sum += dst[((y + r) * w + x) * 4 + channel]; count++; }
      if (y - r - 1 >= 0) { sum -= dst[((y - r - 1) * w + x) * 4 + channel]; count--; }
      dst[(y * w + x) * 4 + channel] = sum / count;
    }
  }
}

function boxBlur(src: Uint8ClampedArray, dst: Uint8ClampedArray, w: number, h: number, radius: number) {
  for (let ch = 0; ch < 3; ch++) boxBlurChannel(src, dst, w, h, ch, radius);
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ── 1. SIGNAL ──────────────────────────────────────────

export function ntscArtifactColor(pixels: Uint8ClampedArray, w: number, h: number, strength: number) {
  if (strength === 0) return;
  const out = new Uint8ClampedArray(pixels);
  for (let y = 0; y < h; y++) {
    if (y % 2 === 0) continue;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const shift = Math.round(strength * 2);
      const sx = clamp(x + shift, 0, w - 1);
      const si = (y * w + sx) * 4;
      pixels[i] = clamp(out[i] + (out[si] - out[i]) * strength * 0.3);
      pixels[i + 2] = clamp(out[i + 2] + (out[si + 2] - out[i + 2]) * strength * 0.3);
    }
  }
}

export function chromaLowpass(pixels: Uint8ClampedArray, w: number, h: number, cutoff: number) {
  if (cutoff === 0) return;
  const tmp = new Uint8ClampedArray(pixels);
  const radius = Math.round(cutoff * 8);
  boxBlurChannel(tmp, pixels, w, h, 0, radius);
  boxBlurChannel(tmp, pixels, w, h, 2, radius);
}

export function luminanceLowpass(pixels: Uint8ClampedArray, w: number, h: number, cutoff: number) {
  if (cutoff === 0) return;
  const tmp = new Uint8ClampedArray(pixels);
  const radius = Math.round(cutoff * 8);
  boxBlurChannel(tmp, pixels, w, h, 1, radius);
}

export function compositeBlend(pixels: Uint8ClampedArray, w: number, h: number, amount: number) {
  if (amount === 0) return;
  const out = new Uint8ClampedArray(pixels);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      const above = ((y - 1) * w + x) * 4;
      const below = ((y + 1) * w + x) * 4;
      const crossR = (out[above] + out[below]) / 2;
      const crossB = (out[i - 4 + 2] + out[i + 4 + 2]) / 2;
      pixels[i] = clamp(out[i] + (crossR - out[i]) * amount * 0.4);
      pixels[i + 2] = clamp(out[i + 2] + (crossB - out[i + 2]) * amount * 0.4);
    }
  }
}

// ── 2. GEOMETRY ────────────────────────────────────────

export function waveDistortion(pixels: Uint8ClampedArray, w: number, h: number, amplitude: number, frequency: number, time: number) {
  if (amplitude === 0) return;
  const out = new Uint8ClampedArray(pixels);
  for (let y = 0; y < h; y++) {
    const offset = Math.round(amplitude * Math.sin(y * frequency * 0.01 + time * 3));
    for (let x = 0; x < w; x++) {
      const sx = clamp(x + offset, 0, w - 1);
      const di = (y * w + x) * 4;
      const si = (y * w + sx) * 4;
      pixels[di] = out[si];
      pixels[di + 1] = out[si + 1];
      pixels[di + 2] = out[si + 2];
    }
  }
}

export function rollingBars(pixels: Uint8ClampedArray, w: number, h: number, speed: number, intensity: number) {
  if (intensity === 0) return;
  for (let y = 0; y < h; y++) {
    const barPhase = (y / h * Math.PI * 2 + speed * 5) % (Math.PI * 2);
    const barValue = (Math.sin(barPhase) + 1) / 2;
    const dark = 1 - barValue * intensity * 0.4;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      pixels[i] = clamp(pixels[i] * dark);
      pixels[i + 1] = clamp(pixels[i + 1] * dark);
      pixels[i + 2] = clamp(pixels[i + 2] * dark);
    }
  }
}

export function verticalSync(pixels: Uint8ClampedArray, w: number, h: number, jitter: number) {
  if (jitter === 0) return;
  const out = new Uint8ClampedArray(pixels);
  const shift = Math.round(jitter * 8 * Math.sin(Date.now() * 0.01));
  for (let y = 0; y < h; y++) {
    const sy = clamp(y + shift, 0, h - 1);
    for (let x = 0; x < w; x++) {
      pixels[(y * w + x) * 4] = out[(sy * w + x) * 4];
      pixels[(y * w + x) * 4 + 1] = out[(sy * w + x) * 4 + 1];
      pixels[(y * w + x) * 4 + 2] = out[(sy * w + x) * 4 + 2];
    }
  }
}

export function horizontalSync(pixels: Uint8ClampedArray, w: number, h: number, jitter: number) {
  if (jitter === 0) return;
  const out = new Uint8ClampedArray(pixels);
  for (let y = 0; y < h; y++) {
    const offset = Math.round(jitter * 6 * Math.sin(y * 0.05 + Date.now() * 0.005));
    for (let x = 0; x < w; x++) {
      const sx = clamp(x + offset, 0, w - 1);
      const di = (y * w + x) * 4;
      const si = (y * w + sx) * 4;
      pixels[di] = out[si];
      pixels[di + 1] = out[si + 1];
      pixels[di + 2] = out[si + 2];
    }
  }
}

export function barrelDistortion(pixels: Uint8ClampedArray, w: number, h: number, amount: number) {
  if (amount === 0) return;
  const out = new Uint8ClampedArray(pixels);
  const cx = w / 2, cy = h / 2;
  const maxR = Math.sqrt(cx * cx + cy * cy);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x - cx) / cx, dy = (y - cy) / cy;
      const r2 = dx * dx + dy * dy;
      const f = 1 + amount * r2;
      const sx = clamp(Math.round(cx + dx * f * cx), 0, w - 1);
      const sy = clamp(Math.round(cy + dy * f * cy), 0, h - 1);
      const di = (y * w + x) * 4;
      const si = (sy * w + sx) * 4;
      pixels[di] = out[si];
      pixels[di + 1] = out[si + 1];
      pixels[di + 2] = out[si + 2];
    }
  }
}

// ── 3. NOISE ───────────────────────────────────────────

export function staticNoise(pixels: Uint8ClampedArray, w: number, h: number, amount: number, seed: number) {
  if (amount === 0) return;
  const rand = mulberry32(seed);
  const a = amount * 255;
  for (let i = 0; i < pixels.length; i += 4) {
    const n = (rand() - 0.5) * a;
    pixels[i] = clamp(pixels[i] + n);
    pixels[i + 1] = clamp(pixels[i + 1] + n);
    pixels[i + 2] = clamp(pixels[i + 2] + n);
  }
}

export function snowNoise(pixels: Uint8ClampedArray, w: number, h: number, amount: number, time: number) {
  if (amount === 0) return;
  const rand = mulberry32(Math.floor(time * 30));
  const a = amount * 255;
  for (let i = 0; i < pixels.length; i += 4) {
    if (rand() < amount * 0.3) {
      const n = (rand() - 0.5) * a;
      pixels[i] = clamp(pixels[i] + n);
      pixels[i + 1] = clamp(pixels[i + 1] + n);
      pixels[i + 2] = clamp(pixels[i + 2] + n);
    }
  }
}

export function ghosting(pixels: Uint8ClampedArray, w: number, h: number, delay: number, decay: number) {
  if (delay === 0 || decay === 0) return;
  const out = new Uint8ClampedArray(pixels);
  const offset = Math.round(delay * w * 0.15);
  for (let y = 0; y < h; y++) {
    for (let x = offset; x < w; x++) {
      const i = (y * w + x) * 4;
      const gi = (y * w + x - offset) * 4;
      pixels[i] = clamp(out[i] + out[gi] * decay);
      pixels[i + 1] = clamp(out[i + 1] + out[gi + 1] * decay);
      pixels[i + 2] = clamp(out[i + 2] + out[gi + 2] * decay);
    }
  }
}

export function chromaNoise(pixels: Uint8ClampedArray, w: number, h: number, amount: number, seed: number) {
  if (amount === 0) return;
  const rand = mulberry32(seed + 9999);
  const a = amount * 128;
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = clamp(pixels[i] + (rand() - 0.5) * a);
    pixels[i + 2] = clamp(pixels[i + 2] + (rand() - 0.5) * a);
  }
}

// ── 4. VHS ─────────────────────────────────────────────

export function tapeSpeed(pixels: Uint8ClampedArray, w: number, h: number, speed: number, time: number) {
  if (speed === 0) return;
  const out = new Uint8ClampedArray(pixels);
  const phase = time * speed * 20;
  for (let y = 0; y < h; y++) {
    const offset = Math.round(Math.sin(phase + y * 0.02) * speed * 12);
    for (let x = 0; x < w; x++) {
      const sx = clamp(x + offset, 0, w - 1);
      const di = (y * w + x) * 4;
      const si = (y * w + sx) * 4;
      pixels[di] = out[si];
      pixels[di + 1] = out[si + 1];
      pixels[di + 2] = out[si + 2];
    }
  }
}

export function headSwitching(pixels: Uint8ClampedArray, w: number, h: number, position: number, width: number) {
  if (width === 0) return;
  const startY = Math.floor(h * (1 - position));
  const bandH = Math.floor(h * width * 0.1);
  const rand = mulberry32(42);
  for (let y = startY; y < Math.min(startY + bandH, h); y++) {
    const fade = 1 - (y - startY) / bandH;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const noise = (rand() - 0.5) * 120 * fade;
      pixels[i] = clamp(pixels[i] + noise);
      pixels[i + 1] = clamp(pixels[i + 1] + noise);
      pixels[i + 2] = clamp(pixels[i + 2] + noise);
    }
  }
}

export function overwrite(pixels: Uint8ClampedArray, w: number, h: number, intensity: number) {
  if (intensity === 0) return;
  for (let y = 0; y < h; y++) {
    let maxR = 0, maxG = 0, maxB = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      maxR = Math.max(maxR, pixels[i]);
      maxG = Math.max(maxG, pixels[i + 1]);
      maxB = Math.max(maxB, pixels[i + 2]);
      pixels[i] = clamp(pixels[i] + (maxR - pixels[i]) * intensity * 0.3);
      pixels[i + 1] = clamp(pixels[i + 1] + (maxG - pixels[i + 1]) * intensity * 0.3);
      pixels[i + 2] = clamp(pixels[i + 2] + (maxB - pixels[i + 2]) * intensity * 0.3);
    }
  }
}

export function chromaBlur(pixels: Uint8ClampedArray, w: number, h: number, radius: number) {
  if (radius === 0) return;
  const tmp = new Uint8ClampedArray(pixels);
  const r = Math.round(radius * 6);
  boxBlurChannel(tmp, pixels, w, h, 0, r);
  boxBlurChannel(tmp, pixels, w, h, 2, r);
}

// ── 5. COLOR ───────────────────────────────────────────

export function saturation(pixels: Uint8ClampedArray, w: number, h: number, amount: number) {
  if (amount === 1) return;
  for (let i = 0; i < pixels.length; i += 4) {
    const gray = pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114;
    pixels[i] = clamp(gray + (pixels[i] - gray) * amount);
    pixels[i + 1] = clamp(gray + (pixels[i + 1] - gray) * amount);
    pixels[i + 2] = clamp(gray + (pixels[i + 2] - gray) * amount);
  }
}

export function hueShift(pixels: Uint8ClampedArray, w: number, h: number, degrees: number) {
  if (degrees === 0) return;
  const shift = degrees / 360;
  for (let i = 0; i < pixels.length; i += 4) {
    const [h, s, l] = rgbToHsl(pixels[i], pixels[i + 1], pixels[i + 2]);
    const [r, g, b] = hslToRgb((h + shift) % 1, s, l);
    pixels[i] = r;
    pixels[i + 1] = g;
    pixels[i + 2] = b;
  }
}

export function brightness(pixels: Uint8ClampedArray, w: number, h: number, amount: number) {
  if (amount === 0) return;
  const offset = amount * 100;
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = clamp(pixels[i] + offset);
    pixels[i + 1] = clamp(pixels[i + 1] + offset);
    pixels[i + 2] = clamp(pixels[i + 2] + offset);
  }
}

export function contrast(pixels: Uint8ClampedArray, w: number, h: number, amount: number) {
  if (amount === 1) return;
  const c = (amount - 1) * 255;
  const f = (259 * (c + 255)) / (255 * (259 - c));
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = clamp(f * (pixels[i] - 128) + 128);
    pixels[i + 1] = clamp(f * (pixels[i + 1] - 128) + 128);
    pixels[i + 2] = clamp(f * (pixels[i + 2] - 128) + 128);
  }
}

export function colorFringing(pixels: Uint8ClampedArray, w: number, h: number, offset: number) {
  if (offset === 0) return;
  const out = new Uint8ClampedArray(pixels);
  const shift = Math.round(offset * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const rx = clamp(x - shift, 0, w - 1);
      const bx = clamp(x + shift, 0, w - 1);
      pixels[i] = out[(y * w + rx) * 4];
      pixels[i + 2] = out[(y * w + bx) * 4 + 2];
    }
  }
}

// ── 6. SCANLINES ───────────────────────────────────────

export function scanlines(pixels: Uint8ClampedArray, w: number, h: number, thickness: number, intensity: number, beamIntensity: number) {
  if (intensity === 0) return;
  const thick = Math.max(1, Math.round(thickness * 3));
  for (let y = 0; y < h; y++) {
    const phase = y % thick;
    const dark = phase === 0 ? 1 - intensity * 0.5 : 1;
    const beam = beamIntensity > 0 ? 1 + beamIntensity * 0.3 * Math.exp(-phase * 2 / thick) : 1;
    const factor = dark * beam;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      pixels[i] = clamp(pixels[i] * factor);
      pixels[i + 1] = clamp(pixels[i + 1] * factor);
      pixels[i + 2] = clamp(pixels[i + 2] * factor);
    }
  }
}

// ── 7. EDGE ────────────────────────────────────────────

export function edgeGlow(pixels: Uint8ClampedArray, w: number, h: number, threshold: number, glowAmount: number) {
  if (glowAmount === 0) return;
  const out = new Uint8ClampedArray(pixels);
  const t = threshold * 255;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      const l = out[i - 4], r = out[i + 4];
      const u = out[((y - 1) * w + x) * 4], d = out[((y + 1) * w + x) * 4];
      const edge = Math.abs(r - l) + Math.abs(d - u);
      if (edge > t) {
        const glow = Math.min(1, (edge - t) / 128) * glowAmount * 255;
        pixels[i] = clamp(pixels[i] + glow);
        pixels[i + 1] = clamp(pixels[i + 1] + glow);
        pixels[i + 2] = clamp(pixels[i + 2] + glow);
      }
    }
  }
}

// ── 8. WEB-ONLY: INTERLACE ────────────────────────────

export function interlaceFields(pixels: Uint8ClampedArray, w: number, h: number, fieldOffset: number) {
  if (fieldOffset === 0) return;
  const out = new Uint8ClampedArray(pixels);
  const shift = Math.round(fieldOffset);
  for (let y = 0; y < h; y++) {
    if (y % 2 === 0) continue;
    const srcY = clamp(y + shift, 0, h - 1);
    for (let x = 0; x < w; x++) {
      const di = (y * w + x) * 4;
      const si = (srcY * w + x) * 4;
      pixels[di] = out[si];
      pixels[di + 1] = out[si + 1];
      pixels[di + 2] = out[si + 2];
    }
  }
}

// ── 9. PIXEL DEGRADATION ──────────────────────────────

export function pixelate(pixels: Uint8ClampedArray, w: number, h: number, size: number) {
  if (size <= 1) return;
  const s = Math.round(size);
  for (let by = 0; by < h; by += s) {
    for (let bx = 0; bx < w; bx += s) {
      let r = 0, g = 0, b = 0, count = 0;
      for (let dy = 0; dy < s && by + dy < h; dy++) {
        for (let dx = 0; dx < s && bx + dx < w; dx++) {
          const i = ((by + dy) * w + (bx + dx)) * 4;
          r += pixels[i]; g += pixels[i + 1]; b += pixels[i + 2]; count++;
        }
      }
      r = Math.round(r / count); g = Math.round(g / count); b = Math.round(b / count);
      for (let dy = 0; dy < s && by + dy < h; dy++) {
        for (let dx = 0; dx < s && bx + dx < w; dx++) {
          const i = ((by + dy) * w + (bx + dx)) * 4;
          pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b;
        }
      }
    }
  }
}

export function bitcrush(pixels: Uint8ClampedArray, w: number, h: number, bits: number) {
  if (bits >= 8) return;
  const levels = Math.pow(2, Math.max(1, Math.round(bits)));
  const step = 255 / (levels - 1);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = Math.round(Math.round(pixels[i] / step) * step);
    pixels[i + 1] = Math.round(Math.round(pixels[i + 1] / step) * step);
    pixels[i + 2] = Math.round(Math.round(pixels[i + 2] / step) * step);
  }
}

export function colorQuantize(pixels: Uint8ClampedArray, w: number, h: number, levels: number) {
  if (levels >= 256) return;
  const step = 255 / (levels - 1);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = Math.round(Math.round(pixels[i] / step) * step);
    pixels[i + 1] = Math.round(Math.round(pixels[i + 1] / step) * step);
    pixels[i + 2] = Math.round(Math.round(pixels[i + 2] / step) * step);
  }
}

export function blockNoise(pixels: Uint8ClampedArray, w: number, h: number, amount: number, seed: number) {
  if (amount === 0) return;
  const rand = mulberry32(seed + 7777);
  const blockSize = 8;
  for (let by = 0; by < h; by += blockSize) {
    for (let bx = 0; bx < w; bx += blockSize) {
      if (rand() > amount) continue;
      const br = (rand() - 0.5) * 80;
      const bg = (rand() - 0.5) * 80;
      const bb = (rand() - 0.5) * 80;
      for (let dy = 0; dy < blockSize && by + dy < h; dy++) {
        for (let dx = 0; dx < blockSize && bx + dx < w; dx++) {
          const i = ((by + dy) * w + (bx + dx)) * 4;
          pixels[i] = clamp(pixels[i] + br);
          pixels[i + 1] = clamp(pixels[i + 1] + bg);
          pixels[i + 2] = clamp(pixels[i + 2] + bb);
        }
      }
    }
  }
}

export function horizontalTear(pixels: Uint8ClampedArray, w: number, h: number, amount: number, time: number) {
  if (amount === 0) return;
  const out = new Uint8ClampedArray(pixels);
  for (let y = 0; y < h; y++) {
    const tear = Math.sin(y * 0.1 + time * 5) * amount * 30;
    if (Math.abs(tear) < 1) continue;
    const offset = Math.round(tear);
    for (let x = 0; x < w; x++) {
      const sx = clamp(x + offset, 0, w - 1);
      const di = (y * w + x) * 4;
      const si = (y * w + sx) * 4;
      pixels[di] = out[si];
      pixels[di + 1] = out[si + 1];
      pixels[di + 2] = out[si + 2];
    }
  }
}

// ── PIPELINE ───────────────────────────────────────────

export interface VHSParams {
  signalArtifactColor: number;
  signalChromaLowpass: number;
  signalLuminanceLowpass: number;
  signalCompositeBlend: number;
  geoWaveAmplitude: number;
  geoWaveFrequency: number;
  geoRollingBars: number;
  geoVerticalSync: number;
  geoHorizontalSync: number;
  geoBarrelDistortion: number;
  noiseStatic: number;
  noiseSnow: number;
  noiseGhostingDelay: number;
  noiseGhostingDecay: number;
  noiseChroma: number;
  vhsTapeSpeed: number;
  vhsHeadSwitching: number;
  vhsOverwrite: number;
  vhsChromaBlur: number;
  colorSaturation: number;
  colorHueShift: number;
  colorBrightness: number;
  colorContrast: number;
  colorFringingOffset: number;
  scanlineThickness: number;
  scanlineIntensity: number;
  scanlineBeam: number;
  edgeGlowThreshold: number;
  edgeGlowAmount: number;
  interlaceOffset: number;
  degradePixelate: number;
  degradeBitcrush: number;
  degradeBlockNoise: number;
  degradeHorizontalTear: number;
  time: number;
  seed: number;
}

export const DEFAULT_PARAMS: VHSParams = {
  signalArtifactColor: 0,
  signalChromaLowpass: 0,
  signalLuminanceLowpass: 0,
  signalCompositeBlend: 0,
  geoWaveAmplitude: 0,
  geoWaveFrequency: 1,
  geoRollingBars: 0,
  geoVerticalSync: 0,
  geoHorizontalSync: 0,
  geoBarrelDistortion: 0,
  noiseStatic: 0,
  noiseSnow: 0,
  noiseGhostingDelay: 0,
  noiseGhostingDecay: 0,
  noiseChroma: 0,
  vhsTapeSpeed: 0,
  vhsHeadSwitching: 0,
  vhsOverwrite: 0,
  vhsChromaBlur: 0,
  colorSaturation: 1,
  colorHueShift: 0,
  colorBrightness: 0,
  colorContrast: 1,
  colorFringingOffset: 0,
  scanlineThickness: 0,
  scanlineIntensity: 0,
  scanlineBeam: 0,
  edgeGlowThreshold: 0.5,
  edgeGlowAmount: 0,
  interlaceOffset: 0,
  degradePixelate: 1,
  degradeBitcrush: 8,
  degradeBlockNoise: 0,
  degradeHorizontalTear: 0,
  time: 0,
  seed: 1,
};

export function applyEffects(pixels: Uint8ClampedArray, w: number, h: number, p: VHSParams) {
  ntscArtifactColor(pixels, w, h, p.signalArtifactColor);
  chromaLowpass(pixels, w, h, p.signalChromaLowpass);
  luminanceLowpass(pixels, w, h, p.signalLuminanceLowpass);
  compositeBlend(pixels, w, h, p.signalCompositeBlend);
  waveDistortion(pixels, w, h, p.geoWaveAmplitude, p.geoWaveFrequency, p.time);
  rollingBars(pixels, w, h, p.geoRollingBars * 5, p.geoRollingBars);
  horizontalSync(pixels, w, h, p.geoHorizontalSync);
  verticalSync(pixels, w, h, p.geoVerticalSync);
  barrelDistortion(pixels, w, h, p.geoBarrelDistortion);
  staticNoise(pixels, w, h, p.noiseStatic, p.seed);
  snowNoise(pixels, w, h, p.noiseSnow, p.time);
  ghosting(pixels, w, h, p.noiseGhostingDelay, p.noiseGhostingDecay);
  chromaNoise(pixels, w, h, p.noiseChroma, p.seed);
  tapeSpeed(pixels, w, h, p.vhsTapeSpeed, p.time);
  headSwitching(pixels, w, h, 0.95, p.vhsHeadSwitching);
  overwrite(pixels, w, h, p.vhsOverwrite);
  chromaBlur(pixels, w, h, p.vhsChromaBlur);
  saturation(pixels, w, h, p.colorSaturation);
  hueShift(pixels, w, h, p.colorHueShift);
  brightness(pixels, w, h, p.colorBrightness);
  contrast(pixels, w, h, p.colorContrast);
  colorFringing(pixels, w, h, p.colorFringingOffset);
  scanlines(pixels, w, h, p.scanlineThickness, p.scanlineIntensity, p.scanlineBeam);
  edgeGlow(pixels, w, h, p.edgeGlowThreshold, p.edgeGlowAmount);
  interlaceFields(pixels, w, h, p.interlaceOffset);
  pixelate(pixels, w, h, p.degradePixelate);
  bitcrush(pixels, w, h, p.degradeBitcrush);
  blockNoise(pixels, w, h, p.degradeBlockNoise, p.seed);
  horizontalTear(pixels, w, h, p.degradeHorizontalTear, p.time);
}
