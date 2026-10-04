// hello there, tf u doing on my code????
import {
  IconCloud, IconServer, IconDatabase, IconFolder, IconRocket,
  IconShield, IconSparkles, IconHeart, IconGhost, IconPalette,
  IconStar, IconPaint,
} from '@tabler/icons-svelte';

export const CLOUD_ICONS: Record<string, any> = {
  cloud: IconCloud,
  server: IconServer,
  database: IconDatabase,
  folder: IconFolder,
  rocket: IconRocket,
  shield: IconShield,
  sparkles: IconSparkles,
  heart: IconHeart,
  ghost: IconGhost,
  palette: IconPalette,
  star: IconStar,
  paint: IconPaint,
};

export const CLOUD_ICON_KEYS = Object.keys(CLOUD_ICONS);
