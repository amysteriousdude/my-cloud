// hello there, tf u doing on my code????
// Structure placement for Java + Bedrock. Ported from vanilla behaviour via cubiomes / cubiomes-bedrock.
// Positions are placement candidates: biome/terrain checks are NOT done (see UI note).

import { JavaRandom, BedrockRandom } from './rng';

export type Edition = 'java' | 'bedrock';
export type Dimension = 'overworld' | 'nether' | 'end';

export type StructureId =
  | 'village'
  | 'desert_pyramid'
  | 'jungle_temple'
  | 'witch_hut'
  | 'igloo'
  | 'monument'
  | 'mansion'
  | 'outpost'
  | 'ocean_ruin'
  | 'shipwreck'
  | 'ruined_portal'
  | 'ruined_portal_nether'
  | 'ancient_city'
  | 'trail_ruins'
  | 'trial_chambers'
  | 'treasure'
  | 'fortress'
  | 'bastion'
  | 'end_city'
  | 'stronghold';

export interface StructureInfo {
  label: string;
  dim: Dimension;
}

export const STRUCTURES: Record<StructureId, StructureInfo> = {
  village: { label: 'Village', dim: 'overworld' },
  desert_pyramid: { label: 'Desert Pyramid', dim: 'overworld' },
  jungle_temple: { label: 'Jungle Temple', dim: 'overworld' },
  witch_hut: { label: 'Witch Hut', dim: 'overworld' },
  igloo: { label: 'Igloo', dim: 'overworld' },
  monument: { label: 'Ocean Monument', dim: 'overworld' },
  mansion: { label: 'Woodland Mansion', dim: 'overworld' },
  outpost: { label: 'Pillager Outpost', dim: 'overworld' },
  ocean_ruin: { label: 'Ocean Ruin', dim: 'overworld' },
  shipwreck: { label: 'Shipwreck', dim: 'overworld' },
  ruined_portal: { label: 'Ruined Portal', dim: 'overworld' },
  ancient_city: { label: 'Ancient City', dim: 'overworld' },
  trail_ruins: { label: 'Trail Ruins', dim: 'overworld' },
  trial_chambers: { label: 'Trial Chambers', dim: 'overworld' },
  treasure: { label: 'Buried Treasure', dim: 'overworld' },
  ruined_portal_nether: { label: 'Ruined Portal (Nether)', dim: 'nether' },
  fortress: { label: 'Nether Fortress', dim: 'nether' },
  bastion: { label: 'Bastion Remnant', dim: 'nether' },
  end_city: { label: 'End City', dim: 'end' },
  stronghold: { label: 'Stronghold', dim: 'overworld' },
};

export interface JavaVersion {
  mc: number;
  label: string;
}
export interface BedrockVersion {
  mc: number;
  label: string;
}

// cubiomes-style version ordinals
export const JAVA_VERSIONS: JavaVersion[] = [
  { mc: 1211, label: '1.21+ (latest)' },
  { mc: 120, label: '1.19.3 – 1.20' },
  { mc: 118, label: '1.18 – 1.19.2' },
  { mc: 117, label: '1.16 – 1.17' },
  { mc: 115, label: '1.14 – 1.15' },
  { mc: 113, label: '1.13' },
  { mc: 112, label: '1.9 – 1.12' },
];

export const BEDROCK_VERSIONS: BedrockVersion[] = [
  { mc: 118, label: '1.18+ (latest)' },
  { mc: 117, label: '1.17' },
  { mc: 116, label: '1.16' },
  { mc: 111, label: '1.11 – 1.15' },
];

const RA = 341873128712n;
const RB = 132897987541n;
const BA = 2570712328; // 341873128712 mod 2^32
const BB = 4048968661; // 132897987541 mod 2^32

function javaRegionSeed(seed: bigint, rx: number, rz: number, salt: number): bigint {
  return BigInt.asUintN(64, seed + BigInt(rx) * RA + BigInt(rz) * RB + BigInt(salt));
}

function bedrockRegionSeed(seed: bigint, rx: number, rz: number, salt: number): number {
  const low = Number(BigInt.asUintN(32, seed));
  return (Math.imul(rx, BA) + Math.imul(rz, BB) + low + salt) >>> 0;
}

