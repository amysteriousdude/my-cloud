<!-- src/lib/tabs/Generators.svelte -->
<script lang="ts">
  const GENERATORS = [
    {
      id: 'topographic-lines',
      title: 'Topographic Lines',
      desc: 'Generate contour-style topo maps with customizable terrain and color palettes.',
      icon: '🏔️',
      banner: 'topo',
      href: '/generators/topographic-lines',
    },
    {
      id: 'technical-difficulties',
      title: 'Technical Difficulties',
      desc: 'Glitch art generator with RGB channel split, scanlines, and block corruption.',
      icon: '📺',
      banner: 2,
      href: '/generators/technical-difficulties',
    },
    {
      id: 'patterns',
      title: 'Patterns',
      desc: 'Generate seamless geometric patterns with tiling, symmetry, and color controls.',
      icon: '🔷',
      banner: 'patterns',
      href: '/generators/patterns',
    },
    {
      id: 'qr-code',
      title: 'QR Code',
      desc: 'Create customizable QR codes with colors, logos, and error correction levels.',
      icon: '📱',
      banner: 'qr',
      href: '/generators/qr-code',
    },
    {
      id: 'noise',
      title: 'Noise',
      desc: 'Generate Perlin, Simplex, and Voronoi noise patterns with custom scales.',
      icon: '🌫️',
      banner: 'noise',
      href: '/generators/noise',
    },
    {
      id: 'pixel-art',
      title: 'Pixel Art',
      desc: 'Create pixel art with a grid editor, palette, and export to PNG.',
      icon: '👾',
      banner: 'pixel',
      href: '/generators/pixel-art',
    },
    {
      id: 'ascii-art',
      title: 'ASCII Art & Image-to-ASCII',
      desc: 'Convert text to ASCII art or transform images into ASCII with color and custom character sets.',
      icon: '🔤',
      banner: 'ascii',
      href: '/generators/ascii-art',
    },
    {
      id: 'gradient',
      title: 'Gradient',
      desc: 'Generate beautiful gradients with multiple stops, directions, and noise.',
      icon: '🌈',
      banner: 'gradient',
      href: '/generators/gradient',
    },
    {
      id: 'maze',
      title: 'Maze',
      desc: 'Generate procedural mazes with recursive backtracking and color themes.',
      icon: '🏃',
      banner: 'maze',
      href: '/generators/maze',
    },
    {
      id: 'fractal',
      title: 'Fractal',
      desc: 'Explore Mandelbrot and Julia sets with zoom, pan, and color palettes.',
      icon: '🌀',
      banner: 'fractal',
      href: '/generators/fractal',
    },
    {
      id: 'waveform',
      title: 'Waveform',
      desc: 'Create audio waveform and oscilloscope-style art from text.',
      icon: '📡',
      banner: 'waveform',
      href: '/generators/waveform',
    },
    {
      id: 'dither',
      title: 'Dither',
      desc: 'Apply Floyd-Steinberg and Atkinson dithering with palette reduction.',
      icon: '🖼️',
      banner: 'dither',
      href: '/generators/dither',
    },
    {
      id: 'palette',
      title: 'Color Palette',
      desc: 'Generate harmonious color palettes from a base color with complementary, triadic, and analogous schemes.',
      icon: '🎨',
      banner: 'palette',
      href: '/generators/palette',
    },
  ];
</script>

