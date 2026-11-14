import type { StructureId, StructureSpot } from './structures';

/** A biome snapshot request in cubiomes sample-space coordinates. */
export interface BiomeRequest {
  x: number;
  z: number;
  width: number;
  height: number;
  /** blocks per sample: 4, 16, 64, 256 or 1024 */
  scale: number;
}

export interface EngineScanRequest {
  edition: 'java' | 'bedrock';
  seedLo: number;
  seedHi: number;
  /** our internal version number (1211, 120, 1193, ...) */
  mc: number;
  dim: -1 | 0 | 1;
  cx: number;
  cz: number;
  radius: number;
  structures: StructureId[];
  biome: BiomeRequest | null;
}

export interface EngineScanResult {
  spots: StructureSpot[];
  biomePixels: ArrayBuffer | null;
  biomeMeta: BiomeRequest | null;
}
