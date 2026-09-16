import { type VHSParams, DEFAULT_PARAMS } from './vhs-effects';

export interface Preset {
  name: string;
  params: Partial<VHSParams>;
}

function merge(base: Partial<VHSParams>): Partial<VHSParams> {
  return { ...base };
}

export const PRESETS: Preset[] = [
  {
    name: 'VHS Standard',
    params: merge({
      signalArtifactColor: 0.3,
      signalChromaLowpass: 0.2,
      signalLuminanceLowpass: 0.1,
      noiseStatic: 0.05,
      noiseSnow: 0.03,
      noiseGhostingDelay: 0.2,
      noiseGhostingDecay: 0.15,
      vhsTapeSpeed: 0.1,
      vhsChromaBlur: 0.3,
      colorSaturation: 0.85,
      colorBrightness: -0.02,
      scanlineThickness: 0.3,
      scanlineIntensity: 0.2,
      colorFringingOffset: 0.5,
    }),
  },
  {
    name: 'Betamax',
    params: merge({
      signalArtifactColor: 0.2,
      signalChromaLowpass: 0.3,
      noiseStatic: 0.08,
      noiseSnow: 0.05,
      noiseGhostingDelay: 0.15,
      noiseGhostingDecay: 0.1,
      vhsChromaBlur: 0.4,
      colorSaturation: 0.8,
      colorHueShift: 10,
      colorBrightness: -0.03,
      scanlineThickness: 0.4,
      scanlineIntensity: 0.25,
    }),
  },
  {
    name: 'Camcorder',
    params: merge({
      signalArtifactColor: 0.4,
      signalChromaLowpass: 0.25,
      signalCompositeBlend: 0.15,
      noiseStatic: 0.12,
      noiseSnow: 0.08,
      noiseChroma: 0.06,
      vhsTapeSpeed: 0.15,
      vhsChromaBlur: 0.2,
      colorSaturation: 0.7,
      colorBrightness: 0.02,
      scanlineThickness: 0.5,
      scanlineIntensity: 0.3,
      geoRollingBars: 0.1,
    }),
  },
  {
    name: 'CCTV',
    params: merge({
      signalChromaLowpass: 0.5,
      noiseStatic: 0.15,
      noiseSnow: 0.1,
      vhsChromaBlur: 0.6,
      colorSaturation: 0.3,
      colorContrast: 1.3,
      colorBrightness: -0.05,
      scanlineThickness: 0.6,
      scanlineIntensity: 0.4,
      edgeGlowThreshold: 0.4,
      edgeGlowAmount: 0.3,
    }),
  },
  {
    name: 'Bad Tracking',
    params: merge({
      signalArtifactColor: 0.5,
      signalChromaLowpass: 0.3,
      geoWaveAmplitude: 3,
      geoWaveFrequency: 0.5,
      geoHorizontalSync: 0.3,
      noiseStatic: 0.1,
      noiseSnow: 0.12,
      vhsTapeSpeed: 0.4,
      vhsHeadSwitching: 0.6,
      colorSaturation: 0.6,
      colorFringingOffset: 1.5,
      scanlineIntensity: 0.3,
    }),
  },
  {
    name: 'Old Broadcast',
    params: merge({
      signalArtifactColor: 0.4,
      signalCompositeBlend: 0.2,
      noiseStatic: 0.08,
      noiseSnow: 0.06,
      noiseGhostingDelay: 0.4,
      noiseGhostingDecay: 0.2,
      vhsChromaBlur: 0.3,
      colorSaturation: 0.75,
      colorHueShift: -5,
      colorBrightness: -0.02,
      scanlineThickness: 0.4,
      scanlineIntensity: 0.35,
      scanlineBeam: 0.2,
    }),
  },
  {
    name: 'CRT Monitor',
    params: merge({
      geoBarrelDistortion: 0.3,
      scanlineThickness: 0.5,
      scanlineIntensity: 0.5,
      scanlineBeam: 0.3,
      colorSaturation: 1.1,
      edgeGlowThreshold: 0.6,
      edgeGlowAmount: 0.15,
    }),
  },
  {
    name: 'Damaged Tape',
    params: merge({
      signalArtifactColor: 0.6,
      signalChromaLowpass: 0.4,
      noiseStatic: 0.2,
      noiseSnow: 0.15,
      noiseChroma: 0.1,
      vhsTapeSpeed: 0.3,
      vhsHeadSwitching: 0.8,
      vhsOverwrite: 0.5,
      colorSaturation: 0.5,
      colorFringingOffset: 2,
      scanlineIntensity: 0.4,
    }),
  },
  {
    name: 'Ethereal',
    params: merge({
      signalArtifactColor: 0.2,
      noiseGhostingDelay: 0.6,
      noiseGhostingDecay: 0.3,
      noiseStatic: 0.02,
      vhsChromaBlur: 0.2,
      colorSaturation: 0.9,
      colorHueShift: 30,
      colorBrightness: 0.05,
      colorContrast: 0.9,
      scanlineThickness: 0.2,
      scanlineIntensity: 0.15,
      edgeGlowAmount: 0.2,
    }),
  },
];

export function applyPreset(params: VHSParams, preset: Preset): VHSParams {
  return { ...params, ...preset.params };
}
