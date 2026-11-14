# Bedrock worldgen engine

`static/mc/seed_engine_bedrock.wasm` is [cubiomes-bedrock](https://github.com/FragrantResult186/cubiomes-bedrock)
(MIT) compiled to `wasm32-wasi`, plus a small C wrapper (`seed_engine_bedrock_api.c`)
that exposes the same functions as the Java build so the worldgen worker can use
either edition with one code path.

- Upstream commit: `294c72ab0392dd818a91d293dbd5774d4874d64b` (2026-10-03)
- Toolchain: [wasi-sdk 30](https://github.com/WebAssembly/wasi-sdk/releases/tag/wasi-sdk-30)
- Output: `static/mc/seed_engine_bedrock.wasm` (~1.1 MB) loaded by
  `static/mc/seed_engine_bedrock.js`

## Rebuilding

```powershell
git clone https://github.com/FragrantResult186/cubiomes-bedrock C:\src\cubiomes-bedrock
# download and unpack wasi-sdk for your platform, e.g. C:\tools\wasi-sdk-30

powershell -ExecutionPolicy Bypass -File tools/bedrock-engine/build.ps1 `
  -CubiomesDir C:\src\cubiomes-bedrock `
  -WasiSdk C:\tools\wasi-sdk-30
```

## Exported API

The wrapper mirrors the Java engine build:

- `wasm_create` / `wasm_destroy`
- `wasm_ctx_generate_biomes` / `wasm_ctx_structure_viable`
- `wasm_structure_pos` / `wasm_structure_region_size`
- `wasm_structure_type_count` / `wasm_structure_name_length` / `wasm_structure_name_ptr`
- `wasm_biome_colors`
- `wasm_version_newest` / `wasm_version_from_string`

Supported biome scales are 1, 4, 16, 64 and 256, matching cubiomes.

## Accuracy

Biomes and structure-attempt RNG come from the Bedrock port. Structures pass the
port's biome viability checks, but cubiomes has no block-level terrain
generation, so terrain-dependent failures (for example a mansion on a cliff
edge) can still happen. Strongholds are still resolved by the JavaScript
implementation in `src/lib/generators/minecraft/structures.ts`.

License: MIT (see `LICENSE`).