type Kind =
  | 'feature'
  | 'large'
  | 'large_end'
  | 'outpost_java'
  | 'treasure_java'
  | 'fortress_legacy_java'
  | 'fortress_java_117'
  | 'bastion_java_pre'
  | 'fortress_java_118'
  | 'bastion_java_118'
  | 'feature_bedrock'
  | 'large_bedrock'
  | 'outpost_bedrock'
  | 'feature_java_bedrock'
  | 'fortress_bedrock'
  | 'bastion_bedrock'
  | 'fortress_bedrock_legacy'
  | 'stronghold_java'
  | 'stronghold_bedrock';

interface Conf {
  salt: number;
  spacing: number;
  cr: number;
  kind: Kind;
}

function javaConf(mc: number, id: StructureId): Conf | null {
  switch (id) {
    case 'village':
      return { salt: 10387312, spacing: mc >= 118 ? 34 : 32, cr: mc >= 118 ? 26 : 24, kind: 'feature' };
    case 'desert_pyramid':
      return { salt: 14357617, spacing: 32, cr: 24, kind: 'feature' };
    case 'jungle_temple':
      return { salt: mc <= 112 ? 14357617 : 14357619, spacing: 32, cr: 24, kind: 'feature' };
    case 'witch_hut':
      return { salt: mc <= 112 ? 14357617 : 14357620, spacing: 32, cr: 24, kind: 'feature' };
    case 'igloo':
      return mc < 109 ? null : { salt: mc <= 112 ? 14357617 : 14357618, spacing: 32, cr: 24, kind: 'feature' };
    case 'monument':
      return mc < 108 ? null : { salt: 10387313, spacing: 32, cr: 27, kind: 'large' };
    case 'mansion':
      return mc < 111 ? null : { salt: 10387319, spacing: 80, cr: 60, kind: 'large' };
    case 'outpost':
      return mc < 114 ? null : { salt: 165745296, spacing: 32, cr: 24, kind: 'outpost_java' };
    case 'ocean_ruin':
      return mc < 113
        ? null
        : { salt: 14357621, spacing: mc <= 115 ? 16 : 20, cr: mc <= 115 ? 8 : 12, kind: 'feature' };
    case 'shipwreck':
      return mc < 113
        ? null
        : { salt: 165745295, spacing: mc <= 115 ? 16 : 24, cr: mc <= 115 ? 8 : 20, kind: 'feature' };
    case 'ruined_portal':
      return mc < 116 ? null : { salt: 34222645, spacing: 40, cr: 25, kind: 'feature' };
    case 'ruined_portal_nether':
      return mc < 116
        ? null
        : {
            salt: 34222645,
            spacing: mc <= 117 ? 25 : 40,
            cr: mc <= 117 ? 15 : 25,
            kind: 'feature',
          };
    case 'ancient_city':
      return mc < 1192 ? null : { salt: 20083232, spacing: 24, cr: 16, kind: 'feature' };
    case 'trail_ruins':
      return mc < 120 ? null : { salt: 83469867, spacing: 34, cr: 26, kind: 'feature' };
    case 'trial_chambers':
      return mc < 1211 ? null : { salt: 94251327, spacing: 34, cr: 22, kind: 'feature' };
    case 'treasure':
      return mc < 113 ? null : { salt: 10387320, spacing: 1, cr: 1, kind: 'treasure_java' };
    case 'fortress':
      return mc >= 118
        ? { salt: 30084232, spacing: 27, cr: 23, kind: 'fortress_java_118' }
        : mc >= 116
          ? { salt: 30084232, spacing: 27, cr: 23, kind: 'fortress_java_117' }
          : { salt: 0, spacing: 16, cr: 8, kind: 'fortress_legacy_java' };
    case 'bastion':
      return mc < 116
        ? null
        : mc >= 118
          ? { salt: 30084232, spacing: 27, cr: 23, kind: 'bastion_java_118' }
          : { salt: 30084232, spacing: 27, cr: 23, kind: 'bastion_java_pre' };
    case 'end_city':
      return mc < 109 ? null : { salt: 10387313, spacing: 20, cr: 9, kind: 'large_end' };
    case 'stronghold':
      return { salt: 0, spacing: 0, cr: 0, kind: 'stronghold_java' };
    default:
      return null;
  }
}

