/// <reference lib="webworker" />
/*
 * Minecraft Java worldgen worker.
 * Biome sampling and structure viability come from the cubiomes engine
 * (MIT, https://github.com/Cubitect/cubiomes) compiled to WebAssembly.
 * The wasm bundle is served from /mc/seed_engine.js + /mc/seed_engine.wasm.
 */

import { STRUCTURES, findStructures, type StructureId } from './structures';
import type { BiomeRequest, EngineScanRequest } from './engine.types';

type EngineModule = {
  HEAP32: Int32Array;
  HEAPU8: Uint8Array;
  _malloc(size: number): number;
  _free(ptr: number): void;
  getValue(ptr: number, type: string): number;
  stringToUTF8(str: string, ptr: number, maxBytes: number): void;
  UTF8ToString(ptr: number, len?: number): string;
  _wasm_create(mc: number, dim: number, lo: number, hi: number): number;
  _wasm_destroy(handle: number): void;
  _wasm_ctx_generate_biomes(
    handle: number,
    x: number,
    z: number,
    width: number,
    height: number,
    scale: number,
    y: number,
    ptr: number,
  ): number;
  _wasm_ctx_structure_viable(handle: number, type: number, x: number, z: number): number;
  _wasm_structure_pos(
    type: number,
    mc: number,
    lo: number,
    hi: number,
    rx: number,
    rz: number,
    out: number,
  ): number;
  _wasm_structure_region_size(type: number, mc: number): number;
  _wasm_structure_type_count(): number;
  _wasm_structure_name_length(type: number): number;
  _wasm_structure_name_ptr(type: number): number;
  _wasm_biome_colors(ptr: number): number;
  _wasm_version_newest(): number;
  _wasm_version_from_string(ptr: number): number;
};

type ScanMessage = EngineScanRequest & { id: number };

const CUBIOMES_STRUCTURE: Partial<Record<StructureId, string>> = {
  village: 'village',
  desert_pyramid: 'desert_pyramid',
  jungle_temple: 'jungle_pyramid',
  witch_hut: 'swamp_hut',
  igloo: 'igloo',
  monument: 'monument',
  mansion: 'mansion',
  outpost: 'pillager_outpost',
  ocean_ruin: 'ocean_ruin',
  shipwreck: 'shipwreck',
  ruined_portal: 'ruined_portal',
  ancient_city: 'ancient_city',
  trail_ruins: 'trail_ruins',
  trial_chambers: 'trial_chambers',
  treasure: 'buried_treasure',
  ruined_portal_nether: 'ruined_portal_nether',
  fortress: 'fortress',
  bastion: 'bastion_remnant',
  end_city: 'end_city',
};

const ENGINE_URL = '/mc/seed_engine.js';

let modPromise: Promise<EngineModule> | null = null;
let mod: EngineModule | null = null;
let palette: Uint32Array | null = null;
let structureTypes: Record<string, number> = {};
let ctxHandle = 0;
let ctxKey = '';
const versionCache = new Map<string, number>();

async function loadEngine(): Promise<EngineModule> {
  if (mod) return mod;
  if (!modPromise) {
    modPromise = import(/* @vite-ignore */ ENGINE_URL).then(
      (m: { default: () => Promise<EngineModule> }) => m.default(),
    );
  }
  mod = await modPromise;

  const count = mod._wasm_structure_type_count();
  for (let i = 0; i < count; i++) {
    const len = mod._wasm_structure_name_length(i);
    if (len <= 0) continue;
    const name = mod.UTF8ToString(mod._wasm_structure_name_ptr(i), len);
    if (name && !(name in structureTypes)) structureTypes[name] = i;
  }

  const ptr = mod._malloc(768);
  try {
    if (mod._wasm_biome_colors(ptr) === 0) {
      const rgb = new Uint8Array(mod.HEAPU8.buffer, ptr, 768);
      palette = new Uint32Array(256);
      for (let id = 0; id < 256; id++) {
        const r = rgb[id * 3];
        const g = rgb[id * 3 + 1];
        const b = rgb[id * 3 + 2];
        palette[id] = (255 << 24) | (b << 16) | (g << 8) | r;
      }
    }
  } finally {
    mod._free(ptr);
  }

  return mod;
}

function versionEnum(label: string): number {
  if (!mod) return 0;
  if (label === 'newest') return mod._wasm_version_newest();
  const cached = versionCache.get(label);
  if (cached !== undefined) return cached;
  const ptr = mod._malloc(32);
  let value = -1;
  try {
    mod.stringToUTF8(label, ptr, 32);
    value = mod._wasm_version_from_string(ptr);
  } finally {
    mod._free(ptr);
  }
  if (value < 0) value = mod._wasm_version_newest();
  versionCache.set(label, value);
  return value;
}

/** Mirror of cubiomesVersionKey in the main thread. */
function versionKey(mc: number): string {
  if (mc >= 1211) return 'newest';
  if (mc >= 120) return '1.20';
  if (mc >= 1193) return '1.19.4';
  if (mc >= 119) return '1.19.2';
  if (mc >= 118) return '1.18';
  if (mc >= 117) return '1.17';
  if (mc >= 116) return '1.16';
  if (mc >= 115) return '1.15';
  if (mc >= 114) return '1.14';
  if (mc >= 113) return '1.13';
  if (mc >= 112) return '1.12';
  return '1.12';
}

