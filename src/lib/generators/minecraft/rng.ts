// hello there, tf u doing on my code????
// Java LCG + Bedrock MT19937, ported 1:1 from vanilla behaviour (via cubiomes rng.h / mt.h)

const M48 = (1n << 48n) - 1n;
const K = 0x5deece66dn;
const B = 0xbn;

/** java.util.Random port with a 48-bit state (BigInt for exactness). */
export class JavaRandom {
  private s: bigint;

  constructor(seed: bigint) {
    this.s = (BigInt.asUintN(64, seed) ^ K) & M48;
  }

  next(bits: number): number {
    this.s = (this.s * K + B) & M48;
    return Number(this.s >> BigInt(48 - bits));
  }

  nextInt(n: number): number {
    if (n <= 0) return 0;
    const m = n - 1;
    // powers of two take the fast path in java.util.Random
    if ((m & n) === 0) {
      return Math.floor((n * this.next(31)) / 2147483648);
    }
    let bits: number;
    let val: number;
    do {
      bits = this.next(31);
      val = bits % n;
    } while (bits - val + m >= 2147483648);
    return val;
  }

  nextIntRange(a: number, b: number): number {
    return a < b ? a + this.nextInt(b - a) : a;
  }

  nextLong(): bigint {
    const hi = this.next(32) | 0;
    const lo = this.next(32) | 0;
    return BigInt.asUintN(64, (BigInt(hi) << 32n) + BigInt(lo));
  }

  nextFloat(): number {
    return this.next(24) / 16777216;
  }

  nextDouble(): number {
    const hi = BigInt(this.next(26));
    const lo = BigInt(this.next(27));
    return Number((hi << 27n) + lo) / 9007199254740992;
  }
}

/** Bedrock's 32-bit Mersenne Twister (MT19937) with vanilla's seed/nextInt semantics. */
export class BedrockRandom {
  private mt = new Uint32Array(624);
  private index = 624;

  constructor(seed: number) {
    this.seed(seed);
  }

  seed(value: number): void {
    const s = value >>> 0;
    this.mt[0] = s;
    for (let i = 1; i < 624; i++) {
      const prev = this.mt[i - 1];
      this.mt[i] = (Math.imul(1812433253, prev ^ (prev >>> 30)) + i) >>> 0;
    }
    this.index = 624;
  }

  private twist(): void {
    for (let i = 0; i < 624; i++) {
      const y = (this.mt[i] & 0x80000000) | (this.mt[(i + 1) % 624] & 0x7fffffff);
      this.mt[i] = (this.mt[(i + 397) % 624] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0)) >>> 0;
    }
    this.index = 0;
  }

  /** Raw tempered uint32 (what vanilla's `mt_next` returns). */
  next(): number {
    if (this.index >= 624) this.twist();
    let y = this.mt[this.index++];
    y ^= y >>> 11;
    y ^= (y << 7) & 2636928640;
    y ^= (y << 15) & 4022730752;
    y ^= y >>> 18;
    return y >>> 0;
  }

  /** Bedrock uses a plain modulus, no rejection sampling. */
  nextInt(n: number): number {
    return n > 0 ? this.next() % n : 0;
  }

  nextIntRange(a: number, b: number): number {
    return a < b ? a + this.nextInt(b - a) : a;
  }

  nextFloat(): number {
    return this.next() / 4294967296;
  }
}

/** Java's String.hashCode (used by vanilla for text seeds). */
export function javaStringHash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  return h;
}

/** Accepts a signed 64-bit number or a text seed (Java style). */
export function parseSeedInput(input: string): bigint | null {
  const t = input.trim();
  if (!t) return null;
  if (/^-?\d+$/.test(t)) {
    try {
      return BigInt.asIntN(64, BigInt(t));
    } catch {
      return null;
    }
  }
  return BigInt(javaStringHash(t));
}

export function randomSeed(edition: 'java' | 'bedrock'): bigint {
  if (edition === 'bedrock') {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return BigInt(a[0]);
  }
  const a = new BigUint64Array(1);
  crypto.getRandomValues(a);
  return BigInt.asIntN(64, a[0]);
}