function bedrockConf(mc: number, id: StructureId): Conf | null {
  switch (id) {
    case 'village':
      return mc < 111
        ? null
        : { salt: 10387312, spacing: mc >= 118 ? 34 : 27, cr: mc >= 118 ? 26 : 17, kind: 'large_bedrock' };
    case 'desert_pyramid':
    case 'jungle_temple':
    case 'witch_hut':
    case 'igloo':
      return { salt: 14357617, spacing: 32, cr: 24, kind: 'feature_bedrock' };
    case 'monument':
      return { salt: 10387313, spacing: 32, cr: 27, kind: 'large_bedrock' };
    case 'mansion':
      return { salt: 10387319, spacing: 80, cr: 60, kind: 'large_bedrock' };
    case 'outpost':
      return mc < 111 ? null : { salt: 165745296, spacing: 80, cr: 56, kind: 'outpost_bedrock' };
    case 'ocean_ruin':
      return mc < 104
        ? null
        : mc < 118
          ? { salt: 14357621, spacing: 12, cr: 5, kind: 'large_bedrock' }
          : { salt: 14357621, spacing: 20, cr: 12, kind: 'feature_bedrock' };
    case 'shipwreck':
      return mc < 104
        ? null
        : mc < 118
          ? { salt: 165745295, spacing: 10, cr: 5, kind: 'large_bedrock' }
          : { salt: 165745295, spacing: 24, cr: 20, kind: 'feature_bedrock' };
    case 'ruined_portal':
      return mc < 116 ? null : { salt: 40552231, spacing: 40, cr: 25, kind: 'feature_bedrock' };
    case 'ruined_portal_nether':
      return mc < 116 ? null : { salt: 40552231, spacing: 25, cr: 15, kind: 'feature_bedrock' };
    case 'ancient_city':
      return mc < 119 ? null : { salt: 20083232, spacing: 24, cr: 16, kind: 'large_bedrock' };
    case 'trail_ruins':
      return mc < 120 ? null : { salt: 83469867, spacing: 34, cr: 26, kind: 'feature_java_bedrock' };
    case 'trial_chambers':
      return mc < 121 ? null : { salt: 94251327, spacing: 34, cr: 22, kind: 'feature_java_bedrock' };
    case 'treasure':
      return { salt: 16842397, spacing: 4, cr: 2, kind: 'large_bedrock' };
    case 'fortress':
      return mc >= 116
        ? { salt: 30084232, spacing: 30, cr: 26, kind: 'fortress_bedrock' }
        : { salt: 0, spacing: 16, cr: 8, kind: 'fortress_bedrock_legacy' };
    case 'bastion':
      return mc < 116 ? null : { salt: 30084232, spacing: 30, cr: 26, kind: 'bastion_bedrock' };
    case 'end_city':
      return { salt: 10387313, spacing: 20, cr: 9, kind: 'large_end' };
    case 'stronghold':
      return { salt: 0, spacing: 0, cr: 0, kind: 'stronghold_bedrock' };
    default:
      return null;
  }
}

export interface StructureSpot {
  id: StructureId;
  label: string;
  dim: Dimension;
  x: number;
  z: number;
  /** stronghold index (1-based) for strongholds */
  index?: number;
}

interface Point {
  x: number;
  z: number;
  index?: number;
}