function ensureContext(mcEnum: number, dim: number, lo: number, hi: number) {
  if (!mod) throw new Error('engine not loaded');
  const key = `${mcEnum}|${dim}|${lo}|${hi}`;
  if (key === ctxKey && ctxHandle) return ctxHandle;
  if (ctxHandle) mod._wasm_destroy(ctxHandle);
  ctxHandle = mod._wasm_create(mcEnum, dim, lo, hi);
  ctxKey = key;
  if (!ctxHandle) throw new Error('engine context allocation failed');
  return ctxHandle;
}

function generateBiomes(req: BiomeRequest): Uint32Array {
  if (!mod || !palette) throw new Error('engine not loaded');
  const count = req.width * req.height;
  const ptr = mod._malloc(count * 4);
  if (!ptr) throw new Error('biome buffer allocation failed');
  try {
    const rc = mod._wasm_ctx_generate_biomes(
      ctxHandle,
      req.x,
      req.z,
      req.width,
      req.height,
      req.scale,
      63,
      ptr,
    );
    if (rc !== 0) throw new Error(`generateBiomes failed: ${rc}`);
    const ids = new Int32Array(mod.HEAP32.buffer, ptr, count);
    const rgba = new Uint32Array(count);
    const fallback = palette[0] ?? 0xff000000;
    for (let i = 0; i < count; i++) {
      const id = ids[i];
      rgba[i] = id >= 0 && id < 256 ? palette[id] || fallback : fallback;
    }
    return rgba;
  } finally {
    mod._free(ptr);
  }
}

function scanStructures(msg: ScanMessage, mcEnum: number, lo: number, hi: number) {
  if (!mod) throw new Error('engine not loaded');
  const out: { id: StructureId; label: string; dim: string; x: number; z: number; index?: number }[] = [];
  const seen = new Set<string>();
  const posPtr = mod._malloc(8);
  const r2 = msg.radius * msg.radius;

  try {
    for (const id of msg.structures) {
      const info = STRUCTURES[id];
      if (!info) continue;

      if (id === 'stronghold') {
        const seed = (BigInt(hi) << 32n) | BigInt(lo);
        const spots = findStructures({
          edition: 'java',
          mc: msg.mc,
          seed,
          centerX: msg.cx,
          centerZ: msg.cz,
          radius: msg.radius,
          structures: ['stronghold'],
        });
        for (const s of spots) out.push({ id, label: info.label, dim: info.dim, x: s.x, z: s.z, index: s.index });
        continue;
      }

      const typeName = CUBIOMES_STRUCTURE[id];
      const type = typeName ? structureTypes[typeName] : undefined;
      if (type === undefined) continue;
      const regionSize = mod._wasm_structure_region_size(type, mcEnum);
      if (!regionSize) continue;

      const regionBlocks = regionSize * 16;
      const minRx = Math.floor((msg.cx - msg.radius) / regionBlocks) - 1;
      const maxRx = Math.floor((msg.cx + msg.radius) / regionBlocks) + 1;
      const minRz = Math.floor((msg.cz - msg.radius) / regionBlocks) - 1;
      const maxRz = Math.floor((msg.cz + msg.radius) / regionBlocks) + 1;

      for (let rx = minRx; rx <= maxRx; rx++) {
        for (let rz = minRz; rz <= maxRz; rz++) {
          if (!mod._wasm_structure_pos(type, mcEnum, lo, hi, rx, rz, posPtr)) continue;
          const x = mod.getValue(posPtr, 'i32');
          const z = mod.getValue(posPtr + 4, 'i32');
          const dx = x - msg.cx;
          const dz = z - msg.cz;
          if (dx * dx + dz * dz > r2) continue;
          if (mod._wasm_ctx_structure_viable(ctxHandle, type, x, z) === 0) continue;
          const key = `${id}:${x}:${z}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({ id, label: info.label, dim: info.dim, x, z });
        }
      }
    }
  } finally {
    mod._free(posPtr);
  }

  return out;
}

async function handleScan(msg: ScanMessage) {
  await loadEngine();
  const mcEnum = versionEnum(versionKey(msg.mc));
  ensureContext(mcEnum, msg.dim, msg.seedLo, msg.seedHi);

  let biomePixels: ArrayBuffer | null = null;
  let biomeMeta: BiomeRequest | null = null;
  if (msg.biome && msg.biome.width > 1 && msg.biome.height > 1) {
    const rgba = generateBiomes(msg.biome);
    biomePixels = rgba.buffer;
    biomeMeta = { ...msg.biome };
  }

  const spots = scanStructures(msg, mcEnum, msg.seedLo, msg.seedHi);
  (self as unknown as Worker).postMessage(
    { id: msg.id, ok: true, spots, biomePixels, biomeMeta },
    biomePixels ? [biomePixels] : [],
  );
}

self.onmessage = async (event: MessageEvent<ScanMessage>) => {
  const msg = event.data;
  try {
    await handleScan(msg);
  } catch (error) {
    (self as unknown as Worker).postMessage({
      id: msg.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export {};
