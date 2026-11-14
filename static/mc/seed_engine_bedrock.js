/*
 * Bedrock worldgen engine loader.
 *
 * cubiomes-bedrock (MIT, https://github.com/FragrantResult186/cubiomes-bedrock)
 * compiled to wasm32-wasi. The exported surface is intentionally identical to
 * the Java build (/mc/seed_engine.js) so the worldgen worker can use either
 * edition without special-casing reads and writes across the heap.
 */

const WASM_URL = new URL('./seed_engine_bedrock.wasm', import.meta.url);
const decoder = new TextDecoder();
const encoder = new TextEncoder();

function makeWasi(state) {
  const view = () => new DataView(state.memory.buffer);

  return {
    fd_write(fd, iovs, iovsLen, nwritten) {
      let total = 0;
      const out = [];
      for (let i = 0; i < iovsLen; i++) {
        const ptr = view().getUint32(iovs + i * 8, true);
        const len = view().getUint32(iovs + i * 8 + 4, true);
        if (len > 0) {
          out.push(new Uint8Array(state.memory.buffer, ptr, len));
          total += len;
        }
      }
      if (out.length > 0 && fd !== 1 && fd !== 2) {
        // not a console stream; swallow it
      } else if (out.length > 0) {
        const text = out.map((chunk) => decoder.decode(chunk)).join('');
        if (text.trim()) console.warn('[bedrock-worldgen]', text.trim());
      }
      view().setUint32(nwritten, total, true);
      return 0;
    },
    fd_close() {
      return 0;
    },
    fd_fdstat_get(fd, statPtr) {
      // character device, no rights
      view().setUint8(statPtr, 2);
      view().setUint16(statPtr + 2, 0, true);
      view().setBigUint64(statPtr + 8, 0n, true);
      view().setBigUint64(statPtr + 16, 0n, true);
      return 0;
    },
    fd_prestat_get() {
      return 8; // EBADF
    },
    fd_prestat_dir_name() {
      return 8;
    },
    fd_seek() {
      return 8;
    },
    proc_exit(code) {
      throw new Error(`bedrock worldgen engine exited (${code})`);
    },
  };
}

export default async function loadBedrockEngine() {
  const response = await fetch(WASM_URL);
  if (!response.ok) throw new Error(`failed to load bedrock engine (${response.status})`);
  const bytes = await response.arrayBuffer();

  const state = { memory: null };
  const { instance } = await WebAssembly.instantiate(bytes, {
    wasi_snapshot_preview1: makeWasi(state),
  });

  const wasm = instance.exports;
  state.memory = wasm.memory;
  if (typeof wasm._initialize === 'function') wasm._initialize();

  const mod = {
    get HEAPU8() {
      return new Uint8Array(wasm.memory.buffer);
    },
    get HEAP32() {
      return new Int32Array(wasm.memory.buffer);
    },
    getValue(ptr, type = 'i32') {
      const view = new DataView(wasm.memory.buffer);
      if (type === 'i8') return view.getInt8(ptr);
      if (type === 'u8') return view.getUint8(ptr);
      if (type === 'i16') return view.getInt16(ptr, true);
      if (type === 'u16') return view.getUint16(ptr, true);
      return view.getInt32(ptr, true);
    },
    setValue(ptr, value, type = 'i32') {
      const view = new DataView(wasm.memory.buffer);
      if (type === 'i8') view.setInt8(ptr, value);
      else if (type === 'u8') view.setUint8(ptr, value);
      else if (type === 'i16') view.setInt16(ptr, value, true);
      else if (type === 'u16') view.setUint16(ptr, value, true);
      else view.setInt32(ptr, value, true);
    },
    stringToUTF8(str, ptr, maxBytes) {
      const bytes = encoder.encode(str);
      const len = Math.min(bytes.length, Math.max(0, maxBytes - 1));
      new Uint8Array(wasm.memory.buffer, ptr, len).set(bytes.subarray(0, len));
      new Uint8Array(wasm.memory.buffer)[ptr + len] = 0;
    },
    UTF8ToString(ptr, len) {
      if (!ptr) return '';
      const buffer = new Uint8Array(wasm.memory.buffer);
      if (typeof len === 'number') {
        return decoder.decode(buffer.subarray(ptr, ptr + len));
      }
      let end = ptr;
      while (end < buffer.length && buffer[end] !== 0) end++;
      return decoder.decode(buffer.subarray(ptr, end));
    },
  };

  for (const [name, value] of Object.entries(wasm)) {
    if (typeof value === 'function') mod[`_${name}`] = value;
  }

  return mod;
}