function javaSpot(seed: bigint, id: StructureId, conf: Conf, rx: number, rz: number): Point[] {
  const label = STRUCTURES[id].label;
  switch (conf.kind) {
    case 'feature': {
      const rng = new JavaRandom(javaRegionSeed(seed, rx, rz, conf.salt));
      const ox = rng.nextInt(conf.cr);
      const oz = rng.nextInt(conf.cr);
      return [{ x: (rx * conf.spacing + ox) << 4, z: (rz * conf.spacing + oz) << 4 }];
    }
    case 'large': {
      const rng = new JavaRandom(javaRegionSeed(seed, rx, rz, conf.salt));
      const ox = Math.floor((rng.nextInt(conf.cr) + rng.nextInt(conf.cr)) / 2);
      const oz = Math.floor((rng.nextInt(conf.cr) + rng.nextInt(conf.cr)) / 2);
      return [{ x: (rx * conf.spacing + ox) << 4, z: (rz * conf.spacing + oz) << 4 }];
    }
    case 'large_end': {
      const rng = new JavaRandom(javaRegionSeed(seed, rx, rz, conf.salt));
      const ox = Math.floor((rng.nextInt(conf.cr) + rng.nextInt(conf.cr)) / 2);
      const oz = Math.floor((rng.nextInt(conf.cr) + rng.nextInt(conf.cr)) / 2);
      const x = (rx * conf.spacing + ox) << 4;
      const z = (rz * conf.spacing + oz) << 4;
      if (x * x + z * z < 1008 * 1008) return [];
      return [{ x, z }];
    }
    case 'outpost_java': {
      const rng = new JavaRandom(javaRegionSeed(seed, rx, rz, conf.salt));
      const ox = rng.nextInt(conf.cr);
      const oz = rng.nextInt(conf.cr);
      const cx = rx * conf.spacing + ox;
      const cz = rz * conf.spacing + oz;
      const regionBits = ((Math.floor(cx / 16) | 0) ^ (((Math.floor(cz / 16) << 4) | 0) | 0)) | 0;
      const attemptSeed = BigInt.asUintN(64, seed) ^ BigInt.asUintN(64, BigInt(regionBits));
      const roll = new JavaRandom(attemptSeed);
      roll.next(31);
      if (roll.nextInt(5) !== 0) return [];
      return [{ x: cx << 4, z: cz << 4 }];
    }
    case 'treasure_java': {
      const cx = rx;
      const cz = rz;
      const rng = new JavaRandom(javaRegionSeed(seed, cx, cz, conf.salt));
      if (rng.nextFloat() >= 0.01) return [];
      return [{ x: cx * 16 + 9, z: cz * 16 + 9 }];
    }
    case 'fortress_legacy_java': {
      const bits = ((rx | 0) ^ ((rz << 4) | 0)) | 0;
      const rng = new JavaRandom(BigInt.asUintN(64, seed) ^ BigInt.asUintN(64, BigInt(bits)));
      rng.next(31);
      if (rng.nextInt(3) !== 0) return [];
      const x = (rx * 16 + rng.nextInt(8) + 4) << 4;
      const z = (rz * 16 + rng.nextInt(8) + 4) << 4;
      return [{ x, z }];
    }
    case 'fortress_java_117':
    case 'bastion_java_pre': {
      const rng = new JavaRandom(javaRegionSeed(seed, rx, rz, conf.salt));
      const ox = rng.nextInt(conf.cr);
      const oz = rng.nextInt(conf.cr);
      const roll = rng.nextInt(5);
      if (conf.kind === 'fortress_java_117' ? roll >= 2 : roll < 2) return [];
      return [{ x: (rx * conf.spacing + ox) << 4, z: (rz * conf.spacing + oz) << 4 }];
    }
    case 'fortress_java_118': {
      const rng = new JavaRandom(javaRegionSeed(seed, rx, rz, conf.salt));
      const ox = rng.nextInt(conf.cr);
      const oz = rng.nextInt(conf.cr);
      return [{ x: (rx * conf.spacing + ox) << 4, z: (rz * conf.spacing + oz) << 4 }];
    }
    case 'bastion_java_118': {
      const rng = new JavaRandom(javaRegionSeed(seed, rx, rz, conf.salt));
      const ox = rng.nextInt(conf.cr);
      const oz = rng.nextInt(conf.cr);
      const cx = rx * conf.spacing + ox;
      const cz = rz * conf.spacing + oz;
      const base = new JavaRandom(seed);
      const a = base.nextLong();
      const b = base.nextLong();
      const mixed = BigInt.asUintN(
        64,
        a * BigInt.asUintN(64, BigInt(cx)) ^ b * BigInt.asUintN(64, BigInt(cz)) ^ BigInt.asUintN(64, seed),
      );
      const roll = new JavaRandom(mixed);
      if (roll.nextInt(5) < 2) return [];
      return [{ x: cx << 4, z: cz << 4 }];
    }
    default:
      return [];
  }
}

