/*
 * Maps the app's internal version codes to the labels understood by the
 * cubiomes builds. Java uses the classic cubiomes ordinals; Bedrock uses the
 * cubiomes-bedrock version labels (game versions and previews).
 */

export function javaVersionKey(mc: number): string {
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

export function bedrockVersionKey(mc: number): string {
  if (mc >= 2660) return '26.60';
  if (mc >= 2650) return '26.50';
  if (mc >= 2640) return '26.40';
  if (mc >= 2630) return '26.30';
  if (mc >= 2620) return '26.20';
  if (mc >= 12160) return '1.21.60';
  if (mc >= 12150) return '1.21.50';
  if (mc >= 121) return '1.21';
  if (mc >= 120) return '1.20';
  if (mc >= 119) return '1.19';
  if (mc >= 118) return '1.18';
  if (mc >= 117) return '1.17';
  if (mc >= 116) return '1.16';
  if (mc >= 114) return '1.14';
  return '1.11';
}

export function versionKey(edition: 'java' | 'bedrock', mc: number): string {
  return edition === 'java' ? javaVersionKey(mc) : bedrockVersionKey(mc);
}
