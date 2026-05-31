<script lang="ts">
  import { onMount } from "svelte";
  import {
    IconPencil, IconEraser, IconSquare, IconCircle,
    IconMinus, IconArrowBack, IconArrowForward,
    IconArrowBadgeRight, IconTrash, IconDownload, IconUpload, IconBrush,
    IconSlash, IconTriangle,
  } from "@tabler/icons-svelte";

  let { apiKey }: { apiKey: string } = $props();

  // ── SVG ────────────────────────────────────────────────────────────────
  let svgEl: SVGSVGElement;
  let w = $state(800);
  let h = $state(600);

  // ── Tool state ─────────────────────────────────────────────────────────
  type Tool = "pen" | "pencil" | "brush" | "eraser" | "line" | "rect" | "ellipse" | "arrow" | "triangle";
  let tool       = $state<Tool>("pen");
  let color      = $state("#ffffff");
  let bgColor    = $state("#1a1a1a");
  let lineWidth  = $state(3);
  let opacity    = $state(100);
  let hardness   = $state(100); // 100 = hard, 0 = soft (blur) — pencil texture
  let fill       = $state(false);

  // ── Strokes ─────────────────────────────────────────────────────────────
  type Point = { x: number; y: number };

  type Stroke = {
    id: string;
    tool: Tool;
    color: string;
    width: number;
    opacity: number;
    fill: boolean;
    d?: string;           // SVG path data for freehand strokes
    points: Point[];
    pencilPaths?: string[]; // cached pencil offset paths
    // Shape params
    shapeType?: string;
    sx?: number; sy?: number; ex?: number; ey?: number;
  };

  let strokes: Stroke[] = $state([]);
  let historyIdx = $state(-1);
  const MAX_HISTORY = 50;

  let drawing = false;
  let currentStroke: Stroke | null = $state(null);
  let currentPoints: Point[] = $state([]);
  let pencilPaths: string[] = $state([]);

  // ── SVG coords ──────────────────────────────────────────────────────────
  function svgPoint(e: PointerEvent): Point {
    const rect = canvasArea.getBoundingClientRect();
    const scaleX = w / rect.width;
    const scaleY = h / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  // ── Smooth curve ────────────────────────────────────────────────────────
  function smoothPath(pts: Point[]): string {
    if (pts.length === 0) return '';
    if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`;
    let d = `M${pts[0].x},${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 1];
      const p1 = pts[i];
      const cpx = (p0.x + p1.x) / 2;
      const cpy = (p0.y + p1.y) / 2;
      d += ` Q${p0.x},${p0.y} ${cpx},${cpy}`;
    }
    return d;
  }

  // ── Pencil: generate multiple offset paths ──────────────────────────────
  function generatePencilPaths(pts: Point[], w: number): string[] {
    const count = Math.max(2, Math.round(hardness / 20));
    const scatter = Math.max(0.2, (100 - hardness) / 30);
    const paths: string[] = [];
    for (let i = 0; i < count; i++) {
      const offset = (i - (count - 1) / 2) * scatter;
      const offsetPts = pts.map(p => ({ x: p.x + (Math.random() - 0.5) * scatter, y: p.y + (Math.random() - 0.5) * scatter }));
      paths.push(smoothPath(offsetPts));
    }
    return paths;
  }

  // ── Brush width from velocity ──────────────────────────────────────────
  let lastTime = 0;
  let lastPt: Point | null = null;

  function brushWidth(pt: Point): number {
    const now = performance.now();
    let vel = 0;
    if (lastPt && lastTime) {
      const dx = pt.x - lastPt.x;
      const dy = pt.y - lastPt.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const dt = Math.max(1, now - lastTime);
      vel = dist / dt;
    }
    lastPt = pt;
    lastTime = now;
    // Slow = wide, fast = thin
    const minW = lineWidth * 0.3;
    const maxW = lineWidth * 2;
    const factor = Math.min(1, vel / 3);
    return maxW - (maxW - minW) * factor;
  }

  // ── Pointer handlers ────────────────────────────────────────────────────
  function pointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    drawing = true;
    const pt = svgPoint(e);
    currentPoints = [pt];
    lastPt = pt;
    lastTime = performance.now();

    const isShape = ['line','rect','ellipse','arrow','triangle'].includes(tool);
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

    if (isShape) {
      currentStroke = {
        id, tool, color, width: lineWidth, opacity: opacity / 100, fill,
        shapeType: tool,
        points: [pt],
        sx: pt.x, sy: pt.y, ex: pt.x, ey: pt.y,
      };
    } else {
      currentStroke = {
        id, tool, color: tool === 'eraser' ? bgColor : color,
        width: tool === 'brush' ? lineWidth : lineWidth,
        opacity: opacity / 100,
        fill: false,
        points: [pt],
        d: `M${pt.x},${pt.y}`,
      };
    }

    svgEl.setPointerCapture(e.pointerId);
  }

  function pointerMove(e: PointerEvent) {
    if (!drawing || !currentStroke) return;
    const pt = svgPoint(e);
    currentPoints.push(pt);

    if (['line','rect','ellipse','arrow','triangle'].includes(tool)) {
      currentStroke.ex = pt.x;
      currentStroke.ey = pt.y;
    } else if (tool === 'pencil') {
      currentStroke.points = [...currentPoints];
      const paths = generatePencilPaths(currentPoints, lineWidth);
      pencilPaths = paths;
      currentStroke.d = paths[0];
    } else if (tool === 'brush') {
      const bw = brushWidth(pt);
      currentStroke.width = bw;
      currentStroke.points = [...currentPoints];
      currentStroke.d = smoothPath(currentPoints);
    } else {
      currentStroke.points = [...currentPoints];
      currentStroke.d = smoothPath(currentPoints);
    }
  }

  function pointerUp(_e: PointerEvent) {
    if (!drawing || !currentStroke) return;
    drawing = false;

    if (currentPoints.length < 2) return;

    // Truncate history past current index
    strokes = strokes.slice(0, historyIdx + 1);
    if (currentStroke.tool === 'pencil') {
      currentStroke.pencilPaths = generatePencilPaths(currentPoints, lineWidth);
    }
    strokes.push(currentStroke);
    historyIdx = strokes.length - 1;
    if (strokes.length > MAX_HISTORY) {
      strokes = strokes.slice(-MAX_HISTORY);
      historyIdx = strokes.length - 1;
    }

    currentStroke = null;
    currentPoints = [];
    pencilPaths = [];
    lastPt = null;
  }

  // ── Undo / Redo ─────────────────────────────────────────────────────────
  function undo() {
    if (historyIdx < 0) return;
    historyIdx--;
  }

  function redo() {
    if (historyIdx >= strokes.length - 1) return;
    historyIdx++;
  }

  function clearAll() {
    strokes = [];
    historyIdx = -1;
    currentStroke = null;
    currentPoints = [];
  }

  // ── Shape rendering ─────────────────────────────────────────────────────
  function shapeAttrs(s: Stroke) {
    if (!s.sx || !s.sy || s.ex === undefined || s.ey === undefined) return {};
    const x = Math.min(s.sx, s.ex);
    const y = Math.min(s.sy, s.ey);
    const sw = Math.abs(s.ex - s.sx);
    const sh = Math.abs(s.ey - s.sy);

    switch (s.shapeType) {
      case 'line':
        return { x1: s.sx, y1: s.sy, x2: s.ex, y2: s.ey };
      case 'rect':
        return { x, y, width: sw, height: sh, rx: 0 };
      case 'ellipse':
        return { cx: (s.sx + s.ex) / 2, cy: (s.sy + s.ey) / 2, rx: sw / 2, ry: sh / 2 };
      case 'arrow': {
        const angle = Math.atan2(s.ey - s.sy, s.ex - s.sx);
        const headLen = Math.min(20, Math.sqrt(sw*sw + sh*sh) * 0.3);
        const a = Math.PI / 6;
        const x1 = s.ex - headLen * Math.cos(angle - a);
        const y1 = s.ey - headLen * Math.sin(angle - a);
        const x2 = s.ex - headLen * Math.cos(angle + a);
        const y2 = s.ey - headLen * Math.sin(angle + a);
        return { x1: s.sx, y1: s.sy, x2: s.ex, y2: s.ey, headX1: x1, headY1: y1, headX2: x2, headY2: y2 };
      }
      case 'triangle':
        return { points: `${(s.sx + s.ex) / 2},${y} ${x},${s.ey} ${s.ex},${s.ey}` };
      default:
        return {};
    }
  }

  // ── Save to cloud ───────────────────────────────────────────────────────
  let saving    = $state(false);
  let saveError = $state<string | null>(null);
  let saveName  = $state("drawing.png");
  let saveOk    = $state(false);

  async function saveToCloud() {
    if (!svgEl || saving) return;
    saving = true; saveError = null; saveOk = false;
    try {
      // Render SVG to canvas, then upload
      const svgData = renderSvgString();
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      const img = new Image();
      const blob = await new Promise<Blob>((res, rej) => {
        img.onload = async () => {
          ctx.drawImage(img, 0, 0);
          canvas.toBlob(b => b ? res(b) : rej(new Error("toBlob failed")), "image/png");
        };
        img.onerror = rej;
        img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
      });
      const fd = new FormData();
      fd.append("file", blob, saveName);
      const up = await fetch("/api/telegram/uploadFile", {
        method: "POST", body: fd,
        headers: { "X-Api-Key": apiKey },
      });
      if (!up.ok) throw new Error(`Upload failed: ${up.status}`);
      saveOk = true;
      setTimeout(() => saveOk = false, 3000);
    } catch (err: any) {
      saveError = err?.message ?? "Failed to save";
    } finally {
      saving = false;
    }
  }

  // ── Render SVG string ───────────────────────────────────────────────────
  function renderSvgString(withBg = false): string {
    const visible = strokes.slice(0, historyIdx + 1);
    const cur = currentStroke;
    let inner = '';

    for (const s of visible) {
      if (s.shapeType) {
        const attrs = shapeAttrs(s);
        const sw = s.width;
        const op = s.opacity;
        if (s.shapeType === 'line') {
          inner += `<line ${attr(attrs,'x1','y1','x2','y2')} stroke="${s.color}" stroke-width="${sw}" stroke-linecap="round" opacity="${op}"/>`;
        } else if (s.shapeType === 'rect') {
          inner += `<rect ${attr(attrs,'x','y','width','height','rx')} fill="${s.fill ? s.color : 'none'}" stroke="${s.fill ? 'none' : s.color}" stroke-width="${sw}" opacity="${op}"/>`;
        } else if (s.shapeType === 'ellipse') {
          inner += `<ellipse ${attr(attrs,'cx','cy','rx','ry')} fill="${s.fill ? s.color : 'none'}" stroke="${s.fill ? 'none' : s.color}" stroke-width="${sw}" opacity="${op}"/>`;
        } else if (s.shapeType === 'arrow') {
          inner += `<line x1="${attrs.x1}" y1="${attrs.y1}" x2="${attrs.x2}" y2="${attrs.y2}" stroke="${s.color}" stroke-width="${sw}" stroke-linecap="round" opacity="${op}"/>`;
          inner += `<polygon points="${attrs.x2},${attrs.y2} ${attrs.headX1},${attrs.headY1} ${attrs.headX2},${attrs.headY2}" fill="${s.color}" opacity="${op}"/>`;
        } else if (s.shapeType === 'triangle') {
          inner += `<polygon points="${attrs.points}" fill="${s.fill ? s.color : 'none'}" stroke="${s.fill ? 'none' : s.color}" stroke-width="${sw}" stroke-linejoin="round" opacity="${op}"/>`;
        }
      } else if (s.d) {
        if (s.tool === 'pencil') {
          const paths = s.pencilPaths ?? generatePencilPaths(s.points, s.width);
          for (const pd of paths) {
            inner += `<path d="${pd}" fill="none" stroke="${s.color}" stroke-width="${s.width * 0.4}" stroke-linecap="round" stroke-linejoin="round" opacity="${s.opacity * 0.6}"/>`;
          }
          inner += `<path d="${s.d}" fill="none" stroke="${s.color}" stroke-width="${s.width * 0.3}" stroke-linecap="round" stroke-linejoin="round" opacity="${s.opacity}"/>`;
        } else {
          inner += `<path d="${s.d}" fill="none" stroke="${s.color}" stroke-width="${s.width}" stroke-linecap="round" stroke-linejoin="round" opacity="${s.opacity}"/>`;
        }
      }
    }

    // Current stroke (live preview)
    if (cur) {
      if (cur.shapeType) {
        const attrs = shapeAttrs(cur);
        const sw = cur.width / 2;
        if (cur.shapeType === 'line') {
          inner += `<line ${attr(attrs,'x1','y1','x2','y2')} stroke="${cur.color}" stroke-width="${sw}" stroke-linecap="round" opacity="0.5"/>`;
        } else if (cur.shapeType === 'rect') {
          inner += `<rect ${attr(attrs,'x','y','width','height','rx')} fill="${cur.fill ? cur.color : 'none'}" stroke="${cur.fill ? 'none' : cur.color}" stroke-width="${sw}" opacity="0.5"/>`;
        } else if (cur.shapeType === 'ellipse') {
          inner += `<ellipse ${attr(attrs,'cx','cy','rx','ry')} fill="${cur.fill ? cur.color : 'none'}" stroke="${cur.fill ? 'none' : cur.color}" stroke-width="${sw}" opacity="0.5"/>`;
        } else if (cur.shapeType === 'arrow') {
          inner += `<line x1="${attrs.x1}" y1="${attrs.y1}" x2="${attrs.x2}" y2="${attrs.y2}" stroke="${cur.color}" stroke-width="${sw}" stroke-linecap="round" opacity="0.5"/>`;
          inner += `<polygon points="${attrs.x2},${attrs.y2} ${attrs.headX1},${attrs.headY1} ${attrs.headX2},${attrs.headY2}" fill="${cur.color}" opacity="0.5"/>`;
        } else if (cur.shapeType === 'triangle') {
          inner += `<polygon points="${attrs.points}" fill="${cur.fill ? cur.color : 'none'}" stroke="${cur.fill ? 'none' : cur.color}" stroke-width="${sw}" stroke-linejoin="round" opacity="0.5"/>`;
        }
      } else if (cur.tool === 'pencil') {
        for (const pd of pencilPaths) {
          inner += `<path d="${pd}" fill="none" stroke="${cur.color}" stroke-width="${cur.width * 0.4}" stroke-linecap="round" stroke-linejoin="round" opacity="${(cur.opacity ?? 0.5) * 0.5}"/>`;
        }
        inner += `<path d="${cur.d}" fill="none" stroke="${cur.color}" stroke-width="${cur.width * 0.3}" stroke-linecap="round" stroke-linejoin="round" opacity="${cur.opacity ?? 0.5}"/>`;
      } else {
        inner += `<path d="${cur.d}" fill="none" stroke="${cur.color}" stroke-width="${cur.width / 2}" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/>`;
      }
    }

    const bg = withBg ? `<rect width="100%" height="100%" fill="${bgColor}"/>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${bg}${inner}</svg>`;
  }

  function attr(obj: any, ...keys: string[]): string {
    return keys.map(k => `${k}="${obj[k] ?? ''}"`).join(' ');
  }

  // ── Download ────────────────────────────────────────────────────────────
  function downloadPng() {
    const svgData = renderSvgString(true);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0);
      const a = document.createElement('a');
      a.download = saveName;
      a.href = canvas.toDataURL('image/png');
      a.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  }

  function downloadSvg() {
    const svgData = renderSvgString(true);
    const a = document.createElement('a');
    a.download = saveName.replace(/\.png$/i, '.svg');
    a.href = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
    a.click();
  }

  // ── Resize ──────────────────────────────────────────────────────────────
  let canvasArea: HTMLDivElement;

  function fitToContainer() {
    if (!canvasArea) return;
    const rect = canvasArea.getBoundingClientRect();
    w = Math.max(200, Math.round(rect.width));
    h = Math.max(200, Math.round(rect.height));
  }

  onMount(() => {
    fitToContainer();
    const ro = new ResizeObserver(fitToContainer);
    ro.observe(canvasArea);
    return () => ro.disconnect();
  });

  // ── Keyboard shortcuts ──────────────────────────────────────────────────
  function onkeydown(e: KeyboardEvent) {
    if (e.ctrlKey && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    if (e.ctrlKey && e.key === 'z' && e.shiftKey) { e.preventDefault(); redo(); }
    if (e.key === 'Escape') clearAll();
  }
</script>

<svelte:window onkeydown={onkeydown}/>

<div class="draw-wrap" role="application" tabindex="-1">
  <!-- Toolbar -->
  <div class="toolbar">
    <div class="tb-group">
      <button class="tb-btn" class:active={tool==='pen'} onclick={() => tool='pen'} title="Pen"><IconPencil size={15}/></button>
      <button class="tb-btn" class:active={tool==='pencil'} onclick={() => tool='pencil'} title="Pencil (textured)"><IconSlash size={15}/></button>
      <button class="tb-btn" class:active={tool==='brush'} onclick={() => tool='brush'} title="Brush (pressure)"><IconBrush size={15}/></button>
      <button class="tb-btn" class:active={tool==='eraser'} onclick={() => tool='eraser'} title="Eraser"><IconEraser size={15}/></button>
    </div>

    <div class="tb-sep"></div>

    <div class="tb-group">
      <button class="tb-btn" class:active={tool==='line'} onclick={() => tool='line'} title="Line"><IconMinus size={15}/></button>
      <button class="tb-btn" class:active={tool==='rect'} onclick={() => tool='rect'} title="Rectangle"><IconSquare size={15}/></button>
      <button class="tb-btn" class:active={tool==='ellipse'} onclick={() => tool='ellipse'} title="Ellipse"><IconCircle size={15}/></button>
      <button class="tb-btn" class:active={tool==='arrow'} onclick={() => tool='arrow'} title="Arrow"><IconArrowBadgeRight size={15}/></button>
      <button class="tb-btn" class:active={tool==='triangle'} onclick={() => tool='triangle'} title="Triangle"><IconTriangle size={15}/></button>
    </div>

    <div class="tb-sep"></div>

    <div class="tb-group tb-colors">
      <label class="color-label" title="Stroke color">
        <span class="color-swatch" style="background:{color}"></span>
        <input type="color" bind:value={color} class="color-input"/>
      </label>
    </div>

    <div class="tb-sep"/>

    <div class="tb-group">
      <button class="tb-btn" onclick={undo} disabled={historyIdx < 0} title="Undo (Ctrl+Z)"><IconArrowBack size={15}/></button>
      <button class="tb-btn" onclick={redo} disabled={historyIdx >= strokes.length - 1} title="Redo (Ctrl+Shift+Z)"><IconArrowForward size={15}/></button>
      <button class="tb-btn" onclick={clearAll} disabled={strokes.length === 0} title="Clear all"><IconTrash size={15}/></button>
    </div>

    <div class="tb-sep"/>

    <div class="tb-group tb-colors">
      <label class="color-label" title="Stroke color">
        <span class="color-swatch" style="background:{color}"/>
        <input type="color" bind:value={color} class="color-input"/>
      </label>
    </div>

    <div class="tb-group tb-sliders">
      <label class="slider-label" title="Stroke width">
        <span class="slider-icon">●</span>
        <input type="range" min="0.5" max="40" step="0.5" bind:value={lineWidth}/>
      </label>
      <label class="slider-label" title="Opacity">
        <span class="slider-icon" style="opacity:{opacity/100}">●</span>
        <input type="range" min="5" max="100" bind:value={opacity}/>
      </label>
      {#if tool === 'pencil'}
        <label class="slider-label" title="Hardness (higher = crisper)">
          <span class="slider-icon">H</span>
          <input type="range" min="1" max="100" bind:value={hardness}/>
        </label>
      {/if}
      <label class="slider-label" title="Fill shapes">
        <input type="checkbox" bind:checked={fill}/>
        <span class="slider-icon">F</span>
      </label>
    </div>
  </div>

  <!-- SVG Canvas -->
  <div class="canvas-area" bind:this={canvasArea}>
    <svg
      bind:this={svgEl}
      viewBox="0 0 {w} {h}"
      class="draw-svg"
      onpointerdown={pointerDown}
      onpointermove={pointerMove}
      onpointerup={pointerUp}
      onpointerleave={pointerUp}
      style="touch-action:none"
    >
      <rect width="100%" height="100%" fill={bgColor}/>

      {#each strokes.slice(0, historyIdx + 1) as s}
        {#if s.shapeType}
          {#if s.shapeType === 'line'}
            <line x1={s.sx} y1={s.sy} x2={s.ex} y2={s.ey} stroke={s.color} stroke-width={s.width} stroke-linecap="round" opacity={s.opacity}/>
          {:else if s.shapeType === 'rect'}
            <rect x={Math.min(s.sx,s.ex)} y={Math.min(s.sy,s.ey)} width={Math.abs(s.ex-s.sx)} height={Math.abs(s.ey-s.sy)}
              fill={s.fill ? s.color : 'none'} stroke={s.fill ? 'none' : s.color} stroke-width={s.width} opacity={s.opacity}/>
          {:else if s.shapeType === 'ellipse'}
            <ellipse cx={(s.sx+s.ex)/2} cy={(s.sy+s.ey)/2} rx={Math.abs(s.ex-s.sx)/2} ry={Math.abs(s.ey-s.sy)/2}
              fill={s.fill ? s.color : 'none'} stroke={s.fill ? 'none' : s.color} stroke-width={s.width} opacity={s.opacity}/>
          {:else if s.shapeType === 'arrow'}
            {@const sa = shapeAttrs(s)}
            <line x1={sa.x1} y1={sa.y1} x2={sa.x2} y2={sa.y2} stroke={s.color} stroke-width={s.width} stroke-linecap="round" opacity={s.opacity}/>
            <polygon points={`${sa.x2},${sa.y2} ${sa.headX1},${sa.headY1} ${sa.headX2},${sa.headY2}`} fill={s.color} opacity={s.opacity}/>
          {:else if s.shapeType === 'triangle'}
            {@const triPts = `${(s.sx!+s.ex!)/2},${Math.min(s.sy!,s.ey!)} ${Math.min(s.sx!,s.ex!)},${s.ey} ${s.ex},${s.ey}`}
            <polygon points={triPts}
              fill={s.fill ? s.color : 'none'} stroke={s.fill ? 'none' : s.color} stroke-width={s.width} stroke-linejoin="round" opacity={s.opacity}/>
          {/if}
        {:else if s.d}
          {#if s.tool === 'pencil'}
            {#each s.pencilPaths ?? [] as pd}
              <path d={pd} fill="none" stroke={s.color} stroke-width={s.width*0.4} stroke-linecap="round" stroke-linejoin="round" opacity={s.opacity*0.6}/>
            {/each}
            <path d={s.d} fill="none" stroke={s.color} stroke-width={s.width*0.3} stroke-linecap="round" stroke-linejoin="round" opacity={s.opacity}/>
          {:else}
            <path d={s.d} fill="none" stroke={s.color} stroke-width={s.width} stroke-linecap="round" stroke-linejoin="round" opacity={s.opacity}/>
          {/if}
        {/if}
      {/each}

      <!-- Live preview of current stroke -->
      {#if currentStroke}
        {#if currentStroke.shapeType}
          {#if currentStroke.shapeType === 'line'}
            <line x1={currentStroke.sx} y1={currentStroke.sy} x2={currentStroke.ex} y2={currentStroke.ey}
              stroke={currentStroke.color} stroke-width={currentStroke.width/2} stroke-linecap="round" opacity="0.5"/>
          {:else if currentStroke.shapeType === 'rect'}
            <rect x={Math.min(currentStroke.sx,currentStroke.ex)} y={Math.min(currentStroke.sy,currentStroke.ey)}
              width={Math.abs(currentStroke.ex-currentStroke.sx)} height={Math.abs(currentStroke.ey-currentStroke.sy)}
              fill={currentStroke.fill ? currentStroke.color : 'none'} stroke={currentStroke.fill ? 'none' : currentStroke.color}
              stroke-width={currentStroke.width/2} opacity="0.5"/>
          {:else if currentStroke.shapeType === 'ellipse'}
            <ellipse cx={(currentStroke.sx+currentStroke.ex)/2} cy={(currentStroke.sy+currentStroke.ey)/2}
              rx={Math.abs(currentStroke.ex-currentStroke.sx)/2} ry={Math.abs(currentStroke.ey-currentStroke.sy)/2}
              fill={currentStroke.fill ? currentStroke.color : 'none'} stroke={currentStroke.fill ? 'none' : currentStroke.color}
              stroke-width={currentStroke.width/2} opacity="0.5"/>
          {:else if currentStroke.shapeType === 'arrow'}
            {@const sa = shapeAttrs(currentStroke)}
            <line x1={sa.x1} y1={sa.y1} x2={sa.x2} y2={sa.y2} stroke={currentStroke.color} stroke-width={currentStroke.width/2} stroke-linecap="round" opacity="0.5"/>
            <polygon points={`${sa.x2},${sa.y2} ${sa.headX1},${sa.headY1} ${sa.headX2},${sa.headY2}`} fill={currentStroke.color} opacity="0.5"/>
          {:else if currentStroke.shapeType === 'triangle'}
            {@const triPts = `${(currentStroke.sx!+currentStroke.ex!)/2},${Math.min(currentStroke.sy!,currentStroke.ey!)} ${Math.min(currentStroke.sx!,currentStroke.ex!)},${currentStroke.ey} ${currentStroke.ex},${currentStroke.ey}`}
            <polygon points={triPts}
              fill={currentStroke.fill ? currentStroke.color : 'none'} stroke={currentStroke.fill ? 'none' : currentStroke.color}
              stroke-width={currentStroke.width/2} stroke-linejoin="round" opacity="0.5"/>
          {/if}
        {:else}
          {#if currentStroke.tool === 'pencil'}
            {#each pencilPaths as pd}
              <path d={pd} fill="none" stroke={currentStroke.color} stroke-width={currentStroke.width*0.4} stroke-linecap="round" stroke-linejoin="round" opacity={(currentStroke.opacity??0.5)*0.5}/>
            {/each}
          {/if}
          <path d={currentStroke.d} fill="none" stroke={currentStroke.color} stroke-width={currentStroke.tool==='brush'?currentStroke.width:currentStroke.width/2}
            stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/>
        {/if}
      {/if}
    </svg>
  </div>

  <!-- Bottom bar -->
  <div class="bottom-bar">
    <div class="bb-left">
      <span class="bb-stats">{historyIdx + 1} strokes</span>
    </div>
    <div class="bb-right">
      <input class="fname-input" bind:value={saveName} placeholder="drawing.png"/>
      {#if saveOk}
        <span class="save-ok">✓ Saved!</span>
      {/if}
      {#if saveError}
        <span class="save-err">{saveError}</span>
      {/if}
      <button class="action-btn" onclick={downloadPng} title="Download PNG"><IconDownload size={14}/> PNG</button>
      <button class="action-btn" onclick={downloadSvg} title="Download SVG"><IconDownload size={14}/> SVG</button>
      <button class="action-btn primary" onclick={saveToCloud} disabled={saving} title="Save to your cloud">
        {#if saving}
          Saving…
        {:else}
          <IconUpload size={14}/> Save
        {/if}
      </button>
    </div>
  </div>
</div>

<style>
  .draw-wrap {
    display: flex; flex-direction: column;
    height: 100%; width: 100%;
    background: var(--bg-1);
    user-select: none;
  }

  .toolbar {
    display: flex; align-items: center; gap: 6px;
    padding: 8px 12px;
    background: var(--bg-2);
    border-bottom: 1px solid var(--border);
    flex-wrap: wrap;
  }
  .tb-group { display: flex; align-items: center; gap: 2px; }
  .tb-sep {
    width: 1px; height: 20px;
    background: var(--border);
    flex-shrink: 0;
  }
  .tb-btn {
    display: flex; align-items: center; justify-content: center;
    width: 28px; height: 28px; border-radius: 7px;
    background: none; border: none;
    color: var(--text-2); cursor: pointer;
    transition: .13s;
  }
  .tb-btn:hover { background: var(--hover); color: var(--text-1); }
  .tb-btn.active { background: var(--accent); color: #fff; }
  .tb-btn:disabled { opacity: .25; cursor: default; }

  .color-label {
    position: relative; cursor: pointer;
    display: flex; align-items: center; gap: 4px;
  }
  .color-swatch {
    width: 22px; height: 22px; border-radius: 50%;
    border: 2px solid var(--border);
    display: block;
  }
  .color-input {
    position: absolute; opacity: 0; width: 0; height: 0;
  }

  .slider-label {
    display: flex; align-items: center; gap: 4px;
    font-size: 11px; color: var(--text-3);
  }
  .slider-label input[type="range"] {
    width: 48px; height: 4px;
    accent-color: var(--accent);
  }
  .slider-label input[type="checkbox"] {
    width: 14px; height: 14px;
    accent-color: var(--accent);
  }
  .slider-icon {
    width: 16px; text-align: center;
    font-size: 10px; flex-shrink: 0;
  }
  .tb-sliders { gap: 8px; flex-wrap: wrap; }

  .canvas-area {
    flex: 1; display: flex; overflow: hidden;
    min-height: 0;
  }
  .draw-svg {
    width: 100%; height: 100%;
    display: block;
    cursor: crosshair;
  }

  .bottom-bar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 12px;
    background: var(--bg-2);
    border-top: 1px solid var(--border);
    gap: 8px; flex-wrap: wrap;
  }
  .bb-left { display: flex; align-items: center; gap: 8px; }
  .bb-right { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .bb-stats { font-size: 11px; color: var(--text-3); font-family: 'Geist Mono', monospace; }
  .fname-input {
    background: var(--bg-1); border: 1px solid var(--border);
    border-radius: 6px; padding: 4px 8px;
    color: var(--text-1); font-size: 12px;
    font-family: 'Geist Mono', monospace;
    width: 120px; outline: none;
  }
  .fname-input:focus { border-color: var(--border-hover); }
  .action-btn {
    display: flex; align-items: center; gap: 5px;
    padding: 5px 12px; border-radius: 7px;
    border: 1px solid var(--border);
    background: var(--bg-1); color: var(--text-2);
    font-size: 12px; font-family: 'Geist', sans-serif;
    cursor: pointer; transition: .13s;
  }
  .action-btn:hover { border-color: var(--border-hover); color: var(--text-1); background: var(--hover); }
  .action-btn.primary {
    background: var(--accent); border-color: var(--accent); color: #fff;
  }
  .action-btn.primary:hover { opacity: .88; }
  .action-btn.primary:disabled { opacity: .5; cursor: not-allowed; }
  .save-ok { color: var(--green); font-size: 12px; }
  .save-err { color: var(--red); font-size: 12px; }
</style>