function bedrockSpot(seed: bigint, id: StructureId, conf: Conf, rx: number, rz: number): Point[] {
  switch (conf.kind) {
    case 'feature_bedrock': {
      const mt = new BedrockRandom(bedrockRegionSeed(seed, rx, rz, conf.salt));
      const ox = mt.nextInt(conf.cr);
      const oz = mt.nextInt(conf.cr);
      return [{ x: ((rx * conf.spacing + ox) << 4) + 8, z: ((rz * conf.spacing + oz) << 4) + 8 }];
    }
    case 'feature_java_bedrock': {
      const rng = new JavaRandom(javaRegionSeed(seed, rx, rz, conf.salt));
      const ox = rng.nextInt(conf.cr);
      const oz = rng.nextInt(conf.cr);
      return [{ x: ((rx * conf.spacing + ox) << 4) + 8, z: ((rz * conf.spacing + oz) << 4) + 8 }];
    }
    case 'large_bedrock':
    case 'outpost_bedrock':
    case 'large_end': {
      const mt = new BedrockRandom(bedrockRegionSeed(seed, rx, rz, conf.salt));
      const ox = Math.floor((mt.nextInt(conf.cr) + mt.nextInt(conf.cr)) / 2);
      const oz = Math.floor((mt.nextInt(conf.cr) + mt.nextInt(conf.cr)) / 2);
      const pad = conf.kind === 'outpost_bedrock' ? 0 : 8;
      const x = ((rx * conf.spacing + ox) << 4) + pad;
      const z = ((rz * conf.spacing + oz) << 4) + pad;
      if (conf.kind === 'large_end' && x * x + z * z < 1008 * 1008) return [];
      return [{ x, z }];
    }
    case 'fortress_bedrock':
    case 'bastion_bedrock': {
      const mt = new BedrockRandom(bedrockRegionSeed(seed, rx, rz, conf.salt));
      const ox = mt.nextInt(conf.cr);
      const oz = mt.nextInt(conf.cr);
      const roll = mt.nextInt(6);
      if (conf.kind === 'fortress_bedrock' ? roll >= 2 : roll < 2) return [];
      return [{ x: ((rx * conf.spacing + ox) << 4) + 8, z: ((rz * conf.spacing + oz) << 4) + 8 }];
    }
    case 'fortress_bedrock_legacy': {
      const bits = ((rx | 0) ^ ((rz << 4) | 0)) | 0;
      const low = Number(BigInt.asUintN(32, seed));
      const mt = new BedrockRandom((low ^ (bits >>> 0)) >>> 0);
      mt.next();
      if (mt.nextInt(3) !== 0) return [];
      const x = ((rx * 16 + mt.nextInt(8) + 4) << 4) + 11;
      const z = ((rz * 16 + mt.nextInt(8) + 4) << 4) + 11;
      return [{ x, z }];
    }
    default:
      return [];
  }
}

/** Approximate Java strongholds via the ring algorithm. For 1.19.3+ the approximate ring positions are exact. */
function javaStrongholds(mc: number, seed: bigint): Point[] {
  const rng = new JavaRandom(seed);
  const modern = mc >= 109;
  const total = modern ? 128 : 3;
  const out: Point[] = [];

  let angle = 2 * Math.PI * rng.nextDouble();
  let dist = modern ? 128 + (rng.nextDouble() - 0.5) * 80 : (1.25 + rng.nextDouble()) * 32;

  let ringnum = 0;
  let ringmax = 3;
  let ringidx = 0;

  const approx = (): { x: number; z: number } => ({
    x: Math.round(Math.cos(angle) * dist) * 16 + 8,
    z: Math.round(Math.sin(angle) * dist) * 16 + 8,
  });

  const push = (p: { x: number; z: number }) => {
    if (mc >= 1193) rng.nextLong(); // 1.19.3+: derived seed for the biome search
    out.push({
      x: Math.floor(p.x / 16) * 16 + 4,
      z: Math.floor(p.z / 16) * 16 + 4,
      index: out.length + 1,
    });
  };

  push(approx());

  while (out.length < total) {
    ringidx++;
    angle += (2 * Math.PI) / ringmax;
    if (ringidx === ringmax) {
      ringnum++;
      ringidx = 0;
      ringmax = ringmax + Math.floor((2 * ringmax) / (ringnum + 1));
      if (ringmax > total - out.length) ringmax = total - out.length;
      angle += rng.nextDouble() * Math.PI * 2;
    }
    dist = modern
      ? 128 + 6 * ringnum * 32 + (rng.nextDouble() - 0.5) * 80
      : (1.25 + rng.nextDouble()) * 32;
    push(approx());
  }

  return out;
}

