<!-- hello there, tf u doing on my code???? -->
<script lang="ts">
  import { onMount } from 'svelte';
  import {
    IconPlus,
    IconMinus,
    IconFocusCentered,
    IconCopy,
    IconCheck,
    IconX,
    IconCrosshair,
    IconSearch,
  } from '@tabler/icons-svelte';
  import {
    STRUCTURES,
    findStructures,
    isSlimeChunk,
    type Edition,
    type Dimension,
    type StructureId,
    type StructureSpot,
  } from '$lib/generators/minecraft/structures';

  interface Props {
    seed: bigint;
    edition: Edition;
    mc: number;
    dimension: Dimension;
    structures: StructureId[];
    showSlime?: boolean;
    showGrid?: boolean;
    showLabels?: boolean;
    onspots?: (spots: StructureSpot[]) => void;
    onview?: (view: { x: number; z: number; scale: number; cursor: { x: number; z: number } | null }) => void;
    onstatus?: (busy: boolean) => void;
    onselect?: (spot: StructureSpot | null) => void;
  }

  let {
    seed,
    edition,
    mc,
    dimension,
    structures,
    showSlime = false,
    showGrid = true,
    showLabels = true,
    onspots = () => {},
    onview = () => {},
    onstatus = () => {},
    onselect = () => {},
  }: Props = $props();

  const MIN_SCALE = 0.008;
  const MAX_SCALE = 10;
  const CLUSTER_CELL = 30;

  let wrapEl: HTMLDivElement;
  let canvasEl: HTMLCanvasElement;

  let width = $state(900);
  let height = $state(600);
  let dpr = 1;

  let cx = $state(0);
  let cz = $state(0);
  let scale = $state(0.25);

  let spots = $state<StructureSpot[]>([]);
  let scanning = $state(false);
  let selected = $state<StructureSpot | null>(null);
  let hover = $state<
    | { kind: 'spot'; spot: StructureSpot; x: number; y: number; px: number; py: number }
    | { kind: 'cluster'; count: number; x: number; y: number; px: number; py: number }
    | null
  >(null);
  let cursor = $state<{ x: number; z: number } | null>(null);
  let copied = $state(false);

  let jumpX = $state('');
  let jumpZ = $state('');

  let drag: { id: number; sx: number; sy: number; cx: number; cz: number } | null = null;
  let dragging = false;

  let hitTargets: (
    | { kind: 'spot'; spot: StructureSpot; x: number; y: number; r: number }
    | { kind: 'cluster'; count: number; x: number; y: number; r: number; wx: number; wz: number }
  )[] = [];

  let drawRaf = 0;
  let scanTimer: ReturnType<typeof setTimeout> | null = null;
  let settleTimer: ReturnType<typeof setTimeout> | null = null;
  let scanArea: { x: number; z: number; radius: number; key: string } | null = null;
  let scanKey = '';
  const slimeCache = new Map<string, boolean>();

  const keyOf = (s: StructureSpot) => `${s.id}:${s.x}:${s.z}:${s.index ?? 0}`;
  const scaleDistance = $derived.by(() => {
    const options = [16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536];
    let best = options[0];
    for (const d of options) if (d * scale <= 140) best = d;
    return best;
  });

  function clamp(n: number, lo: number, hi: number) {
    return Math.max(lo, Math.min(hi, n));
  }

  function requestDraw() {
    if (drawRaf) return;
    drawRaf = requestAnimationFrame(() => {
      drawRaf = 0;
      draw();
    });
  }

  function wx(sx: number) {
    return cx + (sx - width / 2) / scale;
  }
  function wz(sy: number) {
    return cz + (sy - height / 2) / scale;
  }
  function sx(x: number) {
    return width / 2 + (x - cx) * scale;
  }
  function sy(z: number) {
    return height / 2 + (z - cz) * scale;
  }

  function hash2(x: number, y: number) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }

  function scanNow() {
    const radius = clamp(Math.hypot(width / 2 / scale, height / 2 / scale) * 1.2, 640, 9000);
    const key = `${seed}|${edition}|${mc}|${dimension}|${structures.join(',')}`;
    const t0 = performance.now();
    scanning = true;
    onstatus(true);
    try {
      const result =
        structures.length && width > 20
          ? findStructures({
              edition,
              mc,
              seed,
              centerX: cx,
              centerZ: cz,
              radius,
              structures,
            })
          : [];
      spots = result.length > 30000 ? result.slice(0, 30000) : result;
      scanArea = { x: cx, z: cz, radius, key };
      onspots(spots);
      emitView();
    } finally {
      scanning = false;
      onstatus(false);
      if (performance.now() - t0 > 180) requestDraw();
    }
    requestDraw();
  }

  function needsScan() {
    if (!scanArea) return true;
    const key = `${seed}|${edition}|${mc}|${dimension}|${structures.join(',')}`;
    if (scanArea.key !== key) return true;
    const halfDiag = Math.hypot(width / 2, height / 2) / scale;
    return Math.hypot(cx - scanArea.x, cz - scanArea.z) + halfDiag > scanArea.radius * 0.98;
  }

  function scanSoon(delay = 160) {
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      scanTimer = null;
      if (needsScan()) scanNow();
    }, delay);
  }

  function emitView() {
    onview({ x: cx, z: cz, scale, cursor });
  }

  function settleSoon(delay = 180) {
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      settleTimer = null;
      if (needsScan()) scanNow();
      else emitView();
    }, delay);
  }

  function clearHover() {
    hover = null;
  }

  function worldAtClient(clientX: number, clientY: number) {
    const rect = canvasEl.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    return { mx, my, x: wx(mx), z: wz(my) };
  }

  function pick(mx: number, my: number) {
    for (let i = hitTargets.length - 1; i >= 0; i--) {
      const t = hitTargets[i];
      if (Math.hypot(mx - t.x, my - t.y) <= t.r + 3) return t;
    }
    return null;
  }

  function updateHover(mx: number, my: number) {
    const t = pick(mx, my);
    if (!t) {
      hover = null;
      return;
    }
    if (t.kind === 'spot') {
      hover = { kind: 'spot', spot: t.spot, x: t.x, y: t.y, px: mx, py: my };
    } else {
      hover = { kind: 'cluster', count: t.count, x: t.x, y: t.y, px: mx, py: my };
    }
  }

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    canvasEl.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, cx, cz };
    dragging = false;
    hover = null;
    canvasEl.focus();
  }

  function onPointerMove(e: PointerEvent) {
    const p = worldAtClient(e.clientX, e.clientY);
    cursor = { x: Math.round(p.x), z: Math.round(p.z) };
    if (drag && drag.id === e.pointerId) {
      const dx = e.clientX - drag.sx;
      const dy = e.clientY - drag.sy;
      if (!dragging && Math.hypot(dx, dy) > 4) dragging = true;
      if (dragging) {
        cx = drag.cx - dx / scale;
        cz = drag.cz - dy / scale;
        requestDraw();
      }
      return;
    }
    updateHover(p.mx, p.my);
    requestDraw();
  }

  function onPointerUp(e: PointerEvent) {
    const wasDragging = dragging;
    const p = worldAtClient(e.clientX, e.clientY);
    if (drag && drag.id === e.pointerId) {
      try {
        canvasEl.releasePointerCapture(e.pointerId);
      } catch {}
    }
    drag = null;
    dragging = false;
    if (!wasDragging) {
      const t = pick(p.mx, p.my);
      if (!t) {
        selected = null;
        onselect(null);
      } else if (t.kind === 'spot') {
        selected = t.spot;
        onselect(t.spot);
      } else {
        focusOn(t.wx, t.wz, clamp(scale * 2.4, MIN_SCALE, MAX_SCALE));
      }
    } else {
      settleSoon(140);
    }
    requestDraw();
  }

  function onPointerLeave() {
    if (!drag) {
      hover = null;
      cursor = null;
      requestDraw();
    }
  }

  function zoomAbout(px: number, py: number, nextScale: number) {
    const ns = clamp(nextScale, MIN_SCALE, MAX_SCALE);
    if (ns === scale) return;
    const ax = wx(px);
    const az = wz(py);
    scale = ns;
    cx = ax - (px - width / 2) / scale;
    cz = az - (py - height / 2) / scale;
    hover = null;
    requestDraw();
  }

  function zoomBy(factor: number) {
    zoomAbout(width / 2, height / 2, scale * factor);
    settleSoon(220);
  }

  function resetView() {
    cx = 0;
    cz = 0;
    scale = 0.25;
    selected = null;
    onselect(null);
    hover = null;
    scanArea = null;
    scanSoon(0);
    requestDraw();
  }

  function doJump() {
    const x = Number(jumpX);
    const z = Number(jumpZ);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    focusOn(x, z, Math.max(scale, 0.8));
    jumpX = '';
    jumpZ = '';
  }

  export function focusOn(x: number, z: number, targetScale?: number) {
    cx = x;
    cz = z;
    if (targetScale) scale = clamp(targetScale, MIN_SCALE, MAX_SCALE);
    selected = null;
    hover = null;
    scanArea = null;
    scanSoon(0);
    requestDraw();
    setTimeout(emitView, 0);
  }

  export function selectAndFocus(spot: StructureSpot) {
    selected = spot;
    onselect(spot);
    focusOn(spot.x, spot.z, Math.max(scale, 1));
    selected = spot;
    requestDraw();
  }

  function copySelected() {
    if (!selected) return;
    navigator.clipboard.writeText(`${selected.x} ${selected.z}`).then(() => {
      copied = true;
      setTimeout(() => (copied = false), 1200);
    });
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement) return;
    const pan = 120 / scale;
    if (e.key === '+' || e.key === '=') zoomBy(1.35);
    else if (e.key === '-' || e.key === '_') zoomBy(1 / 1.35);
    else if (e.key === '0') resetView();
    else if (e.key === 'ArrowLeft') { cx -= pan; settleSoon(120); }
    else if (e.key === 'ArrowRight') { cx += pan; settleSoon(120); }
    else if (e.key === 'ArrowUp') { cz -= pan; settleSoon(120); }
    else if (e.key === 'ArrowDown') { cz += pan; settleSoon(120); }
    else return;
    e.preventDefault();
    requestDraw();
  }

  onMount(() => {
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      width = Math.max(1, Math.round(r.width));
      height = Math.max(1, Math.round(r.height));
      dpr = Math.min(2.5, window.devicePixelRatio || 1);
      requestDraw();
      scanSoon(200);
    });
    ro.observe(wrapEl);

    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvasEl.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      zoomAbout(mx, my, scale * Math.exp(-e.deltaY * 0.0014));
      settleSoon(260);
    };
    canvasEl.addEventListener('wheel', wheel, { passive: false });

    const first = wrapEl.getBoundingClientRect();
    width = Math.max(1, Math.round(first.width));
    height = Math.max(1, Math.round(first.height));
    dpr = Math.min(2.5, window.devicePixelRatio || 1);
    scanSoon(0);
    requestDraw();

    return () => {
      ro.disconnect();
      canvasEl.removeEventListener('wheel', wheel);
      if (scanTimer) clearTimeout(scanTimer);
      if (settleTimer) clearTimeout(settleTimer);
      if (drawRaf) cancelAnimationFrame(drawRaf);
    };
  });

  // data changes -> fresh scan
  $effect(() => {
    const key = `${seed}|${edition}|${mc}|${dimension}|${structures.join(',')}`;
    if (key !== scanKey) {
      scanKey = key;
      spots = [];
      selected = null;
      slimeCache.clear();
      scanArea = null;
      onspots([]);
    }
    scanSoon(0);
  });

  // redraw on any visual change
  $effect(() => {
    void spots;
    void cx;
    void cz;
    void scale;
    void width;
    void height;
    void hover;
    void selected;
    void showGrid;
    void showLabels;
    void showSlime;
    requestDraw();
  });

  function roundedRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    const rr = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + rr, y);
    g.arcTo(x + w, y, x + w, y + h, rr);
    g.arcTo(x + w, y + h, x, y + h, rr);
    g.arcTo(x, y + h, x, y, rr);
    g.arcTo(x, y, x + w, y, rr);
    g.closePath();
  }

  function draw() {
    if (!canvasEl) return;
    const g = canvasEl.getContext('2d');
    if (!g) return;
    const w = width;
    const h = height;
    canvasEl.width = Math.max(1, Math.round(w * dpr));
    canvasEl.height = Math.max(1, Math.round(h * dpr));
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    // basemap
    const bg = g.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#0e1511');
    bg.addColorStop(0.55, '#0b110e');
    bg.addColorStop(1, '#080c0a');
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);

    const vignette = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.15, w / 2, h / 2, Math.max(w, h) * 0.75);
    vignette.addColorStop(0, 'rgba(126,201,111,0.035)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.28)');
    g.fillStyle = vignette;
    g.fillRect(0, 0, w, h);

    // subtle region tint (decorative, deterministic by coordinate only)
    if (showGrid && scale >= 0.024) {
      const reg = 512;
      const x0 = Math.floor(wx(0) / reg) - 1;
      const x1 = Math.floor(wx(w) / reg) + 1;
      const z0 = Math.floor(wz(0) / reg) - 1;
      const z1 = Math.floor(wz(h) / reg) + 1;
      for (let rx = x0; rx <= x1; rx++) {
        for (let rz = z0; rz <= z1; rz++) {
          const a = 0.008 + hash2(rx, rz) * 0.022;
          g.fillStyle = `rgba(126,201,111,${a.toFixed(3)})`;
          g.fillRect(sx(rx * reg), sy(rz * reg), reg * scale + 1, reg * scale + 1);
        }
      }
    }

    // grid
    if (showGrid) {
      let step = 16;
      while (step * scale < 88) step *= 2;
      const xStart = Math.floor(wx(0) / step) * step;
      const xEnd = wx(w);
      const zStart = Math.floor(wz(0) / step) * step;
      const zEnd = wz(h);

      g.lineWidth = 1;
      g.strokeStyle = 'rgba(180,210,190,0.075)';
      g.beginPath();
      for (let x = xStart; x <= xEnd; x += step) {
        const px = Math.round(sx(x)) + 0.5;
        g.moveTo(px, 0);
        g.lineTo(px, h);
      }
      for (let z = zStart; z <= zEnd; z += step) {
        const py = Math.round(sy(z)) + 0.5;
        g.moveTo(0, py);
        g.lineTo(w, py);
      }
      g.stroke();

      if (16 * scale >= 18) {
        g.strokeStyle = 'rgba(180,210,190,0.035)';
        g.beginPath();
        const c0 = Math.floor(wx(0) / 16) * 16;
        const c1 = wx(w);
        for (let x = c0; x <= c1; x += 16) {
          const px = Math.round(sx(x)) + 0.5;
          g.moveTo(px, 0);
          g.lineTo(px, h);
        }
        const cc0 = Math.floor(wz(0) / 16) * 16;
        const cc1 = wz(h);
        for (let z = cc0; z <= cc1; z += 16) {
          const py = Math.round(sy(z)) + 0.5;
          g.moveTo(0, py);
          g.lineTo(w, py);
        }
        g.stroke();
      }

      g.font = '10px Geist, ui-sans-serif, sans-serif';
      g.fillStyle = 'rgba(210,230,214,0.34)';
      g.textAlign = 'left';
      for (let x = xStart; x <= xEnd; x += step) {
        const px = sx(x);
        if (px < 8 || px > w - 40) continue;
        g.fillText(String(Math.round(x)), px + 4, 13);
      }
      g.textAlign = 'right';
      for (let z = zStart; z <= zEnd; z += step) {
        const py = sy(z);
        if (py < 20 || py > h - 6) continue;
        g.fillText(String(Math.round(z)), 52, py - 4);
      }
      g.textAlign = 'left';
    }

    // origin axes
    g.save();
    g.strokeStyle = 'rgba(255,255,255,0.14)';
    g.setLineDash([5, 6]);
    g.beginPath();
    g.moveTo(Math.round(sx(0)) + 0.5, 0);
    g.lineTo(Math.round(sx(0)) + 0.5, h);
    g.moveTo(0, Math.round(sy(0)) + 0.5);
    g.lineTo(w, Math.round(sy(0)) + 0.5);
    g.stroke();
    g.restore();

    // slime chunks
    if (showSlime && edition === 'java' && dimension === 'overworld' && 16 * scale >= 5) {
      drawSlime(g, w, h);
    }

    // markers
    drawMarkers(g, w, h);

    // origin marker on top
    const ox = sx(0);
    const oy = sy(0);
    if (ox > -30 && ox < w + 30 && oy > -30 && oy < h + 30) {
      g.beginPath();
      g.arc(ox, oy, 4.5, 0, Math.PI * 2);
      g.fillStyle = '#e8efe9';
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = 'rgba(10,15,12,0.85)';
      g.stroke();
      g.font = '600 10px Geist, sans-serif';
      g.fillStyle = 'rgba(232,239,233,0.7)';
      g.fillText('0, 0', ox + 8, oy - 7);
    }

    if (scanning) {
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(0, 0, w, h);
    }
  }

  function drawSlime(g: CanvasRenderingContext2D, w: number, h: number) {
    const cw = 16 * scale;
    const minX = Math.floor(wx(0) / 16) - 1;
    const maxX = Math.floor(wx(w) / 16) + 1;
    const minZ = Math.floor(wz(0) / 16) - 1;
    const maxZ = Math.floor(wz(h) / 16) + 1;
    if ((maxX - minX) * (maxZ - minZ) > 30000) return;
    if (slimeCache.size > 180000) slimeCache.clear();
    g.fillStyle = 'rgba(74,222,128,0.15)';
    g.strokeStyle = 'rgba(74,222,128,0.13)';
    g.lineWidth = 1;
    for (let cx0 = minX; cx0 <= maxX; cx0++) {
      for (let cz0 = minZ; cz0 <= maxZ; cz0++) {
        const k = `${cx0},${cz0}`;
        let slime = slimeCache.get(k);
        if (slime === undefined) {
          slime = isSlimeChunk(seed, cx0, cz0);
          slimeCache.set(k, slime);
        }
        if (!slime) continue;
        g.fillRect(sx(cx0 * 16), sy(cz0 * 16), cw + 0.5, cw + 0.5);
        g.strokeRect(Math.round(sx(cx0 * 16)) + 0.5, Math.round(sy(cz0 * 16)) + 0.5, Math.round(cw), Math.round(cw));
      }
    }
  }

  function drawMarkers(g: CanvasRenderingContext2D, w: number, h: number) {
    hitTargets = [];
    const pad = 48;
    const singles: { spot: StructureSpot; x: number; y: number }[] = [];
    const clusters = new Map<
      string,
      { x: number; y: number; n: number; wx: number; wz: number; first: StructureSpot }
    >();

    for (const spot of spots) {
      if (spot.dim !== dimension) continue;
      const px = sx(spot.x);
      const py = sy(spot.z);
      if (px < -pad || px > w + pad || py < -pad || py > h + pad) continue;
      const cell = `${Math.floor(px / CLUSTER_CELL)},${Math.floor(py / CLUSTER_CELL)}`;
      const c = clusters.get(cell);
      if (c) {
        c.n++;
        c.x = (c.x * (c.n - 1) + px) / c.n;
        c.y = (c.y * (c.n - 1) + py) / c.n;
        c.wx = (c.wx * (c.n - 1) + spot.x) / c.n;
        c.wz = (c.wz * (c.n - 1) + spot.z) / c.n;
      } else {
        clusters.set(cell, { x: px, y: py, n: 1, wx: spot.x, wz: spot.z, first: spot });
      }
    }

    clusters.forEach((c) => {
      if (c.n === 1) singles.push({ spot: c.first, x: c.x, y: c.y });
    });

    singles.sort((a, b) => (STRUCTURES[b.spot.id]?.priority ?? 0) - (STRUCTURES[a.spot.id]?.priority ?? 0));

    const placed: { x: number; y: number; w: number; h: number }[] = singles.map((s) => ({
      x: s.x - 10,
      y: s.y - 20,
      w: 20,
      h: 24,
    }));

    for (const s of singles) {
      const info = STRUCTURES[s.spot.id];
      if (!info) continue;
      const isSel = selected && keyOf(selected) === keyOf(s.spot);
      drawPin(g, s.x, s.y, info.color, !!isSel);
      hitTargets.push({ kind: 'spot', spot: s.spot, x: s.x, y: s.y - 8, r: isSel ? 11 : 9 });

      const threshold = info.priority >= 80 ? 0.055 : info.priority >= 40 ? 0.14 : 0.55;
      const wantLabel = showLabels && (scale >= threshold || isSel);
      if (!wantLabel) continue;

      const label = s.spot.label + (s.spot.index ? ` #${s.spot.index}` : '');
      g.font = `${isSel ? '600 ' : ''}10px Geist, ui-sans-serif, sans-serif`;
      const tw = g.measureText(label).width;
      const lw = tw + 12;
      const lh = 16;
      let lx = s.x + 12;
      let ly = s.y - 27;
      if (lx + lw > w - 6) lx = s.x - lw - 12;
      const hit = placed.some(
        (p) => lx < p.x + p.w && lx + lw > p.x && ly < p.y + p.h && ly + lh > p.y,
      );
      if (hit) continue;
      placed.push({ x: lx, y: ly, w: lw, h: lh });

      roundedRect(g, lx, ly, lw, lh, 4);
      g.fillStyle = isSel ? 'rgba(28,38,31,0.96)' : 'rgba(10,14,11,0.78)';
      g.fill();
      g.strokeStyle = isSel ? info.color : 'rgba(255,255,255,0.09)';
      g.lineWidth = 1;
      g.stroke();
      g.fillStyle = isSel ? '#ffffff' : 'rgba(224,232,225,0.82)';
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText(label, lx + 6, ly + lh / 2 + 0.5);
    }

    clusters.forEach((c) => {
      if (c.n < 2) return;
      const isHot =
        hover?.x !== undefined && Math.hypot(c.x - hover.x, c.y - hover.y) < 18;
      g.save();
      g.shadowColor = 'rgba(0,0,0,0.5)';
      g.shadowBlur = 8;
      g.shadowOffsetY = 2;
      g.beginPath();
      g.arc(c.x, c.y, 13, 0, Math.PI * 2);
      g.fillStyle = isHot ? 'rgba(32,45,37,0.98)' : 'rgba(19,26,21,0.94)';
      g.fill();
      g.restore();
      g.beginPath();
      g.arc(c.x, c.y, 13, 0, Math.PI * 2);
      g.lineWidth = 1.5;
      g.strokeStyle = 'rgba(160,220,175,0.5)';
      g.stroke();
      g.beginPath();
      g.arc(c.x, c.y, 9.5, 0, Math.PI * 2);
      g.strokeStyle = 'rgba(160,220,175,0.12)';
      g.lineWidth = 1;
      g.stroke();
      g.font = '600 10px Geist, sans-serif';
      g.fillStyle = '#dce9df';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(c.n > 99 ? '99+' : String(c.n), c.x, c.y + 0.5);
      hitTargets.push({ kind: 'cluster', count: c.n, x: c.x, y: c.y, r: 14, wx: c.wx, wz: c.wz });
    });
    g.textBaseline = 'alphabetic';
  }

  function drawPin(g: CanvasRenderingContext2D, x: number, y: number, color: string, isSelected: boolean) {
    const r = isSelected ? 9 : 7.5;
    const cy0 = y - 10;
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.55)';
    g.shadowBlur = 7;
    g.shadowOffsetY = 2;
    g.beginPath();
    g.arc(x, cy0, r, 0, Math.PI * 2);
    g.fillStyle = color;
    g.fill();
    g.beginPath();
    g.moveTo(x - r * 0.62, cy0 + r * 0.5);
    g.lineTo(x, y + 1);
    g.lineTo(x + r * 0.62, cy0 + r * 0.5);
    g.closePath();
    g.fill();
    g.restore();

    g.beginPath();
    g.arc(x, cy0, r, 0, Math.PI * 2);
    g.lineWidth = 1.6;
    g.strokeStyle = isSelected ? '#ffffff' : 'rgba(8,12,9,0.72)';
    g.stroke();

    if (isSelected) {
      g.beginPath();
      g.arc(x, cy0, r + 4, 0, Math.PI * 2);
      g.lineWidth = 1.5;
      g.strokeStyle = 'rgba(255,255,255,0.55)';
      g.stroke();
    }
  }
