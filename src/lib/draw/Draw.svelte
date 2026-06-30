<script lang="ts">
  import { onMount } from "svelte";
  import {
    IconPencil, IconEraser, IconSquare, IconCircle,
    IconMinus, IconArrowBack, IconArrowForward,
    IconArrowBadgeRight, IconTrash, IconDownload, IconUpload, IconBrush,
    IconTriangle, IconColorPicker, IconBucketDroplet,
    IconLetterT, IconPointer, IconSelector,
    IconGridDots, IconRuler, IconLock, IconLockOpen,
  } from "@tabler/icons-svelte";
  import type { Tool, Point, Stroke, Layer, BrushPreset, HistoryEntry, CanvasSettings } from "./types";
  import { BRUSH_PRESETS } from "./presets";
  import { Stabilizer, smoothPath, variableWidthPath, generatePencilPaths, shapeAttrs, escapeXml, minDistFilter } from "./engine";
  import ColorPicker from "./ColorPicker.svelte";

  let { apiKey, fullscreen = false }: { apiKey: string; fullscreen?: boolean } = $props();

  // ── Canvas ──────────────────────────────────────────────────────────
  let svgEl: SVGSVGElement = $state() as SVGSVGElement;
  let canvasWrap: HTMLDivElement = $state() as HTMLDivElement;
  let w = $state(1200);
  let h = $state(800);

  // ── Zoom / Pan / Rotation ──────────────────────────────────────────
  let zoom = $state(1);
  let panX = $state(0);
  let panY = $state(0);
  let panning = $state(false);
  let panStart = $state({ x: 0, y: 0 });
  let spaceHeld = $state(false);
  let canvasRotation = $state(0);
  const MIN_ZOOM = 0.05;
  const MAX_ZOOM = 32;

  // ── Cursor ──────────────────────────────────────────────────────────
  let cursorX = $state(0);
  let cursorY = $state(0);
  let cursorScreenX = $state(0);
  let cursorScreenY = $state(0);
  let pressure = $state(0.5);
  let hovering = $state(false);

  // ── Tools ───────────────────────────────────────────────────────────
  type ToolGroup = "pointer" | "draw" | "shape" | "misc";
  const TOOL_GROUPS: { group: ToolGroup; tools: { id: Tool; label: string; key: string }[] }[] = [
    { group: "pointer", tools: [
      { id: "move", label: "Move (V)", key: "v" },
      { id: "select", label: "Select (M)", key: "m" },
    ]},
    { group: "draw", tools: [
      { id: "brush", label: "Brush (B)", key: "b" },
      { id: "pencil", label: "Pencil (N)", key: "n" },
      { id: "pen", label: "Pen (P)", key: "p" },
      { id: "eraser", label: "Eraser (E)", key: "e" },
      { id: "chalk", label: "Chalk (C)", key: "c" },
    ]},
    { group: "shape", tools: [
      { id: "line", label: "Line (L)", key: "l" },
      { id: "rect", label: "Rectangle (U)", key: "u" },
      { id: "ellipse", label: "Ellipse (O)", key: "o" },
      { id: "arrow", label: "Arrow (A)", key: "a" },
      { id: "triangle", label: "Triangle", key: "" },
    ]},
    { group: "misc", tools: [
      { id: "eyedropper", label: "Eyedropper (I)", key: "i" },
      { id: "fill", label: "Fill Bucket (G)", key: "g" },
      { id: "text", label: "Text (T)", key: "t" },
    ]},
  ];

  let tool = $state<Tool>("brush");

  // ── Brush settings ──────────────────────────────────────────────────
  let activePresetIdx = $state(0);
  let activePreset = $derived(BRUSH_PRESETS[activePresetIdx]);
  let lineWidth = $state(4);
  let opacity = $state(100);
  let hardness = $state(100);
  let smoothing = $state(0.5);
  let taper = $state(0);
  let pressureSize = $state(true);
  let pressureOpacity = $state(true);
  let brushAngle = $state(0);
  let scatter = $state(0);
  let fillShapes = $state(false);
  let fontSize = $state(32);
  let fontFamily = $state("sans-serif");
  let fontWeight = $state("400");
  let fontStyle = $state("normal");
  let textAlign = $state<"left" | "center" | "right">("left");

  // ── Inline text editor state ────────────────────────────────────────
  let textEditing = $state(false);
  let textEditX = $state(0);
  let textEditY = $state(0);
  let textEditContent = $state("");
  let textEditScreenX = $state(0);
  let textEditScreenY = $state(0);
  let textEditEl: HTMLTextAreaElement | null = $state(null);

  const FONT_FAMILIES = [
    "sans-serif", "serif", "monospace", "cursive", "fantasy",
    "Arial", "Helvetica", "Georgia", "Times New Roman", "Courier New",
    "Verdana", "Trebuchet MS", "Impact", "Comic Sans MS",
    "Fira Code", "Geist Mono", "Inter", "Roboto", "Open Sans",
    "Montserrat", "Playfair Display", "Pacifico", "Lobster",
  ];

  function applyPreset(p: BrushPreset) {
    const idx = BRUSH_PRESETS.indexOf(p);
    if (idx >= 0) activePresetIdx = idx;
    lineWidth = p.size;
    hardness = p.hardness;
    opacity = p.opacity;
    smoothing = p.smoothing;
    taper = p.taper;
    pressureSize = p.pressureSize;
    pressureOpacity = p.pressureOpacity;
    brushAngle = p.brushAngle;
    scatter = p.scatter;
    if (p.category === "special" && p.name.includes("Eraser")) tool = "eraser";
    else tool = "brush";
  }

  // ── Colors ──────────────────────────────────────────────────────────
  let fgColor = $state("#000000");
  let bgColor2 = $state("#ffffff");
  let recentColors = $state<string[]>([
    "#ff0000","#00ff00","#0000ff","#ffff00","#ff00ff","#00ffff","#ff8800","#8800ff",
    "#ffffff","#888888","#444444","#000000","#ff4444","#44ff44","#4444ff","#ffaa00",
  ]);
  let colorPanelMode = $state<"fg" | "bg">("fg");

  function swapColors() {
    const tmp = fgColor;
    fgColor = bgColor2;
    bgColor2 = tmp;
  }

  // ── Layers ──────────────────────────────────────────────────────────
  let layers = $state<Layer[]>([
    { id: "bg", name: "Background", visible: true, opacity: 100, strokes: [], blendMode: "normal", fill: 100 },
  ]);
  let activeLayerIdx = $state(0);

  function addLayer() {
    const id = "L" + Date.now().toString(36);
    layers.push({ id, name: `Layer ${layers.length + 1}`, visible: true, opacity: 100, strokes: [], blendMode: "normal", fill: 100 });
    activeLayerIdx = layers.length - 1;
  }

  function removeLayer() {
    if (layers.length <= 1) return;
    layers.splice(activeLayerIdx, 1);
    if (activeLayerIdx >= layers.length) activeLayerIdx = layers.length - 1;
    layers = [...layers];
  }

  function moveLayerUp() {
    if (activeLayerIdx >= layers.length - 1) return;
    const tmp = layers[activeLayerIdx];
    layers[activeLayerIdx] = layers[activeLayerIdx + 1];
    layers[activeLayerIdx + 1] = tmp;
    activeLayerIdx++;
    layers = [...layers];
  }

  function moveLayerDown() {
    if (activeLayerIdx <= 0) return;
    const tmp = layers[activeLayerIdx];
    layers[activeLayerIdx] = layers[activeLayerIdx - 1];
    layers[activeLayerIdx - 1] = tmp;
    activeLayerIdx--;
    layers = [...layers];
  }

  // ── Canvas settings ─────────────────────────────────────────────────
  let settings = $state<CanvasSettings>({
    showGrid: false,
    gridSize: 50,
    snapToGrid: false,
    showRulers: true,
    checkerBg: true,
    canvasRotation: 0,
  });

  // ── History ─────────────────────────────────────────────────────────
  let undoStack = $state<HistoryEntry[]>([]);
  let redoStack = $state<HistoryEntry[]>([]);
  const MAX_HISTORY = 100;

  function pushHistory(entry: HistoryEntry) {
    undoStack.push(entry);
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack = [];
  }

  function undo() {
    if (undoStack.length === 0) return;
    const entry = undoStack.pop()!;
    const layer = layers.find(l => l.id === entry.layerId);
    if (!layer) return;

    if (entry.action === "stroke") {
      for (const s of entry.strokes) {
        layer.strokes = layer.strokes.filter(st => st.id !== s.id);
      }
      redoStack.push(entry);
    } else if (entry.action === "clear") {
      layer.strokes = entry.strokes;
      redoStack.push(entry);
    }
    layers = [...layers];
  }

  function redo() {
    if (redoStack.length === 0) return;
    const entry = redoStack.pop()!;
    const layer = layers.find(l => l.id === entry.layerId);
    if (!layer) return;

    if (entry.action === "stroke") {
      layer.strokes = [...layer.strokes, ...entry.strokes];
      undoStack.push(entry);
    } else if (entry.action === "clear") {
      layer.strokes = [];
      undoStack.push(entry);
    }
    layers = [...layers];
  }

  function clearAll() {
    const entry: HistoryEntry = {
      action: "clear",
      layerId: getActiveLayer().id,
      strokes: [...getActiveLayer().strokes],
    };
    getActiveLayer().strokes = [];
    pushHistory(entry);
    layers = [...layers];
  }

  // ── Image import ────────────────────────────────────────────────────
  let fileInputEl: HTMLInputElement | null = null;

  function importImage() {
    fileInputEl?.click();
  }

  function handleImageFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    input.value = "";
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        let iw = img.naturalWidth;
        let ih = img.naturalHeight;
        const maxDim = Math.max(w, h) * 0.8;
        if (iw > maxDim || ih > maxDim) {
          const scale = maxDim / Math.max(iw, ih);
          iw *= scale;
          ih *= scale;
        }
        const s: Stroke = {
          id: "img_" + Date.now().toString(36),
          tool: "brush",
          color: "#000000",
          baseWidth: 0,
          opacity: 1,
          fill: false,
          points: [{ x: (w - iw) / 2, y: (h - ih) / 2, pressure: 0.5, time: performance.now() }],
          imageData: dataUrl,
          imageW: iw,
          imageH: ih,
          layerId: getActiveLayer().id,
        };
        getActiveLayer().strokes = [...getActiveLayer().strokes, s];
        pushHistory({ action: "stroke", layerId: s.layerId, strokes: [s] });
        layers = [...layers];
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  // ── Canvas resize dialog ────────────────────────────────────────────
  let showResizeDialog = $state(false);
  let resizeW = $state(1200);
  let resizeH = $state(800);
  let resizeScale = $state(true);

  function openResizeDialog() {
    resizeW = w;
    resizeH = h;
    showResizeDialog = true;
  }

  function applyResize() {
    const nw = Math.max(1, Math.round(resizeW));
    const nh = Math.max(1, Math.round(resizeH));
    if (resizeScale && (nw !== w || nh !== h)) {
      const sx = nw / w;
      const sy = nh / h;
      for (const layer of layers) {
        for (const s of layer.strokes) {
          if (s.imageData) {
            s.points[0] = { ...s.points[0], x: s.points[0].x * sx, y: s.points[0].y * sy };
            s.imageW = (s.imageW ?? 0) * sx;
            s.imageH = (s.imageH ?? 0) * sy;
          } else if (s.shapeType) {
            s.sx = (s.sx ?? 0) * sx; s.sy = (s.sy ?? 0) * sy;
            s.ex = (s.ex ?? 0) * sx; s.ey = (s.ey ?? 0) * sy;
          } else {
            for (const p of s.points) { p.x *= sx; p.y *= sy; }
            if (s.d) s.d = s.d.replace(/(-?[\d.]+),(-?[\d.]+)/g, (_, x, y) => `${(parseFloat(x) * sx).toFixed(1)},${(parseFloat(y) * sy).toFixed(1)}`);
            if (s.variableWidthPath) s.variableWidthPath = s.variableWidthPath.replace(/(-?[\d.]+),(-?[\d.]+)/g, (_, x, y) => `${(parseFloat(x) * sx).toFixed(1)},${(parseFloat(y) * sy).toFixed(1)}`);
          }
        }
      }
    }
    w = nw;
    h = nh;
    showResizeDialog = false;
    layers = [...layers];
  }

  // ── Save-to-cloud dialog ────────────────────────────────────────────
  let showSaveDialog = $state(false);
  let saveFolder = $state("");
  let saveFileName = $state("drawing.png");

  function openSaveDialog() {
    saveFileName = "drawing.png";
    saveFolder = "";
    showSaveDialog = true;
  }

  async function confirmSaveToCloud() {
    showSaveDialog = false;
    const fullName = saveFolder ? `${saveFolder}/${saveFileName}` : saveFileName;
    saveName = fullName;
    await saveToCloud();
  }

  // ── Selection ─────────────────────────────────────────────────────
  let selectedIds = $state<Set<string>>(new Set());
  let selectDragStart = $state<{x:number;y:number} | null>(null);
  let selectDragOffsets = $state<Map<string,{dx:number;dy:number}>>(new Map());
  let marqueeStart = $state<{x:number;y:number} | null>(null);
  let marqueeEnd = $state<{x:number;y:number} | null>(null);
  let selectionVersion = $state(0);
  let hasSelection = $derived(selectionVersion > 0 && selectedIds.size > 0);

  // ── Transform handles ──────────────────────────────────────────────
  let showTransformControls = $state(true);
  let transformHandle = $state<string | null>(null);
  let transformStart = $state<{mx:number;my:number;bbox:{x:number;y:number;w:number;h:number};rotation:number}>({mx:0,my:0,bbox:{x:0,y:0,w:0,h:0},rotation:0});
  let selectionRotation = $state(0);

  // ── Strokes ─────────────────────────────────────────────────────────
  let drawing = $state(false);
  let currentStroke = $state<Stroke | null>(null);
  let currentPoints = $state<Point[]>([]);
  let currentPencilPaths = $state<string[]>([]);
  let currentVWPath = $state("");
  let shiftHeld = $state(false);
  let stabilizer = new Stabilizer(20, 0.6);

  function getActiveLayer(): Layer {
    return layers[activeLayerIdx] ?? layers[0];
  }

  // ── SVG coords ──────────────────────────────────────────────────────
  function svgPoint(e: PointerEvent): Point {
    const rect = svgEl.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / zoom,
      y: (e.clientY - rect.top) / zoom,
      pressure: e.pressure || 0.5,
      time: performance.now(),
    };
  }

  function snapToGrid(pt: Point): Point {
    if (!settings.snapToGrid) return pt;
    const g = settings.gridSize;
    return { ...pt, x: Math.round(pt.x / g) * g, y: Math.round(pt.y / g) * g };
  }

  // ── Pointer handlers ────────────────────────────────────────────────
  function pointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    if (spaceHeld || tool === "move") {
      panning = true;
      panStart = { x: e.clientX - panX, y: e.clientY - panY };
      return;
    }

    // ── Transform handle interaction (works with any tool) ──
    if (hasSelection && showTransformControls) {
      const handleHit = hitTestTransformHandle(e);
      if (handleHit) {
        const bbox = getSelectionBBox();
        if (bbox) {
          transformHandle = handleHit;
          transformStart = { mx: e.clientX, my: e.clientY, bbox: { ...bbox }, rotation: selectionRotation };
          svgEl.setPointerCapture(e.pointerId);
          return;
        }
      }
    }

    if (tool === "eyedropper") { pickColor(e); return; }
    if (tool === "select") {
      const els = document.elementsFromPoint(e.clientX, e.clientY);
      let hitId: string | null = null;
      for (const el of els) {
        let node: Element | null = el;
        while (node && node !== svgEl) {
          const sid = node.getAttribute("data-sid");
          if (sid) { hitId = sid; break; }
          node = node.parentElement;
        }
        if (hitId) break;
      }
      if (hitId) {
        if (e.shiftKey) {
          if (selectedIds.has(hitId)) selectedIds.delete(hitId); else selectedIds.add(hitId);
        } else {
          if (!selectedIds.has(hitId)) { selectedIds.clear(); selectedIds.add(hitId); }
        }
        selectedIds = selectedIds;
        selectionVersion++;
        if (selectedIds.size > 0 && rightPanel !== "selection") rightPanel = "selection";
        selectDragStart = { x: e.clientX, y: e.clientY };
        const layer = getActiveLayer();
        selectDragOffsets = new Map();
        for (const id of selectedIds) {
          const s = layer.strokes.find(st => st.id === id);
          if (s) {
            if (s.shapeType) selectDragOffsets.set(id, { dx: 0, dy: 0 });
            else {
              const pts = s.points;
              const minX = Math.min(...pts.map(p => p.x));
              const minY = Math.min(...pts.map(p => p.y));
              selectDragOffsets.set(id, { dx: -minX, dy: -minY });
            }
          }
        }
      } else {
        if (!e.shiftKey) selectedIds.clear();
        selectedIds = selectedIds;
        selectionVersion++;
        marqueeStart = { x: e.clientX, y: e.clientY };
        marqueeEnd = { x: e.clientX, y: e.clientY };
      }
      return;
    }

    if (tool === "text") {
      const pt = svgPoint(e);
      if (textEditing) {
        commitText();
        return;
      }
      const rect = canvasWrap.getBoundingClientRect();
      const svgRect = svgEl.getBoundingClientRect();
      textEditX = pt.x;
      textEditY = pt.y;
      textEditScreenX = svgRect.left - rect.left + pt.x * zoom;
      textEditScreenY = svgRect.top - rect.top + pt.y * zoom;
      textEditContent = "";
      textEditing = true;
      setTimeout(() => textEditEl?.focus(), 10);
      return;
    }

    drawing = true;
    stabilizer = new Stabilizer(20, smoothing);
    stabilizer.reset();
    const pt = snapToGrid(svgPoint(e));
    currentPoints = [pt];
    pressure = e.pressure || 0.5;

    const isShape = ["line", "rect", "ellipse", "arrow", "triangle"].includes(tool);
    const isEraserTool = tool === "eraser";
    const baseColor = isEraserTool ? "black" : fgColor;

    if (isShape) {
      currentStroke = {
        id: uid(), tool, color: baseColor, baseWidth: lineWidth,
        opacity: opacity / 100, fill: fillShapes,
        shapeType: tool, points: [pt],
        sx: pt.x, sy: pt.y, ex: pt.x, ey: pt.y,
        layerId: getActiveLayer().id,
      };
    } else {
      currentStroke = {
        id: uid(), tool, color: baseColor, baseWidth: lineWidth,
        opacity: opacity / 100, fill: false,
        points: [pt], d: `M${pt.x},${pt.y}`,
        layerId: getActiveLayer().id, brushAngle,
      };
    }
    svgEl.setPointerCapture(e.pointerId);
  }

  function pointerMove(e: PointerEvent) {
    const pt = svgPoint(e);
    cursorX = Math.round(pt.x);
    cursorY = Math.round(pt.y);
    cursorScreenX = e.clientX;
    cursorScreenY = e.clientY;
    pressure = e.pressure || 0.5;

    if (panning) {
      panX = e.clientX - panStart.x;
      panY = e.clientY - panStart.y;
      return;
    }

    // ── Transform handle drag ──
    if (transformHandle) {
      const dx = (e.clientX - transformStart.mx) / zoom;
      const dy = (e.clientY - transformStart.my) / zoom;
      const sb = transformStart.bbox;

      if (transformHandle === "move") {
        moveStrokes(dx, dy);
      } else if (transformHandle.startsWith("rotate-")) {
        const cx = sb.x + sb.w / 2;
        const cy = sb.y + sb.h / 2;
        const svgRect = svgEl.getBoundingClientRect();
        const mx = (e.clientX - svgRect.left) / zoom;
        const my = (e.clientY - svgRect.top) / zoom;
        const angle = Math.atan2(my - cy, mx - cx) * 180 / Math.PI;
        const prevAngle = Math.atan2((transformStart.my - svgRect.top) / zoom - cy, (transformStart.mx - svgRect.left) / zoom - cx) * 180 / Math.PI;
        const deltaAngle = angle - prevAngle;
        selectionRotation += deltaAngle;
        rotateStrokes(deltaAngle, cx, cy);
        transformStart.mx = e.clientX;
        transformStart.my = e.clientY;
      } else {
        // Resize handle
        let newX = sb.x, newY = sb.y, newW = sb.w, newH = sb.h;
        if (transformHandle.includes("e")) { newW = Math.max(1, sb.w + dx); }
        if (transformHandle.includes("w")) { newX = sb.x + dx; newW = Math.max(1, sb.w - dx); }
        if (transformHandle.includes("s")) { newH = Math.max(1, sb.h + dy); }
        if (transformHandle.includes("n")) { newY = sb.y + dy; newH = Math.max(1, sb.h - dy); }
        if (shiftHeld) {
          const aspect = sb.w / sb.h;
          if (transformHandle === "n" || transformHandle === "s") { newW = newH * aspect; newX = sb.x + (sb.w - newW) / 2; }
          else if (transformHandle === "e" || transformHandle === "w") { newH = newW / aspect; newY = sb.y + (sb.h - newH) / 2; }
          else { const avg = (Math.abs(dx) + Math.abs(dy)) / 2; newW = sb.w + (dx > 0 ? avg : -avg); newH = newW / aspect; newX = transformHandle.includes("w") ? sb.x + sb.w - newW : sb.x; newY = transformHandle.includes("n") ? sb.y + sb.h - newH : sb.y; }
        }
        // Move strokes to new bbox position
        const moveDx = newX - sb.x;
        const moveDy = newY - sb.y;
        if (moveDx !== 0 || moveDy !== 0) moveStrokes(moveDx, moveDy);
        if (newW !== sb.w || newH !== sb.h) resizeSelected(newW, newH);
      }
      return;
    }

    if (tool === "select" && marqueeStart) {
      marqueeEnd = { x: e.clientX, y: e.clientY };
      return;
    }

    if (tool === "select" && selectDragStart && selectedIds.size > 0) {
      const dx = (e.clientX - selectDragStart.x) / zoom;
      const dy = (e.clientY - selectDragStart.y) / zoom;
      const layer = getActiveLayer();
      for (const id of selectedIds) {
        const s = layer.strokes.find(st => st.id === id);
        if (!s) continue;
        if (s.shapeType) {
          s.sx! += dx; s.sy! += dy; s.ex! += dx; s.ey! += dy;
        } else {
          for (const p of s.points) { p.x += dx; p.y += dy; }
          if (s.d) {
            s.d = s.d.replace(/([ML])(-?[\d.]+),(-?[\d.]+)/g, (_, cmd, x, y) => {
              return `${cmd}${(parseFloat(x) + dx).toFixed(1)},${(parseFloat(y) + dy).toFixed(1)}`;
            });
          }
        }
      }
      selectDragStart = { x: e.clientX, y: e.clientY };
      layers = [...layers];
      return;
    }

    if (!drawing || !currentStroke) return;

    const raw = snapToGrid(pt);
    const stabilized = smoothing > 0 ? stabilizer.add(raw) : raw;
    currentPoints.push(stabilized);

    const isShape = ["line", "rect", "ellipse", "arrow", "triangle"].includes(tool);
    if (isShape) {
      if (shiftHeld) {
        const dx = stabilized.x - currentStroke.sx!;
        const dy = stabilized.y - currentStroke.sy!;
        const maxD = Math.max(Math.abs(dx), Math.abs(dy));
        currentStroke.ex = currentStroke.sx! + Math.sign(dx) * maxD;
        currentStroke.ey = currentStroke.sy! + Math.sign(dy) * maxD;
      } else {
        currentStroke.ex = stabilized.x;
        currentStroke.ey = stabilized.y;
      }
      currentStroke.points = [...currentPoints];
    } else if (tool === "pencil") {
      currentStroke.points = [...currentPoints];
      currentPencilPaths = generatePencilPaths(currentPoints, hardness, scatter);
      currentStroke.d = currentPencilPaths[0];
    } else {
      currentStroke.points = [...currentPoints];
      currentStroke.d = smoothPath(minDistFilter(currentPoints, 1.5), 0.5);
      currentVWPath = variableWidthPath(currentPoints, lineWidth, activePreset);
    }
  }

  function pointerUp(_e: PointerEvent) {
    if (panning) { panning = false; return; }
    if (transformHandle) {
      transformHandle = null;
      return;
    }
    if (tool === "select") {
      if (marqueeStart && marqueeEnd) {
        const svgRect = svgEl.getBoundingClientRect();
        const x1 = (Math.min(marqueeStart.x, marqueeEnd.x) - svgRect.left) / zoom;
        const y1 = (Math.min(marqueeStart.y, marqueeEnd.y) - svgRect.top) / zoom;
        const x2 = (Math.max(marqueeStart.x, marqueeEnd.x) - svgRect.left) / zoom;
        const y2 = (Math.max(marqueeStart.y, marqueeEnd.y) - svgRect.top) / zoom;
        if (x2 - x1 > 3 || y2 - y1 > 3) {
          const layer = getActiveLayer();
          for (const s of layer.strokes) {
            const bbox = getStrokeBBox(s);
            if (!bbox) continue;
            if (bbox.x < x2 && bbox.x + bbox.w > x1 && bbox.y < y2 && bbox.y + bbox.h > y1) {
              selectedIds.add(s.id);
            }
          }
          selectedIds = selectedIds;
          selectionVersion++;
          if (selectedIds.size > 0 && rightPanel !== "selection") rightPanel = "selection";
        }
        marqueeStart = null;
        marqueeEnd = null;
      }
      selectDragStart = null;
      selectDragOffsets = new Map();
      return;
    }
    if (!drawing || !currentStroke) return;
    drawing = false;

    if (currentPoints.length < 2 && !currentStroke.shapeType) return;

    if (currentStroke.tool === "pencil") {
      currentStroke.pencilPaths = generatePencilPaths(currentPoints, hardness, scatter);
    }
    if (!currentStroke.shapeType) {
      currentStroke.variableWidthPath = variableWidthPath(currentPoints, lineWidth, activePreset);
    }

    const layer = layers.find(l => l.id === currentStroke!.layerId) ?? getActiveLayer();
    layer.strokes = [...layer.strokes, currentStroke];
    pushHistory({ action: "stroke", layerId: layer.id, strokes: [currentStroke] });
    layers = [...layers];

    currentStroke = null;
    currentPoints = [];
    currentPencilPaths = [];
    currentVWPath = "";
  }

  function commitText() {
    if (!textEditing || !textEditContent.trim()) { textEditing = false; return; }
    const s: Stroke = {
      id: uid(), tool: "text", color: fgColor, baseWidth: lineWidth,
      opacity: opacity / 100, fill: false,
      points: [{ x: textEditX, y: textEditY, pressure: 0.5, time: performance.now() }],
      text: textEditContent, fontSize, fontFamily, fontWeight, fontStyle, textAlign,
      layerId: getActiveLayer().id,
    };
    getActiveLayer().strokes = [...getActiveLayer().strokes, s];
    pushHistory({ action: "stroke", layerId: getActiveLayer().id, strokes: [s] });
    layers = [...layers];
    textEditing = false;
    textEditContent = "";
  }

  function onTextKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") { textEditing = false; textEditContent = ""; }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitText(); }
  }

  // ── Eyedropper ──────────────────────────────────────────────────────
  function pickColor(e: PointerEvent) {
    if (!svgEl) return;
    const rect = svgEl.getBoundingClientRect();
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0);
      const px = Math.round((e.clientX - rect.left) / rect.width * w);
      const py = Math.round((e.clientY - rect.top) / rect.height * h);
      const data = ctx.getImageData(px, py, 1, 1).data;
      fgColor = `#${[data[0], data[1], data[2]].map(v => v.toString(16).padStart(2, "0")).join("")}`;
      tool = "brush";
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(renderSvgString(true))));
  }

  // ── Render stroke to SVG ────────────────────────────────────────────
  function renderStroke(s: Stroke, isPreview: boolean): string {
    const op = isPreview ? 0.5 : s.opacity;
    const artFilter = s.tool === "chalk" ? ' filter="url(#chalk-filter)"' : "";
    const sidAttr = isPreview ? "" : ` data-sid="${s.id}" style="cursor:pointer"`;

    if (s.imageData && s.points[0]) {
      const x = s.points[0].x;
      const y = s.points[0].y;
      const iw = s.imageW ?? 100;
      const ih = s.imageH ?? 100;
      return `<g${sidAttr}><image href="${s.imageData}" x="${x}" y="${y}" width="${iw}" height="${ih}" opacity="${op}"/></g>`;
    }

    let inner = "";
    if (s.shapeType) {
      const a = shapeAttrs(s);
      const sw = s.baseWidth;
      switch (s.shapeType) {
        case "line":
          inner = `<line x1="${a.x1}" y1="${a.y1}" x2="${a.x2}" y2="${a.y2}" stroke="${s.color}" stroke-width="${sw}" stroke-linecap="round" opacity="${op}"/>`;
          break;
        case "rect":
          inner = `<rect x="${a.x}" y="${a.y}" width="${a.width}" height="${a.height}" fill="${s.fill ? s.color : 'none'}" stroke="${s.fill ? 'none' : s.color}" stroke-width="${sw}" opacity="${op}" rx="1"/>`;
          break;
        case "ellipse":
          inner = `<ellipse cx="${a.cx}" cy="${a.cy}" rx="${a.rx}" ry="${a.ry}" fill="${s.fill ? s.color : 'none'}" stroke="${s.fill ? 'none' : s.color}" stroke-width="${sw}" opacity="${op}"/>`;
          break;
        case "arrow":
          inner = `<line x1="${a.x1}" y1="${a.y1}" x2="${a.x2}" y2="${a.y2}" stroke="${s.color}" stroke-width="${sw}" stroke-linecap="butt" opacity="${op}"/><polygon points="${a.tipX},${a.tipY} ${a.headX1},${a.headY1} ${a.headX2},${a.headY2}" fill="${s.color}" opacity="${op}" stroke-linejoin="round"/>`;
          break;
        case "triangle":
          inner = `<polygon points="${a.points}" fill="${s.fill ? s.color : 'none'}" stroke="${s.fill ? 'none' : s.color}" stroke-width="${sw}" stroke-linejoin="round" opacity="${op}"/>`;
          break;
      }
    } else if (s.text) {
      const anchor = s.textAlign === "center" ? "middle" : s.textAlign === "right" ? "end" : "start";
      const lines = s.text.split("\n");
      const lh = (s.fontSize ?? 32) * 1.2;
      let txt = "";
      for (let i = 0; i < lines.length; i++) {
        const escaped = escapeXml(lines[i]);
        txt += `<tspan x="${s.points[0]?.x}" dy="${i === 0 ? 0 : lh}">${escaped}</tspan>`;
      }
      inner = `<text x="${s.points[0]?.x}" y="${s.points[0]?.y}" fill="${s.color}" font-size="${s.fontSize ?? 32}" font-family="${s.fontFamily ?? 'sans-serif'}" font-weight="${s.fontWeight ?? '400'}" font-style="${s.fontStyle ?? 'normal'}" text-anchor="${anchor}" opacity="${op}" dominant-baseline="auto">${txt}</text>`;
    } else if (s.variableWidthPath) {
      inner = `<path d="${s.variableWidthPath}" fill="${s.color}" opacity="${op}" fill-rule="nonzero"${artFilter}/>`;
    } else if (s.tool === "pencil") {
      for (const pd of s.pencilPaths ?? []) {
        inner += `<path d="${pd}" fill="none" stroke="${s.color}" stroke-width="${s.baseWidth * 0.35}" stroke-linecap="round" stroke-linejoin="round" opacity="${op * 0.5}"/>`;
      }
      inner += `<path d="${s.d}" fill="none" stroke="${s.color}" stroke-width="${s.baseWidth * 0.3}" stroke-linecap="round" stroke-linejoin="round" opacity="${op}"/>`;
    } else {
      inner = `<path d="${s.d}" fill="none" stroke="${s.color}" stroke-width="${s.baseWidth}" stroke-linecap="round" stroke-linejoin="round" opacity="${op}"${artFilter}/>`;
    }

    return `<g${sidAttr}>${inner}</g>`;
  }

  function isEraserStroke(s: Stroke): boolean {
    return s.tool === "eraser";
  }

  function renderEraserInMask(s: Stroke): string {
    const sw = s.baseWidth;
    const d = s.d || "";
    return `<path d="${d}" fill="none" stroke="black" stroke-width="${sw}" stroke-linecap="round"/>`;
  }

  function renderLayerEraserSvg(layer: Layer): string {
    let out = "";
    for (const s of layer.strokes) {
      if (!isEraserStroke(s)) out += renderStroke(s, false);
    }
    return out;
  }

  function renderSvgString(withBg = false): string {
    const chalkFilter = `<filter id="chalk-filter" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="3" seed="5" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="3" xChannelSelector="R" yChannelSelector="G"/></filter>`;
    let defs = chalkFilter;
    let inner = "";
    for (const layer of layers) {
      if (!layer.visible) continue;
      const erStrokes = layer.strokes.filter(s => isEraserStroke(s));
      const blendMode = layer.blendMode && layer.blendMode !== "normal" ? `mix-blend-mode:${layer.blendMode};` : "";
      if (erStrokes.length > 0) {
        defs += `<mask id="em${layer.id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="white"/>`;
        for (const s of erStrokes) defs += renderEraserInMask(s);
        defs += `</mask>`;
        inner += `<g style="isolation:isolate;${blendMode}" opacity="${layer.opacity / 100}" mask="url(#em${layer.id})">`;
        for (const s of layer.strokes) { if (!isEraserStroke(s)) inner += renderStroke(s, false); }
        inner += "</g>";
      } else {
        inner += `<g style="isolation:isolate;${blendMode}" opacity="${layer.opacity / 100}">`;
        inner += renderLayerEraserSvg(layer);
        inner += "</g>";
      }
    }
    if (currentStroke && !isEraserStroke(currentStroke)) inner += renderStroke(currentStroke, true);
    const bg = withBg ? `<rect width="100%" height="100%" fill="${bgColor2}"/>` : "";
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><defs>${defs}</defs>${bg}${inner}</svg>`;
  }

  // ── Save / Download ─────────────────────────────────────────────────
  let saving = $state(false);
  let saveError = $state<string | null>(null);
  let saveName = $state("drawing.png");
  let saveOk = $state(false);

  async function saveToCloud() {
    if (!svgEl || saving) return;
    saving = true; saveError = null; saveOk = false;
    try {
      const svgData = renderSvgString(true);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      const img = new Image();
      const blob = await new Promise<Blob>((res, rej) => {
        img.onload = () => {
          ctx.drawImage(img, 0, 0);
          canvas.toBlob(b => b ? res(b) : rej(new Error("toBlob failed")), "image/png");
        };
        img.onerror = rej;
        img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
      });
      const fd = new FormData();
      fd.append("file", blob, saveName);
      const up = await fetch("/api/telegram/uploadFile", {
        method: "POST", body: fd,
        headers: { "X-Api-Key": apiKey, "X-File-Request": encodeURIComponent(saveName) },
      });
      if (!up.ok) throw new Error(`Upload failed: ${up.status}`);
      saveOk = true;
      setTimeout(() => saveOk = false, 3000);
    } catch (err: any) {
      saveError = err?.message ?? "Failed to save";
    } finally { saving = false; }
  }

  function downloadPng() {
    const svgData = renderSvgString(true);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0);
      const a = document.createElement("a");
      a.download = saveName;
      a.href = canvas.toDataURL("image/png");
      a.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  }

  function downloadSvg() {
    const svgData = renderSvgString(true);
    const a = document.createElement("a");
    a.download = saveName.replace(/\.png$/i, ".svg");
    a.href = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
    a.click();
  }

  // ── Zoom ────────────────────────────────────────────────────────────
  function zoomAt(delta: number, cx?: number, cy?: number) {
    const old = zoom;
    zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * (1 + delta)));
    if (cx !== undefined && cy !== undefined) {
      panX = cx - (cx - panX) * (zoom / old);
      panY = cy - (cy - panY) * (zoom / old);
    }
  }

  function zoomTo(z: number) {
    const rect = canvasWrap?.getBoundingClientRect();
    if (rect) zoomAt(z / zoom - 1, rect.width / 2, rect.height / 2);
    else zoom = z;
  }

  function fitToScreen() {
    const cw = canvasWrap?.getBoundingClientRect().width;
    const ch = canvasWrap?.getBoundingClientRect().height;
    if (!cw || !ch) return;
    zoom = Math.min((cw - 40) / w, (ch - 40) / h);
    panX = 0; panY = 0;
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const rect = canvasWrap?.getBoundingClientRect();
      if (!rect) return;
      zoomAt(e.deltaY > 0 ? -0.08 : 0.08, e.clientX - rect.left, e.clientY - rect.top);
    } else {
      panX -= e.deltaX;
      panY -= e.deltaY;
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────
  function uid(): string { return Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }

  function getStrokeBBox(s: Stroke): { x: number; y: number; w: number; h: number } | null {
    if (s.imageData && s.points[0]) {
      return { x: s.points[0].x, y: s.points[0].y, w: s.imageW ?? 100, h: s.imageH ?? 100 };
    }
    if (s.shapeType) {
      const x = Math.min(s.sx ?? 0, s.ex ?? 0);
      const y = Math.min(s.sy ?? 0, s.ey ?? 0);
      return { x, y, w: Math.abs((s.ex ?? 0) - (s.sx ?? 0)), h: Math.abs((s.ey ?? 0) - (s.sy ?? 0)) };
    }
    if (s.points.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of s.points) {
      if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
    }
    const hw = s.baseWidth / 2;
    return { x: minX - hw, y: minY - hw, w: maxX - minX + s.baseWidth, h: maxY - minY + s.baseWidth };
  }

  // ── Selection properties ──────────────────────────────────────────
  let lockAspect = $state(true);
  let selectionAspect = $state(1);

  function getSelectedStrokes(): Stroke[] {
    const layer = getActiveLayer();
    return layer.strokes.filter(s => selectedIds.has(s.id));
  }

  function getSelectionBBox(): { x: number; y: number; w: number; h: number } | null {
    const strokes = getSelectedStrokes();
    if (strokes.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of strokes) {
      const b = getStrokeBBox(s);
      if (!b) continue;
      if (b.x < minX) minX = b.x;
      if (b.y < minY) minY = b.y;
      if (b.x + b.w > maxX) maxX = b.x + b.w;
      if (b.y + b.h > maxY) maxY = b.y + b.h;
    }
    if (minX === Infinity) return null;
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  function moveStrokes(dx: number, dy: number) {
    const layer = getActiveLayer();
    for (const id of selectedIds) {
      const s = layer.strokes.find(st => st.id === id);
      if (!s) continue;
      if (s.shapeType) { s.sx! += dx; s.sy! += dy; s.ex! += dx; s.ey! += dy; }
      else { for (const p of s.points) { p.x += dx; p.y += dy; } }
    }
    layers = [...layers];
  }

  function resizeSelected(newW: number, newH: number) {
    const layer = getActiveLayer();
    const bbox = getSelectionBBox();
    if (!bbox || bbox.w === 0 || bbox.h === 0) return;
    const sx = newW / bbox.w;
    const sy = newH / bbox.h;
    for (const id of selectedIds) {
      const s = layer.strokes.find(st => st.id === id);
      if (!s) continue;
      if (s.shapeType) {
        s.sx! = bbox.x + (s.sx! - bbox.x) * sx;
        s.sy! = bbox.y + (s.sy! - bbox.y) * sy;
        s.ex! = bbox.x + (s.ex! - bbox.x) * sx;
        s.ey! = bbox.y + (s.ey! - bbox.y) * sy;
      } else if (s.imageData) {
        s.imageW = (s.imageW ?? 100) * sx;
        s.imageH = (s.imageH ?? 100) * sy;
        for (const p of s.points) {
          p.x = bbox.x + (p.x - bbox.x) * sx;
          p.y = bbox.y + (p.y - bbox.y) * sy;
        }
      } else {
        for (const p of s.points) {
          p.x = bbox.x + (p.x - bbox.x) * sx;
          p.y = bbox.y + (p.y - bbox.y) * sy;
        }
      }
    }
    layers = [...layers];
  }

  // ── Transform handle positions ────────────────────────────────────
  function getTransformHandles(bbox: {x:number;y:number;w:number;h:number}) {
    const cx = bbox.x + bbox.w / 2;
    const cy = bbox.y + bbox.h / 2;
    const handles: {id:string;x:number;y:number;cursor:string}[] = [];
    const corners = [
      { id: "nw", x: bbox.x, y: bbox.y, cursor: "nwse-resize" },
      { id: "ne", x: bbox.x + bbox.w, y: bbox.y, cursor: "nesw-resize" },
      { id: "se", x: bbox.x + bbox.w, y: bbox.y + bbox.h, cursor: "nwse-resize" },
      { id: "sw", x: bbox.x, y: bbox.y + bbox.h, cursor: "nesw-resize" },
    ];
    const edges = [
      { id: "n", x: cx, y: bbox.y, cursor: "ns-resize" },
      { id: "e", x: bbox.x + bbox.w, y: cy, cursor: "ew-resize" },
      { id: "s", x: cx, y: bbox.y + bbox.h, cursor: "ns-resize" },
      { id: "w", x: bbox.x, y: cy, cursor: "ew-resize" },
    ];
    const rotOffset = 22;
    const rotations = [
      { id: "rotate-nw", x: bbox.x - rotOffset, y: bbox.y - rotOffset, cursor: "crosshair" },
      { id: "rotate-ne", x: bbox.x + bbox.w + rotOffset, y: bbox.y - rotOffset, cursor: "crosshair" },
      { id: "rotate-se", x: bbox.x + bbox.w + rotOffset, y: bbox.y + bbox.h + rotOffset, cursor: "crosshair" },
      { id: "rotate-sw", x: bbox.x - rotOffset, y: bbox.y + bbox.h + rotOffset, cursor: "crosshair" },
    ];
    for (const c of corners) handles.push(c);
    for (const e of edges) handles.push(e);
    for (const r of rotations) handles.push(r);
    return { cx, cy, corners, edges, rotations, all: handles };
  }

  function hitTestTransformHandle(e: PointerEvent): string | null {
    if (!showTransformControls || !hasSelection) return null;
    const bbox = getSelectionBBox();
    if (!bbox) return null;
    const svgRect = svgEl.getBoundingClientRect();
    const mx = (e.clientX - svgRect.left) / zoom;
    const my = (e.clientY - svgRect.top) / zoom;
    const th = getTransformHandles(bbox);
    const hitRadius = 8 / zoom;
    for (const h of th.all) {
      const dx = mx - h.x;
      const dy = my - h.y;
      if (Math.sqrt(dx * dx + dy * dy) < hitRadius) return h.id;
    }
    if (mx >= bbox.x && mx <= bbox.x + bbox.w && my >= bbox.y && my <= bbox.y + bbox.h) return "move";
    return null;
  }

  function rotateStrokes(angleDeg: number, cx: number, cy: number) {
    const rad = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const layer = getActiveLayer();
    for (const id of selectedIds) {
      const s = layer.strokes.find(st => st.id === id);
      if (!s) continue;
      if (s.shapeType) {
        const rx1 = cos * (s.sx! - cx) - sin * (s.sy! - cy) + cx;
        const ry1 = sin * (s.sx! - cx) + cos * (s.sy! - cy) + cy;
        const rx2 = cos * (s.ex! - cx) - sin * (s.ey! - cy) + cx;
        const ry2 = sin * (s.ex! - cx) + cos * (s.ey! - cy) + cy;
        s.sx = rx1; s.sy = ry1; s.ex = rx2; s.ey = ry2;
      } else {
        for (const p of s.points) {
          const rx = cos * (p.x - cx) - sin * (p.y - cy) + cx;
          const ry = sin * (p.x - cx) + cos * (p.y - cy) + cy;
          p.x = rx; p.y = ry;
        }
      }
    }
    layers = [...layers];
  }

  function setSelectionOpacity(val: number) {
    const layer = getActiveLayer();
    for (const id of selectedIds) {
      const s = layer.strokes.find(st => st.id === id);
      if (s) s.opacity = val / 100;
    }
    layers = [...layers];
  }

  function setSelectionColor(color: string) {
    const layer = getActiveLayer();
    for (const id of selectedIds) {
      const s = layer.strokes.find(st => st.id === id);
      if (s) s.color = color;
    }
    layers = [...layers];
  }

  function setSelectionFontSize(size: number) {
    const layer = getActiveLayer();
    for (const id of selectedIds) {
      const s = layer.strokes.find(st => st.id === id);
      if (s && s.text !== undefined) s.fontSize = size;
    }
    layers = [...layers];
  }

  function duplicateSelected() {
    const layer = getActiveLayer();
    const newIds: string[] = [];
    for (const id of selectedIds) {
      const s = layer.strokes.find(st => st.id === id);
      if (!s) continue;
      const clone: Stroke = { ...s, id: "dup_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5) };
      if (clone.shapeType) { clone.sx = (clone.sx ?? 0) + 20; clone.sy = (clone.sy ?? 0) + 20; clone.ex = (clone.ex ?? 0) + 20; clone.ey = (clone.ey ?? 0) + 20; }
      else { for (const p of clone.points) { p.x += 20; p.y += 20; } }
      layer.strokes = [...layer.strokes, clone];
      newIds.push(clone.id);
    }
    selectedIds.clear();
    for (const id of newIds) selectedIds.add(id);
    selectedIds = selectedIds;
    selectionVersion++;
    layers = [...layers];
  }

  function deleteSelected() {
    const layer = getActiveLayer();
    const deleted = layer.strokes.filter(s => selectedIds.has(s.id));
    if (deleted.length) {
      pushHistory({ action: "stroke", layerId: layer.id, strokes: deleted });
      layer.strokes = layer.strokes.filter(s => !selectedIds.has(s.id));
      selectedIds.clear(); selectedIds = selectedIds;
      selectionVersion++;
    }
  }

  // ── Keyboard ────────────────────────────────────────────────────────
  function onkeydown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === " ") { e.preventDefault(); spaceHeld = true; return; }
    if (e.ctrlKey || e.metaKey) {
      if (e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if ((e.key === "z" && e.shiftKey) || e.key === "y") { e.preventDefault(); redo(); return; }
      if (e.key === "0") { e.preventDefault(); fitToScreen(); return; }
      if (e.key === "=" || e.key === "+") { e.preventDefault(); zoomTo(Math.min(MAX_ZOOM, zoom * 1.5)); return; }
      if (e.key === "-") { e.preventDefault(); zoomTo(Math.max(MIN_ZOOM, zoom / 1.5)); return; }
      if (e.key === "a") { e.preventDefault(); menuAction("select-all"); return; }
      if (e.key === "d" && !e.shiftKey) { e.preventDefault(); menuAction("deselect"); return; }
      if (e.key === "d" && e.shiftKey) { e.preventDefault(); menuAction("select-inverse"); return; }
      if (e.key === "i" && e.shiftKey) { e.preventDefault(); menuAction("select-inverse"); return; }
      if (e.key === "v") {
        navigator.clipboard.read().then(items => {
          for (const item of items) {
            const imgType = item.types.find(t => t.startsWith('image/'));
            if (!imgType) continue;
            item.getType(imgType).then(blob => {
              const reader = new FileReader();
              reader.onload = () => {
                const dataUrl = reader.result as string;
                const img = new Image();
                img.onload = () => {
                  let iw = img.naturalWidth;
                  let ih = img.naturalHeight;
                  const maxDim = Math.max(w, h) * 0.8;
                  if (iw > maxDim || ih > maxDim) {
                    const scale = maxDim / Math.max(iw, ih);
                    iw *= scale; ih *= scale;
                  }
                  const s: Stroke = {
                    id: "img_" + Date.now().toString(36),
                    tool: "brush",
                    color: "#000000",
                    baseWidth: 0,
                    opacity: 1,
                    fill: false,
                    points: [{ x: (w - iw) / 2, y: (h - ih) / 2, pressure: 0.5, time: performance.now() }],
                    imageData: dataUrl,
                    imageW: iw,
                    imageH: ih,
                    layerId: getActiveLayer().id,
                  };
                  getActiveLayer().strokes = [...getActiveLayer().strokes, s];
                  pushHistory({ action: "stroke", layerId: s.layerId, strokes: [s] });
                  layers = [...layers];
                };
                img.src = dataUrl;
              };
              reader.readAsDataURL(blob);
            });
            break;
          }
        });
        return;
      }
    }
    if (e.key === "Shift") { shiftHeld = true; return; }
    if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.size > 0) {
      e.preventDefault();
      deleteSelected();
      return;
    }
    if (e.key === "Escape") { selectedIds.clear(); selectedIds = selectedIds; selectionVersion = 0; if (rightPanel === "selection") rightPanel = "brush"; return; }
    const key = e.key.toLowerCase();
    for (const g of TOOL_GROUPS) for (const t of g.tools) { if (t.key === key) { tool = t.id as Tool; return; } }
    if (key === "[") { lineWidth = Math.max(0.5, lineWidth - 1); return; }
    if (key === "]") { lineWidth = Math.min(200, lineWidth + 1); return; }
    if (key === "e" && !e.shiftKey) { tool = "eraser"; return; }
    if (key === "x") { swapColors(); return; }
    if (key === "g") { settings.showGrid = !settings.showGrid; return; }
    if (key === "r") { settings.showRulers = !settings.showRulers; return; }
  }

  function onkeyup(e: KeyboardEvent) {
    if (e.key === " ") spaceHeld = false;
    if (e.key === "Shift") shiftHeld = false;
  }

  // ── Init ────────────────────────────────────────────────────────────
  onMount(() => {
    if (!canvasWrap) return;
    const ro = new ResizeObserver(() => { fitToScreen(); });
    ro.observe(canvasWrap);
    fitToScreen();
    return () => ro.disconnect();
  });

  // ── UI panels ───────────────────────────────────────────────────────
  let rightPanel = $state<"brush" | "color" | "layers" | "selection" | "history" | "channels" | "paths">("brush");
  let topPanelTab = $state<"history" | "color" | "brush">("color");
  let bottomPanelTab = $state<"layers" | "channels" | "paths">("layers");
  let brushCategory = $state<"all" | BrushPreset["category"]>("all");

  let filteredPresets = $derived(
    brushCategory === "all" ? BRUSH_PRESETS : BRUSH_PRESETS.filter(p => p.category === brushCategory)
  );

  // Grid ruler ticks
  let rulerTickStep = $derived(zoom > 2 ? 25 : zoom > 0.8 ? 50 : 100);

  // ── Menu state ──────────────────────────────────────────────────────
  let openMenu = $state<string | null>(null);

  function menuAction(action: string) {
    openMenu = null;
    switch (action) {
      case "new": clearAll(); break;
      case "import": importImage(); break;
      case "save-png": downloadPng(); break;
      case "save-svg": downloadSvg(); break;
      case "save-cloud": openSaveDialog(); break;
      case "undo": undo(); break;
      case "redo": redo(); break;
      case "clear": clearAll(); break;
      case "fit": fitToScreen(); break;
      case "zoom-100": zoomTo(1); break;
      case "zoom-in": zoomTo(Math.min(MAX_ZOOM, zoom * 1.5)); break;
      case "zoom-out": zoomTo(Math.max(MIN_ZOOM, zoom / 1.5)); break;
      case "grid": settings.showGrid = !settings.showGrid; break;
      case "rulers": settings.showRulers = !settings.showRulers; break;
      case "resize": openResizeDialog(); break;
      case "flip-h": break;
      case "flip-v": break;
      case "select-all": {
        const layer = getActiveLayer();
        selectedIds.clear();
        for (const s of layer.strokes) selectedIds.add(s.id);
        selectedIds = selectedIds;
        selectionVersion++;
        if (selectedIds.size > 0) rightPanel = "selection";
        break;
      }
      case "deselect": {
        selectedIds.clear();
        selectedIds = selectedIds;
        selectionVersion = 0;
        break;
      }
      case "select-inverse": {
        const layer = getActiveLayer();
        const newSet = new Set<string>();
        for (const s of layer.strokes) { if (!selectedIds.has(s.id)) newSet.add(s.id); }
        selectedIds = newSet;
        selectionVersion++;
        break;
      }
      case "toggle-history": rightPanel = rightPanel === "history" ? "brush" : "history"; break;
      case "toggle-color": rightPanel = rightPanel === "color" ? "brush" : "color"; break;
      case "toggle-brush": rightPanel = rightPanel === "brush" ? "layers" : "brush"; break;
      case "show-layers": rightPanel = "layers"; break;
    }
  }

  // ── Ruler actions ───────────────────────────────────────────────────
  function rulerHAction(canvas: HTMLCanvasElement, params: { zoom: number; panX: number; w: number }) {
    function draw(p = params) {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = globalThis.devicePixelRatio || 1;
      const cw = canvas.parentElement?.offsetWidth ?? 800;
      const ch = 20;
      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
      canvas.style.width = cw + "px";
      canvas.style.height = ch + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);
      ctx.fillStyle = "#26262a";
      ctx.fillRect(0, 0, cw, ch);
      const svgRect = svgEl?.getBoundingClientRect();
      const wrapRect = canvasWrap?.getBoundingClientRect();
      if (!svgRect || !wrapRect) return;
      const svgLeft = svgRect.left - wrapRect.left + p.panX;
      const step = p.zoom > 2 ? 25 : p.zoom > 0.8 ? 50 : 100;
      ctx.fillStyle = "#555";
      ctx.font = "9px monospace";
      ctx.strokeStyle = "#444";
      ctx.lineWidth = 0.5;
      for (let px = svgLeft % (step * p.zoom); px < cw; px += step * p.zoom) {
        const val = Math.round((px - svgLeft) / p.zoom);
        if (val >= 0 && val <= p.w) {
          ctx.beginPath();
          ctx.moveTo(px, ch - 6);
          ctx.lineTo(px, ch);
          ctx.stroke();
          ctx.fillText(val.toString(), px + 2, ch - 7);
        }
      }
      ctx.strokeStyle = "#555";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(cw, 0);
      ctx.stroke();
    }
    draw();
    return {
      update(next: { zoom: number; panX: number; w: number }) {
        params = next;
        draw(next);
      },
      destroy() {},
    };
  }

  function rulerVAction(canvas: HTMLCanvasElement, params: { zoom: number; panY: number; h: number }) {
    function draw(p = params) {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = globalThis.devicePixelRatio || 1;
      const cw = 20;
      const ch = canvas.parentElement?.offsetHeight ?? 600;
      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
      canvas.style.width = cw + "px";
      canvas.style.height = ch + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);
      ctx.fillStyle = "#26262a";
      ctx.fillRect(0, 0, cw, ch);
      const svgRect = svgEl?.getBoundingClientRect();
      const wrapRect = canvasWrap?.getBoundingClientRect();
      if (!svgRect || !wrapRect) return;
      const svgTop = svgRect.top - wrapRect.top + p.panY;
      const step = p.zoom > 2 ? 25 : p.zoom > 0.8 ? 50 : 100;
      ctx.fillStyle = "#555";
      ctx.font = "9px monospace";
      ctx.strokeStyle = "#444";
      ctx.lineWidth = 0.5;
      for (let py = svgTop % (step * p.zoom); py < ch; py += step * p.zoom) {
        const val = Math.round((py - svgTop) / p.zoom);
        if (val >= 0 && val <= p.h) {
          ctx.beginPath();
          ctx.moveTo(cw - 6, py);
          ctx.lineTo(cw, py);
          ctx.stroke();
          ctx.save();
          ctx.translate(cw - 7, py + 2);
          ctx.rotate(-Math.PI / 2);
          ctx.fillText(val.toString(), 0, 0);
          ctx.restore();
        }
      }
      ctx.strokeStyle = "#555";
      ctx.beginPath();
      ctx.moveTo(cw, 0);
      ctx.lineTo(cw, ch);
      ctx.stroke();
    }
    draw();
    return {
      update(next: { zoom: number; panY: number; h: number }) {
        params = next;
        draw(next);
      },
      destroy() {},
    };
  }
</script>

<svelte:window onkeydown={onkeydown} onkeyup={onkeyup}/>

<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
<div class="draw-root" role="application" tabindex="-1" onclick={() => { if (openMenu) openMenu = null; }}>
  <!-- ═══ TOP MENU BAR ═══ -->
  <div class="menu-bar">
    {#each [
      { label: "File", items: [
        { label: "New Canvas", action: "new", key: "" },
        { label: "---" },
        { label: "Import Image", action: "import", key: "" },
        { label: "---" },
        { label: "Save PNG", action: "save-png", key: "" },
        { label: "Save SVG", action: "save-svg", key: "" },
        { label: "Save to Cloud", action: "save-cloud", key: "" },
      ]},
      { label: "Edit", items: [
        { label: "Undo", action: "undo", key: "Ctrl+Z" },
        { label: "Redo", action: "redo", key: "Ctrl+Shift+Z" },
        { label: "---" },
        { label: "Clear Layer", action: "clear", key: "" },
      ]},
      { label: "Select", items: [
        { label: "All", action: "select-all", key: "Ctrl+A" },
        { label: "Deselect", action: "deselect", key: "Ctrl+D" },
        { label: "Inverse", action: "select-inverse", key: "Ctrl+Shift+I" },
      ]},
      { label: "View", items: [
        { label: "Fit to Screen", action: "fit", key: "Ctrl+0" },
        { label: "Zoom 100%", action: "zoom-100", key: "" },
        { label: "Zoom In", action: "zoom-in", key: "Ctrl+=" },
        { label: "Zoom Out", action: "zoom-out", key: "Ctrl+-" },
        { label: "---" },
        { label: settings.showGrid ? "✓ Grid" : "  Grid", action: "grid", key: "G" },
        { label: settings.showRulers ? "✓ Rulers" : "  Rulers", action: "rulers", key: "R" },
      ]},
      { label: "Image", items: [
        { label: `Canvas Size: ${w}×${h}`, action: "resize", key: "" },
        { label: "---" },
        { label: "Flip Horizontal", action: "flip-h", key: "" },
        { label: "Flip Vertical", action: "flip-v", key: "" },
      ]},
      { label: "Window", items: [
        { label: rightPanel === "history" ? "✓ History" : "  History", action: "toggle-history", key: "" },
        { label: rightPanel === "color" ? "✓ Color" : "  Color", action: "toggle-color", key: "" },
        { label: rightPanel === "brush" ? "✓ Brush" : "  Brush", action: "toggle-brush", key: "" },
        { label: "  Layers", action: "show-layers", key: "" },
      ]},
      { label: "Help", items: [
        { label: "Shortcuts: B/N/P/E/Shift+E/L/U/O/A/I/G/T", action: "", key: "" },
        { label: "[ / ] = brush size", action: "", key: "" },
        { label: "X = swap colors", action: "", key: "" },
        { label: "Space+drag = pan", action: "", key: "" },
        { label: "Ctrl+scroll = zoom", action: "", key: "" },
      ]},
    ] as menu}
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions a11y_click_events_have_key_events -->
      <div class="mb-item" onclick={(e) => { e.stopPropagation(); openMenu = openMenu === menu.label ? null : menu.label; }}>
        <span class="mb-label">{menu.label}</span>
        {#if openMenu === menu.label}
          <div class="mb-dropdown">
            {#each menu.items as item}
              {#if item.label === "---"}
                <div class="mb-sep"></div>
              {:else}
                <button class="mb-option" onclick={(e) => { e.stopPropagation(); if (item.action) menuAction(item.action); }}>
                  <span>{item.label}</span>
                  {#if item.key}<span class="mb-key">{item.key}</span>{/if}
                </button>
              {/if}
            {/each}
          </div>
        {/if}
      </div>
    {/each}
    <div class="mb-spacer"></div>
    <span class="mb-title">{w}×{h}</span>
    <span class="mb-sep-inline"></span>
    <span class="mb-title">{Math.round(zoom * 100)}%</span>
  </div>

  <div class="main-row">
    <!-- ═══ LEFT TOOLBAR ═══ -->
    <div class="tool-sidebar">
      {#each TOOL_GROUPS as group, gi}
        {#if gi > 0}<div class="ts-sep"></div>{/if}
        {#each group.tools as t}
          <!-- svelte-ignore a11y_consider_explicit_label -->
          <button class="ts-btn" class:active={tool === t.id} onclick={() => tool = t.id as Tool} title={t.label}>
            {#if t.id === "move"}<IconPointer size={16}/>{:else if t.id === "select"}<IconSelector size={16}/>
            {:else if t.id === "brush"}<IconBrush size={16}/>{:else if t.id === "pencil"}<IconPencil size={16}/>
            {:else if t.id === "pen"}<IconPencil size={16}/>{:else if t.id === "eraser"}<IconEraser size={16}/>
            {:else if t.id === "chalk"}<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 13L13 3"/><path d="M11 2l2 2-1 1-2-2z" fill="currentColor" stroke="none"/><path d="M3 13l-1 2 2-1z" fill="currentColor" stroke="none"/></svg>
            {:else if t.id === "line"}<IconMinus size={16}/>{:else if t.id === "rect"}<IconSquare size={16}/>
            {:else if t.id === "ellipse"}<IconCircle size={16}/>{:else if t.id === "arrow"}<IconArrowBadgeRight size={16}/>
            {:else if t.id === "triangle"}<IconTriangle size={16}/>{:else if t.id === "eyedropper"}<IconColorPicker size={16}/>
            {:else if t.id === "fill"}<IconBucketDroplet size={16}/>{:else if t.id === "text"}<IconLetterT size={16}/>
            {/if}
          </button>
        {/each}
      {/each}
      <div class="ts-sep"></div>
      <!-- svelte-ignore a11y_consider_explicit_label -->
      <button class="ts-btn" onclick={undo} disabled={undoStack.length === 0} title="Undo (Ctrl+Z)"><IconArrowBack size={16}/></button>
      <!-- svelte-ignore a11y_consider_explicit_label -->
      <button class="ts-btn" onclick={redo} disabled={redoStack.length === 0} title="Redo (Ctrl+Shift+Z)"><IconArrowForward size={16}/></button>
      <!-- svelte-ignore a11y_consider_explicit_label -->
      <button class="ts-btn" onclick={clearAll} title="Clear layer"><IconTrash size={16}/></button>
      <div class="ts-spacer"></div>
      <!-- svelte-ignore a11y_consider_explicit_label -->
      <button class="ts-swatch ts-fg" style="background:{fgColor}" onclick={() => rightPanel = 'color'} title="Foreground color"></button>
      <!-- svelte-ignore a11y_consider_explicit_label -->
      <button class="ts-swatch ts-bg" style="background:{bgColor2}" onclick={() => rightPanel = 'color'} title="Background color"></button>
      <!-- svelte-ignore a11y_consider_explicit_label -->
      <button class="ts-swap" onclick={swapColors} title="Swap (X)">
        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 3L4 0V2H9V4H4V6L1 3Z" fill="currentColor" transform="rotate(180 5 3)"/></svg>
      </button>
    </div>

    <!-- ═══ CENTER ═══ -->
    <div class="center-area">
      <div class="options-bar">
        <span class="ob-tool">{tool}</span>
        <div class="ob-sep"></div>

        {#if ["brush","pencil","pen","eraser","chalk"].includes(tool)}
          <label class="ob-label">Size
            <input type="range" min="0.5" max="150" step="0.5" bind:value={lineWidth} class="ob-slider"/>
            <span class="ob-val">{lineWidth.toFixed(1)}</span>
          </label>
          <label class="ob-label">Opacity
            <input type="range" min="1" max="100" bind:value={opacity} class="ob-slider"/>
            <span class="ob-val">{opacity}%</span>
          </label>
          <label class="ob-label">Hardness
            <input type="range" min="1" max="100" bind:value={hardness} class="ob-slider"/>
            <span class="ob-val">{hardness}</span>
          </label>
          <label class="ob-label">Smooth
            <input type="range" min="0" max="1" step="0.05" bind:value={smoothing} class="ob-slider"/>
            <span class="ob-val">{Math.round(smoothing*100)}%</span>
          </label>
          <label class="ob-check"><input type="checkbox" bind:checked={pressureSize}/> P→Size</label>
          <label class="ob-check"><input type="checkbox" bind:checked={pressureOpacity}/> P→Opacity</label>
          <div class="ob-spacer"></div>
          <select bind:value={activePresetIdx} class="ob-select" onchange={(e) => { const p = BRUSH_PRESETS[parseInt((e.target as HTMLSelectElement).value)]; if (p) applyPreset(p); }}>
            {#each BRUSH_PRESETS as p, i}
              <option value={i}>{p.icon} {p.name}</option>
            {/each}
          </select>
        {:else if tool === "move"}
          <label class="ob-check"><input type="checkbox" bind:checked={showTransformControls}/> Transform controls</label>
        {:else if tool === "select"}
          <label class="ob-check"><input type="checkbox" bind:checked={showTransformControls}/> Transform controls</label>
          {#if hasSelection}
            <div class="ob-sep"></div>
            <button class="ob-btn" onclick={duplicateSelected}>Duplicate</button>
            <button class="ob-btn" onclick={deleteSelected}>Delete</button>
          {/if}
        {:else if ["line","rect","ellipse","arrow","triangle"].includes(tool)}
          <label class="ob-label">Stroke
            <input type="range" min="0.5" max="50" step="0.5" bind:value={lineWidth} class="ob-slider"/>
            <span class="ob-val">{lineWidth.toFixed(1)}</span>
          </label>
          <label class="ob-label">Opacity
            <input type="range" min="1" max="100" bind:value={opacity} class="ob-slider"/>
            <span class="ob-val">{opacity}%</span>
          </label>
          <label class="ob-check"><input type="checkbox" bind:checked={fillShapes}/> Fill</label>
        {:else if tool === "text"}
          <label class="ob-label">Font
            <select bind:value={fontFamily} class="ob-select">
              {#each FONT_FAMILIES as f}
                <option value={f} style="font-family:{f}">{f}</option>
              {/each}
            </select>
          </label>
          <label class="ob-label">Size
            <input type="range" min="8" max="200" bind:value={fontSize} class="ob-slider"/>
            <span class="ob-val">{fontSize}px</span>
          </label>
          <button class="ob-btn" class:active={fontWeight === "700"} onclick={() => fontWeight = fontWeight === "700" ? "400" : "700"} title="Bold">B</button>
          <button class="ob-btn ob-italic" class:active={fontStyle === "italic"} onclick={() => fontStyle = fontStyle === "italic" ? "normal" : "italic"} title="Italic">I</button>
          <div class="ob-sep"></div>
          <button class="ob-btn" class:active={textAlign === "left"} onclick={() => textAlign = "left"} title="Align left">≡</button>
          <button class="ob-btn" class:active={textAlign === "center"} onclick={() => textAlign = "center"} title="Align center">☰</button>
          <button class="ob-btn" class:active={textAlign === "right"} onclick={() => textAlign = "right"} title="Align right">≡</button>
        {:else if tool === "fill"}
          <label class="ob-label">Tolerance
            <input type="range" min="0" max="100" value="32" class="ob-slider"/>
            <span class="ob-val">32</span>
          </label>
        {/if}

        {#if !["move","select"].includes(tool)}
          <div class="ob-spacer"></div>
          <label class="ob-check ob-right"><input type="checkbox" bind:checked={showTransformControls}/> Transform</label>
        {/if}
      </div>

      <div class="canvas-container">
        {#if settings.showRulers}
          <div class="ruler ruler-h">
            <canvas class="ruler-canvas" use:rulerHAction={{ zoom, panX, w }}></canvas>
          </div>
          <div class="ruler ruler-v">
            <canvas class="ruler-canvas" use:rulerVAction={{ zoom, panY, h }}></canvas>
          </div>
          <div class="ruler-corner"></div>
        {/if}

        <div
          class="canvas-wrap"
          bind:this={canvasWrap}
          onwheel={onWheel}
          class:panning={panning || spaceHeld}
        >
          {#if settings.showGrid}
            <svg class="grid-overlay" viewBox={`0 0 ${w} ${h}`} style="width:{w*zoom}px;height:{h*zoom}px;transform:translate({panX}px,{panY}px)">
              <defs>
                <pattern id="gridSmall" width={rulerTickStep} height={rulerTickStep} patternUnits="userSpaceOnUse">
                  <path d={`M ${rulerTickStep} 0 L 0 0 0 ${rulerTickStep}`} fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="0.5"/>
                </pattern>
                <pattern id="gridLarge" width={rulerTickStep * 2} height={rulerTickStep * 2} patternUnits="userSpaceOnUse">
                  <rect width={rulerTickStep * 2} height={rulerTickStep * 2} fill="url(#gridSmall)"/>
                  <path d={`M ${rulerTickStep * 2} 0 L 0 0 0 ${rulerTickStep * 2}`} fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#gridLarge)"/>
            </svg>
          {/if}

          <svg
            bind:this={svgEl}
            viewBox={`0 0 ${w} ${h}`}
            width={w * zoom}
            height={h * zoom}
            class="draw-svg"
            style="touch-action:none; transform: translate({panX}px, {panY}px)"
            onpointerdown={pointerDown}
            onpointermove={pointerMove}
            onpointerup={pointerUp}
            onpointerenter={() => hovering = true}
            onpointerleave={(e) => { pointerUp(e); hovering = false; }}
          >
            <defs>
              <pattern id="checker" width="16" height="16" patternUnits="userSpaceOnUse">
                <rect width="16" height="16" fill="#2a2a2a"/>
                <rect width="8" height="8" fill="#222"/>
                <rect x="8" y="8" width="8" height="8" fill="#222"/>
              </pattern>
              <filter id="chalk-filter" x="-20%" y="-20%" width="140%" height="140%">
                <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="3" seed="5" result="noise"/>
                <feDisplacementMap in="SourceGraphic" in2="noise" scale="3" xChannelSelector="R" yChannelSelector="G"/>
              </filter>
            </defs>
            <rect width="100%" height="100%" fill={bgColor2}/>
            {#if settings.checkerBg}
              <rect width="100%" height="100%" fill="url(#checker)" opacity="0"/>
            {/if}

            {#each layers as layer (layer.id)}
              {#if layer.visible}
                {@const hasErs = layer.strokes.some(s => isEraserStroke(s))}
                {@const liveEr = currentStroke && isEraserStroke(currentStroke) && currentStroke.layerId === layer.id}
                {#if hasErs || liveEr}
                  <defs>
                    <mask id="m{layer.id}" maskUnits="userSpaceOnUse" x="0" y="0" width="{w}" height="{h}">
                      <rect width="{w}" height="{h}" fill="white"/>
                      {#each layer.strokes.filter(s => isEraserStroke(s)) as s}
                        <path d={s.d} fill="none" stroke="black" stroke-width={s.baseWidth} stroke-linecap="round"/>
                      {/each}
                      {#if liveEr}
                        <path d={currentStroke.d} fill="none" stroke="black" stroke-width={currentStroke.baseWidth} stroke-linecap="round"/>
                      {/if}
                    </mask>
                  </defs>
                  <g style="isolation:isolate;{layer.blendMode && layer.blendMode !== 'normal' ? `mix-blend-mode:${layer.blendMode};` : ''}" opacity={layer.opacity / 100} mask="url(#m{layer.id})">
                    {#each layer.strokes.filter(s => !isEraserStroke(s)) as s (s.id)}
                      {@html renderStroke(s, false)}
                    {/each}
                  </g>
                {:else}
                  <g style="isolation:isolate;{layer.blendMode && layer.blendMode !== 'normal' ? `mix-blend-mode:${layer.blendMode};` : ''}" opacity={layer.opacity / 100}>
                    {@html renderLayerEraserSvg(layer)}
                  </g>
                {/if}
              {/if}
            {/each}

            {#if selectedIds.size > 0 && showTransformControls}
              {@const selBbox = getSelectionBBox()}
              {#if selBbox}
                {@const th = getTransformHandles(selBbox)}
                <g class="transform-group" transform="rotate({selectionRotation}, {th.cx}, {th.cy})">
                  <!-- Bounding box -->
                  <rect x={selBbox.x} y={selBbox.y} width={selBbox.w} height={selBbox.h} fill="none" stroke="#fff" stroke-width={1.5 / zoom} pointer-events="none"/>
                  <rect x={selBbox.x} y={selBbox.y} width={selBbox.w} height={selBbox.h} fill="none" stroke="#4488ff" stroke-width={1 / zoom} stroke-dasharray="{4/zoom} {3/zoom}" pointer-events="none"/>
                  <!-- Edge midpoints -->
                  {#each th.edges as h}
                    <rect x={h.x - 4/zoom} y={h.y - 4/zoom} width={8/zoom} height={8/zoom} fill="#fff" stroke="#4488ff" stroke-width={1/zoom} style="cursor:{h.cursor}" data-handle={h.id}/>
                  {/each}
                  <!-- Corner handles -->
                  {#each th.corners as h}
                    <rect x={h.x - 4/zoom} y={h.y - 4/zoom} width={8/zoom} height={8/zoom} fill="#fff" stroke="#4488ff" stroke-width={1/zoom} style="cursor:{h.cursor}" data-handle={h.id}/>
                  {/each}
                  <!-- Rotation lines + handles -->
                  {#each th.rotations as r, ri}
                    {@const corner = th.corners[ri]}
                    <line x1={corner.x} y1={corner.y} x2={r.x} y2={r.y} stroke="#4488ff" stroke-width={0.75/zoom} pointer-events="none"/>
                    <circle cx={r.x} cy={r.y} r={4/zoom} fill="#fff" stroke="#4488ff" stroke-width={1/zoom} style="cursor:crosshair" data-handle={r.id}/>
                  {/each}
                </g>
              {/if}
            {/if}

            {#if selectedIds.size > 0 && !showTransformControls}
              {@const layer = getActiveLayer()}
              {#each layer.strokes.filter(s => selectedIds.has(s.id)) as s (s.id)}
                {@const bbox = getStrokeBBox(s)}
                {#if bbox}
                  <rect x={bbox.x - 2} y={bbox.y - 2} width={bbox.w + 4} height={bbox.h + 4} fill="none" stroke="#4488ff" stroke-width="1.5" stroke-dasharray="4 3" pointer-events="none"/>
                {/if}
              {/each}
            {/if}

            {#if marqueeStart && marqueeEnd}
              {@const svgRect2 = svgEl.getBoundingClientRect()}
              {@const mx1 = (Math.min(marqueeStart.x, marqueeEnd.x) - svgRect2.left) / zoom}
              {@const my1 = (Math.min(marqueeStart.y, marqueeEnd.y) - svgRect2.top) / zoom}
              {@const mw = Math.abs(marqueeEnd.x - marqueeStart.x) / zoom}
              {@const mh = Math.abs(marqueeEnd.y - marqueeStart.y) / zoom}
              <rect x={mx1} y={my1} width={mw} height={mh} fill="rgba(68,136,255,0.08)" stroke="#4488ff" stroke-width="1" stroke-dasharray="5 3" pointer-events="none"/>
            {/if}

            {#if currentStroke && !isEraserStroke(currentStroke)}
              {@html renderStroke(currentStroke, true)}
            {/if}
          </svg>

          {#if hovering && !panning && svgEl && tool !== "select"}
            {@const svgRect = svgEl.getBoundingClientRect()}
            {@const wrapRect = canvasWrap?.getBoundingClientRect()}
            {#if wrapRect}
              <div
                class="brush-cursor"
                style="
                  left:{cursorScreenX - wrapRect.left}px;
                  top:{cursorScreenY - wrapRect.top}px;
                  width:{lineWidth * zoom}px;
                  height:{lineWidth * zoom}px;
                  border-color:{tool === 'eraser' ? '#ff4444' : 'rgba(255,255,255,0.6)'};
                  opacity:{drawing ? 0.3 : 0.7};
                "
              ></div>
            {/if}
          {/if}

          {#if textEditing}
            <div class="text-editor-overlay" style="left:{textEditScreenX}px;top:{textEditScreenY}px">
              <textarea
                bind:this={textEditEl}
                bind:value={textEditContent}
                onkeydown={onTextKeydown}
                onblur={commitText}
                class="text-editor-input"
                style="font-size:{fontSize * zoom}px;font-family:{fontFamily};font-weight:{fontWeight};font-style:{fontStyle};text-align:{textAlign};color:{fgColor};"
                placeholder="Type here..."
                rows="1"
              ></textarea>
            </div>
          {/if}
        </div>
      </div>

      {#if !fullscreen}
      <div class="status-bar">
        <span>{w}×{h}</span>
        <span class="sb-sep"></span>
        <span>{cursorX}, {cursorY}</span>
        <span class="sb-sep"></span>
        <span>🔍 {Math.round(zoom * 100)}%</span>
        <span class="sb-sep"></span>
        <span>📊 P:{(pressure * 100).toFixed(0)}%</span>
        {#if canvasRotation !== 0}
          <span class="sb-sep"></span>
          <span>↻ {canvasRotation.toFixed(0)}°</span>
        {/if}
        <div class="sb-spacer"></div>
        <button class="sb-btn" onclick={() => zoomTo(1)}>1:1</button>
        <button class="sb-btn" onclick={fitToScreen}>Fit</button>
        <button class="sb-btn" onclick={() => zoomTo(Math.min(MAX_ZOOM, zoom * 2))}>+</button>
        <button class="sb-btn" onclick={() => zoomTo(Math.max(MIN_ZOOM, zoom / 2))}>-</button>
        <!-- svelte-ignore a11y_consider_explicit_label -->
        <button class="sb-btn" class:active={settings.showGrid} onclick={() => settings.showGrid = !settings.showGrid} title="Toggle grid (G)"><IconGridDots size={12}/></button>
        <!-- svelte-ignore a11y_consider_explicit_label -->
        <button class="sb-btn" class:active={settings.showRulers} onclick={() => settings.showRulers = !settings.showRulers} title="Toggle rulers (R)"><IconRuler size={12}/></button>
        <div class="sb-spacer"></div>
        <span class="sb-dim">{layers.reduce((a, l) => a + l.strokes.length, 0)} strokes · {layers.length} layers</span>
        <input class="sb-fname" bind:value={saveName} placeholder="drawing.png"/>
        <button class="sb-btn" onclick={downloadPng}><IconDownload size={11}/> PNG</button>
        <button class="sb-btn" onclick={downloadSvg}><IconDownload size={11}/> SVG</button>
        <button class="sb-btn primary" onclick={saveToCloud} disabled={saving}>
          {#if saving}…{:else}<IconUpload size={11}/> Save{/if}
        </button>
        {#if saveOk}<span class="sb-ok">✓</span>{/if}
        {#if saveError}<span class="sb-err">{saveError}</span>{/if}
      </div>
      {/if}
    </div>

    <!-- ═══ RIGHT PANEL ═══ -->
    <div class="right-panel">
      <!-- ── Top panel group: History | Swatches ── -->
      <div class="rp-panel-group">
        <div class="rp-tabs">
          <button class="rp-tab" class:active={topPanelTab === "history"} onclick={() => topPanelTab = "history"}>History</button>
          <button class="rp-tab" class:active={topPanelTab === "color"} onclick={() => topPanelTab = "color"}>Swatches</button>
          <button class="rp-tab" class:active={topPanelTab === "brush"} onclick={() => topPanelTab = "brush"}>Brush</button>
        </div>
        <div class="rp-panel-body">
          {#if topPanelTab === "history"}
            <div class="rp-history-list">
              {#if undoStack.length === 0 && redoStack.length === 0}
                <p class="rp-empty">No history yet</p>
              {:else}
                {#each [...undoStack].reverse() as entry, i}
                  <div class="rp-history-item">
                    <span class="rp-history-icon">{entry.action === "stroke" ? "✏" : entry.action === "clear" ? "🗑" : "◆"}</span>
                    <span class="rp-history-label">{entry.action === "stroke" ? `Stroke (${entry.strokes.length})` : entry.action === "clear" ? "Clear Layer" : entry.action}</span>
                  </div>
                {/each}
              {/if}
            </div>
          {:else if topPanelTab === "color"}
            <ColorPicker bind:value={fgColor}/>
          {:else if topPanelTab === "brush"}
            <div class="rp-cats">
              {#each ["all","basic","paint","ink","sketch","special"] as cat}
                <button class="rp-cat" class:active={brushCategory === cat} onclick={() => brushCategory = cat as any}>{cat}</button>
              {/each}
            </div>
            <div class="rp-presets">
              {#each filteredPresets as p}
                {@const idx = BRUSH_PRESETS.indexOf(p)}
                <button class="rp-preset" class:active={activePresetIdx === idx} onclick={() => applyPreset(p)}>
                  <span class="rp-pi">{p.icon}</span>
                  <div class="rp-pinfo">
                    <span class="rp-pn">{p.name}</span>
                    <span class="rp-ps">{p.size}px · {p.hardness}%</span>
                  </div>
                </button>
              {/each}
            </div>
            <p class="rp-heading">Advanced</p>
            <label class="rp-slider">Taper<input type="range" min="0" max="1" step="0.05" bind:value={taper}/><span>{Math.round(taper*100)}%</span></label>
            <label class="rp-slider">Angle<input type="range" min="-90" max="90" bind:value={brushAngle}/><span>{brushAngle}°</span></label>
            <label class="rp-slider">Scatter<input type="range" min="0" max="3" step="0.1" bind:value={scatter}/><span>{scatter.toFixed(1)}</span></label>
          {/if}
        </div>
      </div>

      <div class="rp-divider"></div>

      <!-- ── Selection properties (contextual) ── -->
      {#if hasSelection}
        <div class="rp-section">
          <div class="rp-section-header" onclick={() => {}}>
            <span class="rp-section-title">Selection</span>
          </div>
          {@const selStrokes = getSelectedStrokes()}
          {@const bbox = getSelectionBBox()}
          <div class="rp-section-body">
            {#if selStrokes.length > 0 && bbox}
              <div class="rp-heading">Position</div>
              <div class="sel-row">
                <label class="sel-field">X
                  <input type="number" value={Math.round(bbox.x)} onchange={(e) => {
                    const val = parseFloat((e.target as HTMLInputElement).value);
                    if (!isNaN(val)) moveStrokes(val - bbox.x, 0);
                  }}/>
                </label>
                <label class="sel-field">Y
                  <input type="number" value={Math.round(bbox.y)} onchange={(e) => {
                    const val = parseFloat((e.target as HTMLInputElement).value);
                    if (!isNaN(val)) moveStrokes(0, val - bbox.y);
                  }}/>
                </label>
              </div>
              <div class="rp-heading">Size</div>
              <div class="sel-row">
                <label class="sel-field">W
                  <input type="number" min="1" value={Math.round(bbox.w)} onchange={(e) => {
                    const val = parseFloat((e.target as HTMLInputElement).value);
                    if (!isNaN(val) && val > 0) {
                      const cur = getSelectionBBox();
                      if (!cur) return;
                      if (lockAspect && cur.h > 0) { resizeSelected(val, val * (cur.h / cur.w)); }
                      else { resizeSelected(val, cur.h); }
                    }
                  }}/>
                </label>
                <label class="sel-field">H
                  <input type="number" min="1" value={Math.round(bbox.h)} onchange={(e) => {
                    const val = parseFloat((e.target as HTMLInputElement).value);
                    if (!isNaN(val) && val > 0) {
                      const cur = getSelectionBBox();
                      if (!cur) return;
                      if (lockAspect && cur.w > 0) { resizeSelected(cur.w * (val / cur.h), val); }
                      else { resizeSelected(cur.w, val); }
                    }
                  }}/>
                </label>
                <button class="sel-lock" class:active={lockAspect} onclick={() => lockAspect = !lockAspect} title="Lock aspect ratio">
                  {#if lockAspect}<IconLock size={14}/>{:else}<IconLockOpen size={14}/>{/if}
                </button>
              </div>
              <div class="rp-heading">Appearance</div>
              <label class="sel-field sel-full">Opacity
                <input type="range" min="1" max="100" value={Math.round((selStrokes[0]?.opacity ?? 1) * 100)} oninput={(e) => setSelectionOpacity(parseInt((e.target as HTMLInputElement).value))}/>
                <span>{Math.round((selStrokes[0]?.opacity ?? 1) * 100)}%</span>
              </label>
              {#if selStrokes.every(s => s.tool !== "eraser" && !s.imageData)}
                <label class="sel-field sel-full">Color
                  <input type="color" value={selStrokes[0]?.color ?? "#000000"} oninput={(e) => setSelectionColor((e.target as HTMLInputElement).value)}/>
                </label>
              {/if}
              <div class="sel-actions">
                <button class="sel-btn" onclick={duplicateSelected}>Duplicate</button>
                <button class="sel-btn danger" onclick={deleteSelected}>Delete</button>
              </div>
            {:else}
              <p class="sel-empty">Select an object to edit</p>
            {/if}
          </div>
        </div>
        <div class="rp-divider"></div>
      {/if}

      <!-- ── Bottom panel group: Layers | Channels | Paths ── -->
      <div class="rp-panel-group rp-bottom-panel">
        <div class="rp-tabs">
          <button class="rp-tab" class:active={bottomPanelTab === "layers"} onclick={() => bottomPanelTab = "layers"}>Layers</button>
          <button class="rp-tab" class:active={bottomPanelTab === "channels"} onclick={() => bottomPanelTab = "channels"}>Channels</button>
          <button class="rp-tab" class:active={bottomPanelTab === "paths"} onclick={() => bottomPanelTab = "paths"}>Paths</button>
        </div>
        <div class="rp-panel-body rp-layers-body">
          {#if bottomPanelTab === "layers"}
            <!-- Layer controls row -->
            <div class="rp-layer-controls">
              <select bind:value={layers[activeLayerIdx].blendMode} class="rp-blend-select" onchange={() => layers = [...layers]}>
                {#each ["normal","multiply","screen","overlay","darken","lighten"] as mode}
                  <option value={mode}>{mode.charAt(0).toUpperCase() + mode.slice(1)}</option>
                {/each}
              </select>
              <label class="rp-layer-opacity-label">Opacity
                <input type="range" min="0" max="100" bind:value={layers[activeLayerIdx].opacity} class="rp-small-slider"/>
                <span class="rp-layer-opacity-val">{layers[activeLayerIdx].opacity}%</span>
              </label>
            </div>
            <div class="rp-layer-controls">
              <span class="rp-lock-label">Lock:</span>
              <button class="rp-lock-btn" title="Lock transparent pixels">▦</button>
              <button class="rp-lock-btn" title="Lock image pixels">🖌</button>
              <button class="rp-lock-btn" title="Lock position">✥</button>
              <button class="rp-lock-btn" title="Lock all">🔒</button>
              <label class="rp-fill-label">Fill
                <input type="range" min="0" max="100" value="100" class="rp-small-slider"/>
                <span>100%</span>
              </label>
            </div>
            <!-- Layer list -->
            {#each [...layers].reverse() as layer, ri (layer.id)}
              {@const idx = layers.length - 1 - ri}
              <div class="rp-layer" class:active={idx === activeLayerIdx} onclick={() => activeLayerIdx = idx} role="button" tabindex="-1">
                <button class="rp-lvis" onclick={(e) => { e.stopPropagation(); layer.visible = !layer.visible; layers = [...layers]; }}>
                  {layer.visible ? "👁" : "—"}
                </button>
                <div class="rp-lthumb" style="background:{layer.strokes.length > 0 ? '#2a2a3e' : '#1a1a26'}"></div>
                <span class="rp-lname">{layer.name}</span>
                <span class="rp-lcount">{layer.strokes.length}</span>
              </div>
            {/each}
            <!-- Layer actions bar -->
            <div class="rp-layer-actions-bar">
              <button class="rp-layer-btn" onclick={addLayer} title="Add layer">+</button>
              <button class="rp-layer-btn" onclick={() => {}} title="Add layer mask">◻</button>
              <button class="rp-layer-btn" onclick={() => {}} title="Add layer group">◻◻</button>
              <button class="rp-layer-btn" onclick={moveLayerUp} disabled={activeLayerIdx >= layers.length - 1} title="Move up">↑</button>
              <button class="rp-layer-btn" onclick={moveLayerDown} disabled={activeLayerIdx <= 0} title="Move down">↓</button>
              <div class="rp-layer-actions-spacer"></div>
              <button class="rp-layer-btn rp-layer-btn-danger" onclick={removeLayer} disabled={layers.length <= 1} title="Delete layer">🗑</button>
            </div>
          {:else if bottomPanelTab === "channels"}
            <div class="rp-channel"><span class="rp-ch-dot" style="background:#ff4444"></span> Red <span class="rp-ch-shortcut">Ctrl+1</span></div>
            <div class="rp-channel"><span class="rp-ch-dot" style="background:#44ff44"></span> Green <span class="rp-ch-shortcut">Ctrl+2</span></div>
            <div class="rp-channel"><span class="rp-ch-dot" style="background:#4444ff"></span> Blue <span class="rp-ch-shortcut">Ctrl+3</span></div>
            <div class="rp-channel rp-channel-active"><span class="rp-ch-dot" style="background:#fff"></span> RGB <span class="rp-ch-shortcut">Ctrl+~</span></div>
          {:else if bottomPanelTab === "paths"}
            <p class="rp-empty">No paths</p>
          {/if}
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .draw-root { display: flex; flex-direction: column; height: 100%; width: 100%; overflow: hidden; background: #1a1a2e; user-select: none; }

  .menu-bar { display: flex; align-items: center; background: #16161e; border-bottom: 1px solid #2a2a35; height: 24px; flex-shrink: 0; padding: 0 4px; }
  .mb-item { position: relative; padding: 2px 7px; font-size: 11px; color: #8888a0; cursor: pointer; border-radius: 3px; transition: .1s; }
  .mb-item:hover { background: #2a2a3a; color: #e0e0f0; }
  .mb-dropdown {
    position: absolute; top: 100%; left: 0; z-index: 100;
    background: #1e1e2a; border: 1px solid #3a3a4a; border-radius: 6px;
    padding: 4px 0; min-width: 200px;
    box-shadow: 0 8px 32px rgba(0,0,0,.6);
  }
  .mb-option {
    display: flex; align-items: center; justify-content: space-between;
    width: 100%; padding: 5px 12px; border: none; background: none;
    color: #b0b0c0; font-size: 11px; cursor: pointer; text-align: left;
    font-family: 'Geist', sans-serif;
  }
  .mb-option:hover { background: #5050c0; color: #fff; }
  .mb-key { font-size: 10px; color: #555; font-family: 'Geist Mono', monospace; }
  .mb-option:hover .mb-key { color: rgba(255,255,255,.6); }
  .mb-sep { height: 1px; background: #3a3a4a; margin: 3px 8px; }
  .mb-spacer { flex: 1; }
  .mb-title { font-size: 10px; color: #555; font-family: 'Geist Mono', monospace; }
  .mb-sep-inline { width: 1px; height: 12px; background: #3a3a4a; margin: 0 6px; }

  .main-row { display: flex; flex: 1; overflow: hidden; min-height: 0; }

  .tool-sidebar { display: flex; flex-direction: column; align-items: center; width: 36px; background: #16161e; border-right: 1px solid #2a2a35; padding: 4px 0; gap: 1px; flex-shrink: 0; }
  .ts-sep { width: 20px; height: 1px; background: #2a2a35; margin: 3px 0; }
  .ts-btn { display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 4px; background: none; border: none; color: #666680; cursor: pointer; transition: .1s; }
  .ts-btn:hover { background: #2a2a3a; color: #b0b0d0; }
  .ts-btn.active { background: #5050c0; color: #fff; }
  .ts-btn:disabled { opacity: .15; cursor: default; }
  .ts-spacer { flex: 1; }
  .ts-swatch { width: 20px; height: 20px; border-radius: 3px; border: 2px solid #444460; cursor: pointer; position: relative; overflow: hidden; }
  .ts-fg { margin-top: 4px; z-index: 2; }
  .ts-bg { width: 14px; height: 14px; margin-top: -5px; margin-left: 9px; z-index: 1; }
  .ts-swap { background: none; border: none; color: #444460; cursor: pointer; padding: 2px; margin-top: 2px; }
  .ts-swap:hover { color: #8888a0; }

  .center-area { flex: 1; display: flex; flex-direction: column; min-width: 0; overflow: hidden; }

  .options-bar { display: flex; align-items: center; gap: 8px; padding: 2px 10px; background: #1c1c28; border-bottom: 1px solid #2a2a35; min-height: 28px; flex-shrink: 0; overflow-x: auto; }
  .ob-tool { font-size: 10px; font-weight: 700; color: #666680; text-transform: uppercase; letter-spacing: .06em; min-width: 50px; }
  .ob-sep { width: 1px; height: 14px; background: #2a2a35; flex-shrink: 0; }
  .ob-label { display: flex; align-items: center; gap: 3px; font-size: 10px; color: #555570; white-space: nowrap; }
  .ob-slider { width: 52px; height: 3px; accent-color: #5050c0; }
  .ob-val { font-family: 'Geist Mono', monospace; font-size: 9px; color: #444460; min-width: 24px; }
  .ob-check { display: flex; align-items: center; gap: 3px; font-size: 10px; color: #555570; cursor: pointer; white-space: nowrap; }
  .ob-check input { accent-color: #5050c0; width: 12px; height: 12px; }
  .ob-spacer { flex: 1; }
  .ob-presets { display: flex; gap: 2px; }
  .ob-preset { width: 22px; height: 22px; border-radius: 3px; border: 1px solid #3a3a4a; background: #1e1e2a; color: #8888a0; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: .1s; }
  .ob-preset:hover { border-color: #5050c0; color: #e0e0f0; }
  .ob-preset.active { border-color: #5050c0; background: #2a2a3e; color: #e0e0f0; }
  .ob-btn { display: flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 3px; border: 1px solid #3a3a4a; background: #1e1e2a; color: #8888a0; font-size: 11px; font-weight: 600; cursor: pointer; transition: .1s; flex-shrink: 0; }
  .ob-btn:hover { border-color: #5050c0; color: #e0e0f0; }
  .ob-btn.active { border-color: #5050c0; background: #5050c0; color: #fff; }
  .ob-italic { font-style: italic; }
  .ob-select { background: #12121a; border: 1px solid #3a3a4a; border-radius: 3px; padding: 2px 4px; color: #b0b0c0; font-size: 10px; font-family: 'Geist', sans-serif; outline: none; max-width: 120px; }
  .ob-select:focus { border-color: #5050c0; }

  .canvas-container { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-height: 0; position: relative; }
  .ruler { background: #1c1c28; overflow: hidden; flex-shrink: 0; }
  .ruler-h { height: 20px; width: 100%; }
  .ruler-v { position: absolute; left: 0; top: 20px; bottom: 0; width: 20px; z-index: 2; }
  .ruler-corner { position: absolute; left: 0; top: 0; width: 20px; height: 20px; background: #1c1c28; border-right: 1px solid #2a2a35; border-bottom: 1px solid #2a2a35; z-index: 3; }
  .ruler-canvas { width: 100%; height: 100%; display: block; }

  .canvas-wrap { flex: 1; overflow: hidden; position: relative; background: #12121a; min-height: 0; display: flex; align-items: center; justify-content: center; isolation: isolate; }
  .canvas-wrap.panning { cursor: grab !important; }
  .draw-svg { display: block; box-shadow: 0 0 0 1px rgba(255,255,255,.03), 0 4px 24px rgba(0,0,0,.6); cursor: crosshair; flex-shrink: 0; position: relative; z-index: 2; }
  .grid-overlay { position: absolute; pointer-events: none; z-index: 1; }

  .brush-cursor { position: absolute; pointer-events: none; border: 1.5px solid; border-radius: 50%; transform: translate(-50%, -50%); z-index: 9999; mix-blend-mode: normal; isolation: isolate; will-change: transform; transition: width .05s, height .05s, opacity .15s; }

  .text-editor-overlay { position: absolute; z-index: 20; pointer-events: auto; transform: translate(0, 0); }
  .text-editor-input {
    min-width: 180px; min-height: 36px; padding: 6px 8px;
    background: transparent; border: 1px dashed rgba(80, 80, 192, 0.5);
    border-radius: 4px; outline: none; resize: both; color: inherit;
    line-height: 1.2; box-shadow: none;
  }

  .status-bar { display: flex; align-items: center; gap: 5px; padding: 2px 10px; background: #16161e; border-top: 1px solid #2a2a35; font-size: 10px; color: #444460; font-family: 'Geist Mono', monospace; min-height: 22px; flex-shrink: 0; }
  .sb-sep { width: 1px; height: 10px; background: #2a2a35; }
  .sb-spacer { flex: 1; }
  .sb-btn { display: flex; align-items: center; gap: 2px; padding: 2px 5px; border-radius: 3px; background: #1e1e2a; border: 1px solid #2a2a35; color: #555570; font-size: 9px; cursor: pointer; font-family: 'Geist Mono', monospace; transition: .1s; }
  .sb-btn:hover { border-color: #5050c0; color: #b0b0d0; }
  .sb-btn.active { border-color: #5050c0; color: #5050c0; background: #1e1e30; }
  .sb-btn.primary { background: #5050c0; border-color: #5050c0; color: #fff; font-weight: 600; }
  .sb-btn.primary:hover { opacity: .85; }
  .sb-btn.primary:disabled { opacity: .4; cursor: not-allowed; }
  .sb-fname { background: #12121a; border: 1px solid #2a2a35; border-radius: 3px; padding: 1px 5px; color: #666680; font-size: 9px; font-family: 'Geist Mono', monospace; width: 90px; outline: none; }
  .sb-fname:focus { border-color: #5050c0; }
  .sb-dim { color: #333350; }
  .sb-ok { color: #4ade80; }
  .sb-err { color: #f87171; }

  /* ── Right panel (Photoshop-style stacked sections) ── */
  .right-panel { width: 220px; flex-shrink: 0; background: #16161e; border-left: 1px solid #2a2a35; display: flex; flex-direction: column; overflow: hidden; }
  .rp-divider { height: 1px; background: #2a2a35; flex-shrink: 0; }
  .rp-section { display: flex; flex-direction: column; flex-shrink: 0; }
  .rp-color-section .rp-section-body { max-height: 200px; overflow-y: auto; }
  .rp-layers-section { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
  .rp-section-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 5px 8px; background: #1a1a26; cursor: pointer;
    border-bottom: 1px solid #2a2a35; user-select: none;
  }
  .rp-section-header:hover { background: #1e1e2c; }
  .rp-section-title { font-size: 10px; font-weight: 700; color: #8888a0; text-transform: uppercase; letter-spacing: .06em; }
  .rp-section-chevron { font-size: 9px; color: #444460; transition: transform .15s; }
  .rp-section-chevron.open { transform: rotate(0deg); }
  .rp-section-body { flex: 1; overflow-y: auto; padding: 6px; display: flex; flex-direction: column; gap: 3px; min-height: 0; }
  .rp-layers-body { flex: 1; overflow-y: auto; }

  .rp-heading { font-size: 9px; font-weight: 700; color: #3a3a50; text-transform: uppercase; letter-spacing: .08em; margin: 4px 0 2px; }
  .rp-heading:first-child { margin-top: 0; }

  .rp-cats { display: flex; flex-wrap: wrap; gap: 2px; margin-bottom: 3px; }
  .rp-cat { padding: 2px 5px; border-radius: 3px; background: #1e1e2a; border: 1px solid #2a2a35; color: #555570; font-size: 9px; cursor: pointer; text-transform: capitalize; transition: .1s; }
  .rp-cat:hover { border-color: #444460; color: #8888a0; }
  .rp-cat.active { border-color: #5050c0; color: #e0e0f0; background: #2a2a3e; }

  .rp-presets { display: flex; flex-direction: column; gap: 2px; max-height: 200px; overflow-y: auto; }
  .rp-preset { display: flex; align-items: center; gap: 5px; padding: 4px 5px; border-radius: 4px; background: #1e1e2a; border: 1px solid #2a2a35; color: #8888a0; cursor: pointer; font-size: 10px; transition: .1s; text-align: left; }
  .rp-preset:hover { border-color: #444460; background: #22222e; }
  .rp-preset.active { border-color: #5050c0; background: #2a2a3e; color: #e0e0f0; }
  .rp-pi { font-size: 13px; width: 16px; text-align: center; flex-shrink: 0; }
  .rp-pinfo { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .rp-pn { font-weight: 600; font-size: 10px; }
  .rp-ps { font-size: 9px; color: #444460; font-family: 'Geist Mono', monospace; }

  .rp-slider { display: flex; align-items: center; gap: 4px; font-size: 10px; color: #555570; }
  .rp-slider input[type="range"] { flex: 1; accent-color: #5050c0; height: 3px; }
  .rp-slider span { font-size: 9px; color: #444460; font-family: 'Geist Mono', monospace; min-width: 28px; text-align: right; }

  .rp-layer-actions { display: flex; gap: 2px; }
  .rp-layer-btn { width: 20px; height: 20px; border-radius: 3px; background: #1e1e2a; border: 1px solid #2a2a35; color: #666680; font-size: 10px; cursor: pointer; transition: .1s; display: flex; align-items: center; justify-content: center; }
  .rp-layer-btn:hover { border-color: #5050c0; color: #b0b0d0; }
  .rp-layer-btn:disabled { opacity: .2; cursor: default; }
  .rp-layer { display: flex; align-items: center; gap: 5px; padding: 4px 5px; border-radius: 4px; background: #1e1e2a; border: 1px solid #2a2a35; color: #8888a0; cursor: pointer; font-size: 10px; transition: .1s; }
  .rp-layer:hover { border-color: #444460; }
  .rp-layer.active { border-color: #5050c0; background: #2a2a3e; color: #e0e0f0; }
  .rp-lvis { background: none; border: none; font-size: 11px; cursor: pointer; padding: 0; color: inherit; width: 18px; text-align: center; }
  .rp-lname { flex: 1; }
  .rp-lcount { font-size: 9px; color: #333350; }
  .rp-lay-opacity { padding: 2px 0; }

  .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.7); display: flex; align-items: center; justify-content: center; z-index: 9999; }
  .modal-box { background: #1e1e2a; border: 1px solid #3a3a4a; border-radius: 8px; padding: 16px; min-width: 300px; max-width: 400px; box-shadow: 0 12px 48px rgba(0,0,0,.6); }
  .modal-title { font-size: 13px; font-weight: 600; color: #e0e0f0; margin-bottom: 12px; }
  .modal-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .modal-row label { font-size: 11px; color: #8888a0; min-width: 60px; }
  .modal-row input[type="text"],
  .modal-row input[type="number"] { flex: 1; background: #12121a; border: 1px solid #3a3a4a; border-radius: 4px; padding: 4px 8px; color: #b0b0c0; font-size: 12px; font-family: 'Geist Mono', monospace; outline: none; }
  .modal-row input:focus { border-color: #5050c0; }
  .modal-check { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #8888a0; margin-bottom: 8px; }
  .modal-check input { accent-color: #5050c0; }
  .modal-actions { display: flex; justify-content: flex-end; gap: 6px; margin-top: 14px; }
  .modal-btn { padding: 5px 14px; border-radius: 4px; border: 1px solid #3a3a4a; background: #16161e; color: #8888a0; font-size: 11px; cursor: pointer; transition: .1s; }
  .modal-btn:hover { border-color: #5050c0; color: #e0e0f0; }
  .modal-btn.primary { background: #5050c0; border-color: #5050c0; color: #fff; font-weight: 600; }
  .modal-btn.primary:hover { opacity: .85; }

  .sel-row { display: flex; align-items: center; gap: 6px; padding: 0 4px; margin-bottom: 4px; }
  .sel-field { display: flex; flex-direction: column; gap: 2px; font-size: 10px; color: #555570; flex: 1; }
  .sel-field input[type="number"] { width: 100%; background: #12121a; border: 1px solid #3a3a4a; border-radius: 3px; padding: 3px 5px; color: #b0b0c0; font-size: 11px; font-family: 'Geist Mono', monospace; outline: none; }
  .sel-field input[type="number"]:focus { border-color: #5050c0; }
  .sel-field input[type="range"] { width: 100%; accent-color: #5050c0; }
  .sel-field input[type="color"] { width: 100%; height: 22px; border: 1px solid #3a3a4a; border-radius: 3px; background: #12121a; cursor: pointer; padding: 1px; }
  .sel-field span { font-size: 10px; color: #444460; font-family: 'Geist Mono', monospace; }
  .sel-full { padding: 0 4px; margin-bottom: 4px; }
  .sel-lock { width: 24px; height: 24px; border-radius: 4px; border: 1px solid #3a3a4a; background: #16161e; color: #8888a0; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: .1s; }
  .sel-lock:hover { border-color: #5050c0; color: #e0e0f0; }
  .sel-lock.active { border-color: #5050c0; color: #5050c0; background: rgba(80,80,192,.15); }
  .sel-actions { display: flex; gap: 4px; padding: 4px; }
  .sel-btn { flex: 1; padding: 4px 0; border-radius: 4px; border: 1px solid #3a3a4a; background: #16161e; color: #8888a0; font-size: 11px; cursor: pointer; transition: .1s; }
  .sel-btn:hover { border-color: #5050c0; color: #e0e0f0; }
  .sel-btn.danger { border-color: #443; }
  .sel-btn.danger:hover { border-color: #f44; color: #f44; background: rgba(255,68,68,.1); }
  .sel-empty { padding: 12px 4px; font-size: 11px; color: #444460; text-align: center; }

  /* ── Tabbed panel groups ── */
  .rp-panel-group { display: flex; flex-direction: column; flex-shrink: 0; }
  .rp-bottom-panel { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
  .rp-tabs { display: flex; background: #12121a; border-bottom: 1px solid #2a2a35; flex-shrink: 0; }
  .rp-tab { flex: 1; padding: 4px 0; background: none; border: none; border-bottom: 2px solid transparent; color: #555570; font-size: 10px; font-weight: 600; cursor: pointer; transition: .15s; font-family: 'Geist', sans-serif; }
  .rp-tab:hover { color: #8888a0; background: rgba(255,255,255,.02); }
  .rp-tab.active { color: #e0e0f0; border-bottom-color: #5050c0; background: rgba(80,80,192,.08); }
  .rp-panel-body { flex: 1; overflow-y: auto; padding: 6px; display: flex; flex-direction: column; gap: 3px; min-height: 0; }

  /* ── History panel ── */
  .rp-history-list { display: flex; flex-direction: column; gap: 1px; }
  .rp-history-item { display: flex; align-items: center; gap: 6px; padding: 3px 5px; border-radius: 3px; font-size: 10px; color: #8888a0; cursor: default; transition: .1s; }
  .rp-history-item:hover { background: #1e1e2c; }
  .rp-history-icon { font-size: 11px; width: 16px; text-align: center; flex-shrink: 0; }
  .rp-history-label { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rp-empty { padding: 16px 4px; font-size: 11px; color: #333350; text-align: center; }

  /* ── Layer controls (blend mode, opacity, lock, fill) ── */
  .rp-layer-controls { display: flex; align-items: center; gap: 4px; padding: 3px 2px; flex-shrink: 0; }
  .rp-blend-select { flex: 1; background: #12121a; border: 1px solid #2a2a35; border-radius: 3px; padding: 2px 4px; color: #b0b0c0; font-size: 10px; font-family: 'Geist', sans-serif; outline: none; }
  .rp-blend-select:focus { border-color: #5050c0; }
  .rp-layer-opacity-label { display: flex; align-items: center; gap: 3px; font-size: 9px; color: #555570; }
  .rp-layer-opacity-val { font-size: 9px; color: #444460; font-family: 'Geist Mono', monospace; min-width: 28px; text-align: right; }
  .rp-small-slider { width: 50px; height: 3px; accent-color: #5050c0; }
  .rp-lock-label { font-size: 9px; color: #555570; margin-right: 2px; }
  .rp-lock-btn { width: 18px; height: 18px; border-radius: 2px; background: #1e1e2a; border: 1px solid #2a2a35; color: #555570; font-size: 9px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: .1s; }
  .rp-lock-btn:hover { border-color: #5050c0; color: #8888a0; }
  .rp-fill-label { display: flex; align-items: center; gap: 3px; font-size: 9px; color: #555570; margin-left: auto; }
  .rp-fill-label span { font-size: 9px; color: #444460; font-family: 'Geist Mono', monospace; min-width: 28px; }

  /* ── Layer thumbnails ── */
  .rp-lthumb { width: 28px; height: 20px; border-radius: 2px; border: 1px solid #2a2a35; flex-shrink: 0; }

  /* ── Layer actions bar ── */
  .rp-layer-actions-bar { display: flex; align-items: center; gap: 2px; padding: 4px 2px; border-top: 1px solid #2a2a35; flex-shrink: 0; }
  .rp-layer-actions-spacer { flex: 1; }
  .rp-layer-btn-danger:hover { border-color: #f44 !important; color: #f44 !important; background: rgba(255,68,68,.1) !important; }

  /* ── Channels panel ── */
  .rp-channel { display: flex; align-items: center; gap: 6px; padding: 4px 5px; border-radius: 3px; font-size: 10px; color: #8888a0; cursor: pointer; transition: .1s; }
  .rp-channel:hover { background: #1e1e2c; }
  .rp-channel-active { background: #2a2a3e; color: #e0e0f0; }
  .rp-ch-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .rp-ch-shortcut { margin-left: auto; font-size: 9px; color: #333350; font-family: 'Geist Mono', monospace; }

  /* ── Options bar enhancements ── */
  .ob-right { margin-left: auto; }

  /* ── Transform group cursor ── */
  .transform-group { pointer-events: all; }
</style>

<input bind:this={fileInputEl} type="file" accept="image/*" style="display:none" onchange={handleImageFile}/>

{#if showResizeDialog}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="modal-overlay" onclick={() => showResizeDialog = false}>
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions a11y_no_noninteractive_element_interactions -->
    <div class="modal-box" onclick={(e) => e.stopPropagation()}>
      <div class="modal-title">Resize Canvas</div>
      <div class="modal-row">
        <!-- svelte-ignore a11y_label_has_associated_control -->
        <label>Width</label>
        <input type="number" min="1" max="8192" bind:value={resizeW}/>
      </div>
      <div class="modal-row">
        <!-- svelte-ignore a11y_label_has_associated_control -->
        <label>Height</label>
        <input type="number" min="1" max="8192" bind:value={resizeH}/>
      </div>
      <label class="modal-check">
        <input type="checkbox" bind:checked={resizeScale}/> Scale strokes proportionally
      </label>
      <div class="modal-actions">
        <button class="modal-btn" onclick={() => showResizeDialog = false}>Cancel</button>
        <button class="modal-btn primary" onclick={applyResize}>Apply</button>
      </div>
    </div>
  </div>
{/if}

{#if showSaveDialog}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="modal-overlay" onclick={() => showSaveDialog = false}>
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions a11y_no_noninteractive_element_interactions -->
    <div class="modal-box" onclick={(e) => e.stopPropagation()}>
      <div class="modal-title">Save to Cloud</div>
      <div class="modal-row">
        <!-- svelte-ignore a11y_label_has_associated_control -->
        <label>Folder</label>
        <input type="text" bind:value={saveFolder} placeholder="(root)"/>
      </div>
      <div class="modal-row">
        <!-- svelte-ignore a11y_label_has_associated_control -->
        <label>File name</label>
        <input type="text" bind:value={saveFileName} placeholder="drawing.png"/>
      </div>
      <div class="modal-actions">
        <button class="modal-btn" onclick={() => showSaveDialog = false}>Cancel</button>
        <button class="modal-btn primary" onclick={confirmSaveToCloud} disabled={saving || !saveFileName.trim()}>
          {#if saving}Saving…{:else}Save{/if}
        </button>
      </div>
    </div>
  </div>
{/if}