function bedrockStrongholds(seed: bigint, centerX: number, centerZ: number, radius: number): Point[] {
  const out: Point[] = [];
  const spacing = 200;
  const range = regionRange(centerX, centerZ, radius, spacing);
  for (let rx = range.min; rx <= range.max; rx++) {
    for (let rz = range.minZ; rz <= range.maxZ; rz++) {
      const a = spacing * rx + 100;
      const b = spacing * rz + 100;
      const s = Number(
        BigInt.asUintN(
          32,
          BigInt(a) * 784295783249n + BigInt(b) * 827828252345n + BigInt.asUintN(32, seed) + 97858791n,
        ),
      );
      const mt = new BedrockRandom(s);
      const cx = mt.nextIntRange(-50, 50) + a;
      const cz = mt.nextIntRange(-50, 50) + b;
      if (mt.nextFloat() >= 0.25) continue;
      out.push({ x: cx * 16 + 4, z: cz * 16 + 4, index: out.length + 1 });
    }
  }
  return out;
}

function regionRange(centerX: number, centerZ: number, radius: number, spacing: number) {
  const minChunkX = Math.floor((centerX - radius) / 16);
  const maxChunkX = Math.floor((centerX + radius) / 16);
  const minChunkZ = Math.floor((centerZ - radius) / 16);
  const maxChunkZ = Math.floor((centerZ + radius) / 16);
  return {
    min: Math.floor(minChunkX / spacing) - 1,
    max: Math.floor(maxChunkX / spacing) + 1,
    minZ: Math.floor(minChunkZ / spacing) - 1,
    maxZ: Math.floor(maxChunkZ / spacing) + 1,
  };
}

export function isStructureAvailable(edition: Edition, mc: number, id: StructureId): boolean {
  return !!(edition === 'java' ? javaConf(mc, id) : bedrockConf(mc, id));
}

export interface FindOptions {
  edition: Edition;
  mc: number;
  seed: bigint;
  centerX: number;
  centerZ: number;
  radius: number;
  structures: StructureId[];
}

export function findStructures(opts: FindOptions): StructureSpot[] {
  const radius = Math.max(16, Math.min(opts.radius, 5000));
  const out: StructureSpot[] = [];
  const inside = (x: number, z: number) =>
    Math.hypot(x - opts.centerX, z - opts.centerZ) <= radius;

  for (const id of opts.structures) {
    const info = STRUCTURES[id];
    const conf = opts.edition === 'java' ? javaConf(opts.mc, id) : bedrockConf(opts.mc, id);
    if (!conf || !info) continue;

    if (conf.kind === 'stronghold_java') {
      for (const p of javaStrongholds(opts.mc, opts.seed)) {
        if (inside(p.x, p.z)) out.push({ id, label: info.label, dim: info.dim, x: p.x, z: p.z, index: p.index });
      }
      continue;
    }
    if (conf.kind === 'stronghold_bedrock') {
      for (const p of bedrockStrongholds(opts.seed, opts.centerX, opts.centerZ, radius)) {
        if (inside(p.x, p.z)) out.push({ id, label: info.label, dim: info.dim, x: p.x, z: p.z, index: p.index });
      }
      continue;
    }

    const spacing = conf.spacing;
    const range = regionRange(opts.centerX, opts.centerZ, radius, spacing);
    for (let rx = range.min; rx <= range.max; rx++) {
      for (let rz = range.minZ; rz <= range.maxZ; rz++) {
        const points =
          opts.edition === 'java'
            ? javaSpot(opts.seed, id, conf, rx, rz)
            : bedrockSpot(opts.seed, id, conf, rx, rz);
        for (const p of points) {
          if (inside(p.x, p.z)) out.push({ id, label: info.label, dim: info.dim, x: p.x, z: p.z });
        }
      }
    }
  }

  return out;
}

/** Nearest single match for the seed finder. */
export function nearestSpot(
  edition: Edition,
  mc: number,
  seed: bigint,
  id: StructureId,
  maxDistance: number,
): { x: number; z: number; distance: number } | null {
  const spots = findStructures({
    edition,
    mc,
    seed,
    centerX: 0,
    centerZ: 0,
    radius: maxDistance,
    structures: [id],
  });
  if (!spots.length) return null;
  let best = spots[0];
  let bestD = Math.hypot(best.x, best.z);
  for (const s of spots) {
    const d = Math.hypot(s.x, s.z);
    if (d < bestD) {
      best = s;
      bestD = d;
    }
  }
  return { x: best.x, z: best.z, distance: bestD };
}
