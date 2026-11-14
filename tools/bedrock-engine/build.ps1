# Builds the Bedrock cubiomes worldgen engine to WebAssembly.
#
# Requires:
#   - wasi-sdk (https://github.com/WebAssembly/wasi-sdk/releases)
#   - a checkout of https://github.com/FragrantResult186/cubiomes-bedrock
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File tools/bedrock-engine/build.ps1 `
#     -CubiomesDir C:\src\cubiomes-bedrock -WasiSdk C:\tools\wasi-sdk-30
#
# Output: static/mc/seed_engine_bedrock.wasm

param(
  [Parameter(Mandatory = $true)][string]$CubiomesDir,
  [Parameter(Mandatory = $true)][string]$WasiSdk,
  [string]$OutDir
)

$ErrorActionPreference = 'Stop'
if (-not $OutDir) { $OutDir = Join-Path $PSScriptRoot '..\..\static\mc' }

$clang = Join-Path $WasiSdk 'bin\clang.exe'
if (-not (Test-Path $clang)) { throw "clang not found at $clang" }

$sources = @(
  'noise.c',
  'biomes.c',
  'layers.c',
  'biomenoise.c',
  'cave.c',
  'generator.c',
  'finders.c',
  'util.c',
  'mt.c'
) | ForEach-Object { Join-Path $CubiomesDir $_ }

$sources += Join-Path $PSScriptRoot 'seed_engine_bedrock_api.c'

$out = Join-Path $OutDir 'seed_engine_bedrock.wasm'
$out = [System.IO.Path]::GetFullPath($out)

$clangArgs = @(
  '--target=wasm32-wasi',
  '-O3',
  '-fwrapv',
  '-mexec-model=reactor',
  '-Wall',
  '-I', $CubiomesDir,
  '-I', $PSScriptRoot
) + $sources + @(
  '-Wl,--export=malloc',
  '-Wl,--export=free'
) + @('-o', $out)

& $clang @clangArgs
if ($LASTEXITCODE -ne 0) { throw "clang failed with exit code $LASTEXITCODE" }

$size = (Get-Item $out).Length
Write-Host "built $out ($([math]::Round($size / 1024)) KB)"