<div class="gen-wrap">
  <h1 class="page-title">Generators</h1>
  <p class="page-sub">Client-side creative tools. Nothing is uploaded or processed on the server.</p>

  <div class="card-grid">
    {#each GENERATORS as g}
      <a href={g.href} class="card">
        <div class="card-banner banner-{g.banner}">
          <span class="card-icon">{g.icon}</span>
        </div>
        <div class="card-body">
          <span class="card-title">{g.title}</span>
          <span class="card-desc">{g.desc}</span>
        </div>
      </a>
    {/each}
  </div>

  <p class="empty-note">yvonne said nothing's here :3</p>
</div>

<style>
  .gen-wrap { padding: 32px 40px; }
  .page-title { font-size: 22px; font-weight: 700; color: var(--text-1); margin: 0 0 6px; letter-spacing: -.4px; }
  .page-sub { color: var(--text-3); font-size: 13px; margin: 0 0 28px; }

  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 16px; margin-bottom: 40px;
  }

  .card {
    border-radius: 14px; border: 1px solid var(--border);
    background: var(--bg-2); text-decoration: none;
    overflow: hidden; transition: border-color .15s, transform .15s, box-shadow .15s;
    display: flex; flex-direction: column;
  }
  .card:hover {
    border-color: var(--border-hover);
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0,0,0,.3);
  }

  .card-banner {
    height: 110px;
    display: flex; align-items: center; justify-content: center;
    position: relative; overflow: hidden;
  }
  .banner-topo {
    background:
      repeating-linear-gradient(0deg, transparent, transparent 12px, rgba(99,102,241,.18) 12px, rgba(99,102,241,.18) 13px),
      repeating-linear-gradient(90deg, transparent, transparent 18px, rgba(99,102,241,.08) 18px, rgba(99,102,241,.08) 19px),
      radial-gradient(ellipse at 30% 60%, rgba(99,102,241,.3) 0%, transparent 60%),
      radial-gradient(ellipse at 70% 40%, rgba(139,92,246,.2) 0%, transparent 50%),
      linear-gradient(135deg, #0d0d1a 0%, #111 100%);
  }
  .card-icon { font-size: 36px; line-height: 1; filter: drop-shadow(0 2px 8px rgba(0,0,0,.5)); }

  .banner-patterns {
    background: repeating-conic-gradient(var(--bg-2) 0% 25%, transparent 0% 50%) 0 0 / 20px 20px,
      radial-gradient(circle at 30% 50%, rgba(99,102,241,.3) 0%, transparent 60%),
      linear-gradient(135deg, #0d0d1a 0%, #111 100%);
  }
  .banner-qr {
    background:
      radial-gradient(circle at 50% 50%, rgba(34,197,94,.2) 0%, transparent 50%),
      repeating-linear-gradient(0deg, transparent, transparent 8px, rgba(34,197,94,.1) 8px, rgba(34,197,94,.1) 9px),
      repeating-linear-gradient(90deg, transparent, transparent 8px, rgba(34,197,94,.1) 8px, rgba(34,197,94,.1) 9px),
      linear-gradient(135deg, #0d1a0f 0%, #111 100%);
  }
  .banner-noise {
    background:
      radial-gradient(circle at 20% 30%, rgba(139,92,246,.3) 0%, transparent 50%),
      radial-gradient(circle at 80% 70%, rgba(236,72,153,.2) 0%, transparent 50%),
      linear-gradient(135deg, #0d0d1a 0%, #111 100%);
  }
  .banner-pixel {
    background:
      repeating-conic-gradient(rgba(245,158,11,.15) 0% 25%, transparent 0% 50%) 0 0 / 12px 12px,
      radial-gradient(circle at 50% 50%, rgba(245,158,11,.2) 0%, transparent 60%),
      linear-gradient(135deg, #1a150d 0%, #111 100%);
  }
  .banner-ascii {
    background:
      radial-gradient(circle at 40% 50%, rgba(6,182,212,.25) 0%, transparent 55%),
      linear-gradient(135deg, #0d1518 0%, #111 100%);
  }
  .banner-gradient {
    background: linear-gradient(135deg, #6366f1 0%, #ec4899 50%, #f59e0b 100%);
    opacity: 0.9;
  }
  .banner-maze {
    background:
      repeating-linear-gradient(0deg, transparent, transparent 10px, rgba(251,191,36,.08) 10px, rgba(251,191,36,.08) 11px),
      repeating-linear-gradient(90deg, transparent, transparent 10px, rgba(251,191,36,.08) 10px, rgba(251,191,36,.08) 11px),
      radial-gradient(circle at 50% 50%, rgba(251,191,36,.15) 0%, transparent 60%),
      linear-gradient(135deg, #1a150d 0%, #111 100%);
  }
  .banner-fractal {
    background:
      radial-gradient(circle at 30% 40%, rgba(139,92,246,.3) 0%, transparent 40%),
      radial-gradient(circle at 70% 60%, rgba(236,72,153,.2) 0%, transparent 40%),
      radial-gradient(circle at 50% 50%, rgba(99,102,241,.15) 0%, transparent 60%),
      linear-gradient(135deg, #0d0d1a 0%, #111 100%);
  }
  .banner-waveform {
    background:
      repeating-linear-gradient(90deg, transparent, transparent 4px, rgba(34,197,94,.08) 4px, rgba(34,197,94,.08) 5px),
      radial-gradient(ellipse at 50% 50%, rgba(34,197,94,.2) 0%, transparent 60%),
      linear-gradient(135deg, #0d1a0f 0%, #111 100%);
  }
  .banner-dither {
    background:
      repeating-conic-gradient(rgba(248,113,113,.08) 0% 25%, transparent 0% 50%) 0 0 / 8px 8px,
      radial-gradient(circle at 50% 50%, rgba(248,113,113,.15) 0%, transparent 55%),
      linear-gradient(135deg, #1a0d0d 0%, #111 100%);
  }
  .banner-palette {
    background:
      conic-gradient(from 45deg, rgba(99,102,241,.3), rgba(236,72,153,.3), rgba(245,158,11,.3), rgba(34,197,94,.3), rgba(99,102,241,.3)),
      radial-gradient(circle at 50% 50%, rgba(99,102,241,.1) 0%, transparent 60%),
      linear-gradient(135deg, #0d0d1a 0%, #111 100%);
  }

  .card-body { padding: 14px 16px 16px; display: flex; flex-direction: column; gap: 6px; }
  .card-title { font-size: 14px; font-weight: 600; color: var(--text-1); letter-spacing: -.2px; }
  .card-desc { font-size: 12px; color: var(--text-3); line-height: 1.5; }

  .empty-note { color: var(--text-3); font-size: 12px; font-family: 'Geist Mono', monospace; margin: 0; }

  @media (max-width: 600px) {
    .gen-wrap { padding: 16px; }
    .card-grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
  }
</style>