</script>

<div class="map-wrap" bind:this={wrapEl}>
  <canvas
    bind:this={canvasEl}
    class="map-canvas"
    class:dragging
    tabindex="0"
    aria-label="Minecraft structure map. Drag to pan, scroll to zoom."
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
    onpointerleave={onPointerLeave}
    onkeydown={onKeyDown}
    ondblclick={(e) => {
      const p = worldAtClient(e.clientX, e.clientY);
      zoomAbout(p.mx, p.my, scale * 1.8);
      settleSoon(220);
    }}
  ></canvas>

  <div class="map-ui">
    <form
      class="map-jump"
      onsubmit={(e) => {
        e.preventDefault();
        doJump();
      }}
    >
      <IconCrosshair size={15} />
      <input placeholder="X" bind:value={jumpX} aria-label="Jump to X" />
      <span class="jump-sep">,</span>
      <input placeholder="Z" bind:value={jumpZ} aria-label="Jump to Z" />
      <button type="submit" title="Jump to coordinates"><IconSearch size={14} /></button>
    </form>

    <div class="map-badge">
      {#if scanning}
        <span class="map-spinner"></span> Scanning…
      {:else}
        <span class="map-dot"></span>
        {spots.length.toLocaleString()} candidates
      {/if}
      <span class="map-badge-sep"></span>
      <span class="map-approx">approximate</span>
    </div>

    <div class="map-zoom">
      <button onclick={() => zoomBy(1.5)} title="Zoom in"><IconPlus size={16} /></button>
      <button onclick={() => zoomBy(1 / 1.5)} title="Zoom out"><IconMinus size={16} /></button>
      <button onclick={resetView} title="Reset view (0, 0)"><IconFocusCentered size={16} /></button>
    </div>

    <div class="map-compass" title="North is up">
      <span>N</span>
    </div>

    <div class="map-scale">
      <div class="scale-line" style={`width:${Math.max(18, scaleDistance * scale)}px`}></div>
      <span>{scaleDistance >= 1024 ? `${scaleDistance / 1024}k` : scaleDistance} blocks</span>
    </div>

    <div class="map-coords">
      <span class="coord-center">X {Math.round(cx)} · Z {Math.round(cz)}</span>
      {#if cursor}
        <span class="coord-cursor">cursor {cursor.x}, {cursor.z}</span>
      {/if}
      <span class="coord-scale">{scale < 0.02 ? '1:' + Math.round(1 / scale) : `${scale.toFixed(scale < 0.1 ? 3 : 2)} px/b`}</span>
    </div>

    {#if selected}
      <div class="map-selected">
        <div class="sel-head">
          <span class="sel-dot" style={`background:${STRUCTURES[selected.id]?.color ?? '#fff'}`}></span>
          <span class="sel-name">{selected.label}{selected.index ? ` #${selected.index}` : ''}</span>
          <button class="sel-x" onclick={() => { selected = null; onselect(null); }} title="Close"><IconX size={13} /></button>
        </div>
        <div class="sel-coords">X {selected.x} · Z {selected.z} <span>{selected.dim}</span></div>
        <div class="sel-actions">
          <button onclick={copySelected}>
            {#if copied}<IconCheck size={13} /> Copied{:else}<IconCopy size={13} /> Copy coords{/if}
          </button>
          <button onclick={() => focusOn(selected!.x, selected!.z, Math.max(scale, 1))}>
            <IconFocusCentered size={13} /> Center
          </button>
        </div>
      </div>
    {/if}

    {#if hover}
      <div
        class="map-tip"
        style={`left:${Math.min(hover.px + 16, width - 210)}px; top:${Math.min(hover.py + 14, height - 80)}px`}
      >
        {#if hover.kind === 'spot'}
          <div class="tip-title">
            <span class="tip-dot" style={`background:${STRUCTURES[hover.spot.id]?.color ?? '#fff'}`}></span>
            {hover.spot.label}{hover.spot.index ? ` #${hover.spot.index}` : ''}
          </div>
          <div class="tip-coords">X {hover.spot.x} · Z {hover.spot.z}</div>
          <div class="tip-hint">{hover.spot.dim} · click for details</div>
        {:else}
          <div class="tip-title">{hover.count} structures here</div>
          <div class="tip-hint">click to zoom in</div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .map-wrap {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 420px;
    overflow: hidden;
    background: #0b110e;
    border-radius: 12px;
    isolation: isolate;
  }
  .map-canvas {
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
    cursor: grab;
    outline: none;
  }
  .map-canvas.dragging { cursor: grabbing; }
  .map-ui {
    position: absolute;
    inset: 0;
    pointer-events: none;
    font-family: 'Geist', ui-sans-serif, sans-serif;
  }
  .map-ui button,
  .map-ui input,
  .map-ui form,
  .map-ui .map-selected { pointer-events: auto; }

  .map-jump {
    position: absolute;
    top: 12px;
    left: 12px;
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 6px 7px 6px 10px;
    background: rgba(14, 20, 16, 0.9);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 9px;
    color: rgba(220, 235, 223, 0.6);
    backdrop-filter: blur(8px);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);
  }
  .map-jump input {
    width: 74px;
    background: transparent;
    border: none;
    outline: none;
    color: #e3eee6;
    font-family: 'Geist Mono', ui-monospace, monospace;
    font-size: 11.5px;
    padding: 4px 2px;
  }
  .map-jump input::placeholder { color: rgba(220, 235, 223, 0.32); }
  .jump-sep { color: rgba(220, 235, 223, 0.35); font-size: 12px; }
  .map-jump button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 25px;
    height: 25px;
    border-radius: 6px;
    border: 1px solid rgba(126, 201, 111, 0.3);
    background: rgba(126, 201, 111, 0.12);
    color: #cfe6d4;
    cursor: pointer;
  }
  .map-jump button:hover { background: rgba(126, 201, 111, 0.24); }

  .map-badge {
    position: absolute;
    top: 14px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 7px;
    background: rgba(14, 20, 16, 0.82);
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 999px;
    padding: 5px 12px;
    font-size: 11px;
    color: rgba(220, 235, 223, 0.72);
    backdrop-filter: blur(8px);
    white-space: nowrap;
  }
  .map-dot { width: 6px; height: 6px; border-radius: 50%; background: #7ec96f; box-shadow: 0 0 8px rgba(126,201,111,.7); }
  .map-badge-sep { width: 1px; height: 10px; background: rgba(255,255,255,.14); }
  .map-approx { color: rgba(220, 235, 223, 0.4); }
  .map-spinner {
    width: 9px;
    height: 9px;
    border: 1.5px solid rgba(126, 201, 111, 0.25);
    border-top-color: #7ec96f;
    border-radius: 50%;
    animation: mapspin 0.7s linear infinite;
  }
  @keyframes mapspin { to { transform: rotate(360deg); } }

  .map-zoom {
    position: absolute;
    right: 14px;
    bottom: 44px;
    display: flex;
    flex-direction: column;
    background: rgba(14, 20, 16, 0.9);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 9px;
    overflow: hidden;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);
  }
  .map-zoom button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 31px;
    background: transparent;
    border: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    color: #d9e5dc;
    cursor: pointer;
  }
  .map-zoom button:last-child { border-bottom: none; }
  .map-zoom button:hover { background: rgba(126, 201, 111, 0.13); }

  .map-compass {
    position: absolute;
    right: 16px;
    top: 14px;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: rgba(14, 20, 16, 0.86);
    border: 1px solid rgba(255, 255, 255, 0.12);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 600;
    color: rgba(220, 235, 223, 0.7);
  }
  .map-compass::before {
    content: '';
    position: absolute;
    top: 3px;
    border-left: 3px solid transparent;
    border-right: 3px solid transparent;
    border-bottom: 5px solid #7ec96f;
  }

  .map-scale {
    position: absolute;
    left: 14px;
    bottom: 40px;
    display: flex;
    flex-direction: column;
    gap: 3px;
    color: rgba(220, 235, 223, 0.55);
    font-size: 9.5px;
    letter-spacing: 0.03em;
  }
  .scale-line {
    height: 5px;
    border: 1px solid rgba(220, 235, 223, 0.55);
    border-top: none;
    background: linear-gradient(to right, rgba(220,235,223,.12), rgba(220,235,223,.12));
  }

  .map-coords {
    position: absolute;
    left: 14px;
    bottom: 12px;
    display: flex;
    align-items: center;
    gap: 9px;
    color: rgba(220, 235, 223, 0.5);
    font-size: 10px;
    font-family: 'Geist Mono', ui-monospace, monospace;
    background: rgba(14, 20, 16, 0.72);
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 6px;
    padding: 4px 8px;
    backdrop-filter: blur(6px);
  }
  .coord-center { color: rgba(220, 235, 223, 0.78); }
  .coord-cursor { color: rgba(220, 235, 223, 0.42); }
  .coord-scale { color: rgba(220, 235, 223, 0.3); }

  .map-tip {
    position: absolute;
    min-width: 150px;
    background: rgba(12, 17, 14, 0.97);
    border: 1px solid rgba(255, 255, 255, 0.13);
    border-radius: 8px;
    padding: 8px 10px;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(8px);
  }
  .tip-title { display: flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 600; color: #e4eee7; }
  .tip-dot { width: 7px; height: 7px; border-radius: 50%; }
  .tip-coords { font-family: 'Geist Mono', ui-monospace, monospace; font-size: 10.5px; color: rgba(220,235,223,.65); margin-top: 3px; }
  .tip-hint { font-size: 9.5px; color: rgba(220,235,223,.35); margin-top: 3px; text-transform: capitalize; }

  .map-selected {
    position: absolute;
    left: 14px;
    bottom: 66px;
    width: 218px;
    background: rgba(13, 19, 15, 0.96);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 10px;
    padding: 10px 11px;
    box-shadow: 0 10px 32px rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(8px);
  }
  .sel-head { display: flex; align-items: center; gap: 7px; }
  .sel-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .sel-name { font-size: 12px; font-weight: 600; color: #e7f0e9; flex: 1; }
  .sel-x { background: none; border: none; color: rgba(220,235,223,.45); cursor: pointer; padding: 0; display: flex; }
  .sel-x:hover { color: #fff; }
  .sel-coords { font-family: 'Geist Mono', ui-monospace, monospace; font-size: 10.5px; color: rgba(220,235,223,.62); margin-top: 4px; display: flex; justify-content: space-between; }
  .sel-coords span { text-transform: uppercase; font-size: 9px; letter-spacing: .06em; color: rgba(220,235,223,.35); }
  .sel-actions { display: flex; gap: 6px; margin-top: 9px; }
  .sel-actions button {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    background: rgba(126, 201, 111, 0.1);
    border: 1px solid rgba(126, 201, 111, 0.28);
    color: #cfe6d4;
    border-radius: 6px;
    padding: 5px 7px;
    font-size: 10px;
    cursor: pointer;
    font-family: 'Geist', sans-serif;
  }
  .sel-actions button:hover { background: rgba(126, 201, 111, 0.2); }

  @media (max-width: 720px) {
    .map-badge { display: none; }
    .map-jump { top: 8px; left: 8px; }
    .map-jump input { width: 56px; }
    .map-compass { top: 8px; right: 8px; }
    .map-selected { width: 190px; }
    .coord-cursor, .coord-scale { display: none; }
  }
</style>
