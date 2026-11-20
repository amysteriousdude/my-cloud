<!-- hello there, tf u doing on my code???? -->
<!-- src/lib/tabs/BookEditor.svelte -->
<!-- Story writer / book maker with texture toggle, image notices, and PDF export via pdf-lib. -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

  let { apiKey = '' }: { apiKey?: string } = $props();

  /* ---------------- state ---------------- */
  const PAGE_W = 612;   // letter width in pt
  const PAGE_H = 792;   // letter height in pt
  const SCALE = 2;      // canvas px per pt for crisp export

  let bookTitle = $state('My Story');
  let bookTexture = $state(true);   // on = parchment texture, off = clean
  let editingPage = $state(0);
  let newPageTitle = $state('');

  type PageImage = {
    id: string;
    src: string;        // data url
    x: number; y: number; w: number; h: number; // in pt
    caption?: string;
    locked?: boolean;
  };

  type Page = {
    id: string;
    title: string;
    text: string;
    images: PageImage[];
  };

  let pages = $state<Page[]>([
    { id: crypto.randomUUID(), title: 'Chapter 1', text: 'Once upon a time...', images: [] }
  ]);

  /* image upload staging (not yet placed on a page) */
  let stagedImages: { id: string; src: string }[] = [];
  let placeMode = $state(false);    // when true, clicking a page places the staged image
  let placeImageId = $state<string | null>(null);

  /* drag placement state */
  let dragImage: { id: string; src: string } | null = null;
  let dragTargetPage: number | null = null;

  /* toast */
  let toast = $state<{ msg: string; type: 'ok' | 'err' } | null>(null);
  function showToast(msg: string, type: 'ok' | 'err' = 'ok') {
    toast = { msg, type };
    setTimeout(() => { toast = null; }, 2500);
  }

  /* ---------------- helpers ---------------- */
  function uid() { return crypto.randomUUID(); }

  function addPage() {
    pages.push({
      id: uid(),
      title: newPageTitle.trim() || `Page ${pages.length + 1}`,
      text: '',
      images: []
    });
    newPageTitle = '';
    editingPage = pages.length - 1;
    showToast('Page added', 'ok');
  }

  function removePage(idx: number) {
    if (pages.length <= 1) { showToast('Need at least one page', 'err'); return; }
    pages.splice(idx, 1);
    if (editingPage >= pages.length) editingPage = pages.length - 1;
    showToast('Page removed', 'ok');
  }

  function setTexture(on: boolean) { bookTexture = on; }

  /* ---------------- image staging ---------------- */
  async function handleImageFiles(files: FileList) {
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue;
      const src = await readFileAsDataURL(f);
      stagedImages.push({ id: uid(), src });
    }
    if (stagedImages.length) {
      placeMode = true;
      placeImageId = stagedImages[stagedImages.length - 1].id;
      showToast(`${stagedImages.length} image(s) ready — click a page to place`, 'ok');
    }
  }

  function readFileAsDataURL(file: File): Promise<string> {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }

  function selectPlaceImage(id: string) { placeImageId = id; placeMode = true; }
  function cancelPlace() { placeMode = false; placeImageId = null; }

  function placeImageOnPage(pageIdx: number) {
    if (!placeImageId || !placeMode) return;
    const staged = stagedImages.find(i => i.id === placeImageId);
    if (!staged) return;
    const page = pages[pageIdx];
    const imgW = 140; const imgH = 140;
    page.images.push({
      id: uid(),
      src: staged.src,
      x: PAGE_W / 2 - imgW / 2,
      y: PAGE_H / 2 - imgH / 2,
      w: imgW, h: imgH,
      caption: ''
    });
    cancelPlace();
    showToast('Image placed on page', 'ok');
  }

  function removePageImage(pageIdx: number, imgId: string) {
    pages[pageIdx].images = pages[pageIdx].images.filter(i => i.id !== imgId);
  }

  /* ---------------- PDF export ---------------- */
  async function exportPdf() {
    if (!pages.length) { showToast('No pages to export', 'err'); return; }

    const pdfDoc = await PDFDocument.create();
    const timesRoman = pdfDoc.embedStandardFont(StandardFonts.TimesRoman);
    const timesRomanBold = pdfDoc.embedStandardFont(StandardFonts.TimesRomanBold);

    for (const page of pages) {
      const pdfPage = pdfDoc.addPage([PAGE_W, PAGE_H]);

      // background
      if (bookTexture) {
        await drawTextureBackground(pdfPage, pdfDoc);
      } else {
        pdfPage.drawRectangle({
          x: 0, y: 0, width: PAGE_W, height: PAGE_H,
          color: rgb(1, 1, 1)
        });
      }

      // page title (top margin)
      pdfPage.drawText(page.title, {
        x: 54, y: PAGE_H - 54,
        size: 16, font: timesRomanBold, color: rgb(0.1, 0.1, 0.1)
      });

      // body text (wrapped)
      const bodyStartY = PAGE_H - 110;
      const maxWidth = PAGE_W - 108;
      const lineHeight = 22;
      let y = bodyStartY;
      const words = page.text.split(/\s+/);
      let line = '';
      for (const word of words) {
        const test = line ? line + ' ' + word : word;
        if (timesRoman.widthOfTextAtSize(test, 12) > maxWidth && line !== '') {
          pdfPage.drawText(line, { x: 54, y, size: 12, font: timesRoman, color: rgb(0.15, 0.15, 0.15) });
          y -= lineHeight;
          line = word;
        } else {
          line = test;
        }
      }
      if (line.trim()) pdfPage.drawText(line, { x: 54, y, size: 12, font: timesRoman, color: rgb(0.15, 0.15, 0.15) });

      // images
      for (const img of page.images) {
        try {
          let embedded;
          if (img.src.startsWith('data:image/png')) embedded = await pdfDoc.embedPng(img.src);
          else if (img.src.startsWith('data:image/jpeg') || img.src.startsWith('data:image/jpg')) embedded = await pdfDoc.embedJpg(img.src);
          else embedded = await pdfDoc.embedPng(img.src);
          const { width, height } = embedded.size();
          // scale to fit requested box, keep aspect
          const scale = Math.min(img.w / width, img.h / height);
          const drawW = width * scale;
          const drawH = height * scale;
          const drawX = img.x + (img.w - drawW) / 2;
          const drawY = PAGE_H - img.y - drawH - (img.h - drawH) / 2; // pdf-lib y is from bottom
          pdfPage.drawImage(embedded, {
            x: drawX, y: drawY, width: drawW, height: drawH
          });
          if (img.caption) {
            pdfPage.drawText(img.caption, {
              x: drawX, y: drawY - 14, size: 10, font: timesRoman, color: rgb(0.3, 0.3, 0.3)
            });
          }
        } catch (e) {
          console.error('embed image failed', e);
        }
      }
    }

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes as unknown as ArrayBuffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${bookTitle.replace(/\s+/g, '_')}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('PDF exported', 'ok');
  }

  async function drawTextureBackground(page: any, pdfDoc: any) {
    // generate a parchment texture as a small png drawn tiled
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    // base parchment
    ctx.fillStyle = '#f5f0dc';
    ctx.fillRect(0, 0, 256, 256);
    // noise
    const img = ctx.getImageData(0, 0, 256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 24;
      img.data[i] = Math.min(255, Math.max(0, img.data[i] + n));
      img.data[i+1] = Math.min(255, Math.max(0, img.data[i+1] + n));
      img.data[i+2] = Math.min(255, Math.max(0, img.data[i+2] - 6));
    }
    ctx.putImageData(img, 0, 0);
    // slight vignette
    const grad = ctx.createRadialGradient(128, 128, 40, 128, 128, 200);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.08)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    const png = await pdfDoc.embedPng(canvas.toDataURL());
    const { width, height } = png.size();
    // tile across page
    const tx = PAGE_W / width + 1;
    const ty = PAGE_H / height + 1;
    for (let iy = 0; iy < ty; iy++) {
      for (let ix = 0; ix < tx; ix++) {
        page.drawImage(png, { x: ix * width, y: iy * height, width, height });
      }
    }
    // paper edge shadow
    page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: rgb(0,0,0), opacity: 0.02 });
  }

  /* ---------------- lifecycle ---------------- */
  onMount(() => {
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      if (dragImage && dragTargetPage !== null) {
        const page = pages[dragTargetPage];
        page.images.push({
          id: uid(),
          src: dragImage.src,
          x: 100, y: 100, w: 160, h: 160,
          caption: ''
        });
        dragImage = null; dragTargetPage = null;
        showToast('Image dropped on page', 'ok');
      }
    });
  });

  onDestroy(() => {
    window.removeEventListener('dragover', (e) => e.preventDefault());
    window.removeEventListener('drop', (e) => e.preventDefault());
  });
</script>

<div class="book-editor">
  <!-- header / toolbar -->
  <header class="be-toolbar">
    <div class="be-title">
      <label>Book title</label>
      <input bind:value={bookTitle} placeholder="My Story" />
    </div>

    <div class="be-controls">
      <button class="be-btn be-btn-text" onclick={addPage} title="Add page">+ Page</button>
      <button class="be-btn be-btn-toggle" class:active={bookTexture} onclick={() => setTexture(!bookTexture)} title="Toggle book texture">
        {bookTexture ? '📖 Texture On' : '📄 Clean'}
      </button>
      <button class="be-btn be-btn-primary" onclick={exportPdf} title="Export PDF">📤 Export PDF</button>
    </div>
  </header>

  {#if toast}
    <div class="be-toast class:type={toast.type}">{toast.msg}</div>
  {/if}

  <div class="be-body">
    <!-- left: page stack -->
    <aside class="be-sidebar">
      <div class="be-pages">
        {#each pages as page, idx (page.id)}
          <button
            class="be-page-thumb class:active={editingPage === idx}"
            onclick={() => { editingPage = idx; placeMode = false; }}
          >
            <div class="be-thumb-inner class:texture={bookTexture}">
              <div class="be-thumb-title">{page.title}</div>
              <div class="be-thumb-text">{page.text.slice(0, 60)}</div>
              {#if page.images.length}
                <div class="be-thumb-imgs">
                  {#each page.images as img}
                    <img src={img.src} class="be-thumb-img" />
                  {/each}
                </div>
              {/if}
            </div>
          </button>
        {/each}
        <button class="be-page-thumb be-btn-add" onclick={addPage}>+</button>
      </div>

      <div class="be-notes">
        <h3>Image Notices</h3>
        <p>Upload images, then click a page (or drag) to place them as margin art / full-page illustrations.</p>
        <input type="file" accept="image/*" multiple onchange={(e) => handleImageFiles((e.target as HTMLInputElement).files!)} class="be-file-input" />
        {#if stagedImages.length}
          <div class="be-staged">
            <span>Staged: </span>
            {#each stagedImages as img}
              <button class="be-staged-item class:active={placeImageId === img.id}" onclick={() => selectPlaceImage(img.id)}>
                <img src={img.src} class="be-staged-thumb" />
              </button>
            {/each}
            <button class="be-btn be-btn-text" onclick={cancelPlace}>Cancel placement</button>
          </div>
          {#if placeMode}
            <div class="be-place-hint">Click any page to place the selected image.</div>
          {/if}
        {/if}
      </div>
    </aside>

    <!-- right: editor -->
    <section class="be-stage">
      {#if pages.length}
        <div
          class="be-page-wrap class:texture={bookTexture}"
          ondrop={(e) => {
            e.preventDefault();
            if (dragImage) {
              pages[editingPage].images.push({
                id: uid(), src: dragImage.src,
                x: 200, y: 200, w: 150, h: 150,
                caption: ''
              });
              dragImage = null;
              showToast('Image placed', 'ok');
            }
          }}
          ondragover={(e) => e.preventDefault()}
          ondragenter={(e) => { e.preventDefault(); dragTargetPage = editingPage; }}
          ondragleave={() => { dragTargetPage = null; }}
        >
          <div class="be-page class:texture={bookTexture}" style="--scale:1;">
            <div class="be-page-inner">
              <h1 class="be-page-title" contenteditable="true" spellcheck="true"
                oninput={(e) => pages[editingPage].title = (e.target as HTMLElement).innerText}
              >
                {pages[editingPage].title}
              </h1>

              <div class="be-page-body" contenteditable="true" spellcheck="true"
                oninput={(e) => pages[editingPage].text = (e.target as HTMLElement).innerText}
              >
                {pages[editingPage].text}
              </div>

              <!-- placed images on this page -->
              {#each pages[editingPage].images as img, i (img.id)}
                <div
                  class="be-page-img"
                  style="left:{img.x}px; top:{img.y}px; width:{img.w}px; height:{img.h}px;"
                  ondragstart={(e) => { dragImage = img; e.dataTransfer?.setData('text/plain', img.id); }}
                  ondragover={(e) => e.preventDefault()}
                  ondrop={(e) => {
                    e.preventDefault();
                    // reorder / swap handled simply: update position to drop offset
                    const rect = (e.target as HTMLElement).getBoundingClientRect();
                    img.x = e.clientX - rect.left - img.w / 2;
                    img.y = e.clientY - rect.top - img.h / 2;
                  }}
                >
                  <img src={img.src} class="be-page-img-img" />
                  {#if img.caption}
                    <div class="be-page-img-caption">{img.caption}</div>
                  {/if}
                  <button class="be-page-img-remove" onclick={(e) => { e.stopPropagation(); removePageImage(editingPage, img.id); }}>×</button>
                </div>
              {/each}
            </div>
          </div>

          {#if placeMode}
            <div class="be-place-overlay">Click the page to place selected image.</div>
          {/if}
        </div>
      {/if}
    </section>
  </div>

  <style>
    .book-editor { display: flex; flex-direction: column; height: 100vh; overflow: hidden; font-family: ui-serif, Georgia, serif; color: var(--text-1); }

    /* toolbar */
    .be-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 20px; background: var(--bg-2); border-bottom: 1px solid var(--border); }
    .be-title { display: flex; align-items: center; gap: 8px; font-weight: 600; }
    .be-title label { font-size: 12px; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.05em; }
    .be-title input { font: inherit; background: transparent; border: 1px solid var(--border); color: var(--text-1); padding: 4px 10px; border-radius: 6px; min-width: 160px; }
    .be-controls { display: flex; gap: 8px; }
    .be-btn { border: 1px solid var(--border); background: var(--bg-3); color: var(--text-1); padding: 6px 12px; border-radius: 6px; cursor: pointer; font: inherit; font-size: 13px; }
    .be-btn:hover { background: var(--hover); }
    .be-btn-primary { background: var(--accent); color: white; border-color: var(--accent); }
    .be-btn-primary:hover { filter: brightness(1.1); }
    .be-btn-text { background: transparent; border-color: transparent; }
    .be-btn-toggle.active { background: var(--accent); color: white; border-color: var(--accent); }

    .be-toast { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); padding: 8px 14px; border-radius: 6px; color: white; font-size: 13px; z-index: 50; pointer-events: none; }
    .be-toast.ok { background: var(--green); }
    .be-toast.err { background: var(--red); }

    /* body */
    .be-body { display: flex; flex: 1; overflow: hidden; }

    /* sidebar */
    .be-sidebar { width: 320px; border-right: 1px solid var(--border); background: var(--bg-2); overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 16px; flex-shrink: 0; }
    .be-pages { display: flex; flex-direction: column; gap: 8px; }
    .be-page-thumb { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--border); background: var(--bg-3); border-radius: 8px; cursor: pointer; text-align: left; }
    .be-page-thumb.active { border-color: var(--accent); background: var(--hover); }
    .be-page-thumb.be-btn-add { justify-content: center; font-size: 24px; padding: 4px; }
    .be-thumb-inner { flex: 1; min-width: 0; }
    .be-thumb-inner.texture { background: linear-gradient(#f5f0dc 60%, #e8dfc8 100%); border-radius: 4px; padding: 6px; box-shadow: inset 0 0 6px rgba(0,0,0,0.1); }
    .be-thumb-title { font-weight: 600; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .be-thumb-text { font-size: 11px; color: var(--text-3); overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
    .be-thumb-imgs { display: flex; gap: 4px; margin-top: 6px; }
    .be-thumb-img { width: 24px; height: 24px; border-radius: 3px; object-fit: cover; border: 1px solid var(--border); }

    .be-notes h3 { margin: 0 0 6px 0; font-size: 15px; }
    .be-notes p { font-size: 12.5px; color: var(--text-3); margin: 0 0 10px 0; line-height: 1.5; }
    .be-file-input { font-size: 12px; color: var(--text-2); margin-bottom: 10px; }
    .be-staged { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
    .be-staged-item { border: 2px solid transparent; border-radius: 6px; overflow: hidden; cursor: pointer; }
    .be-staged-item.active { border-color: var(--accent); }
    .be-staged-thumb { width: 40px; height: 40px; object-fit: cover; display: block; }
    .be-place-hint { font-size: 12px; color: var(--accent); margin-top: 6px; }

    /* stage */
    .be-stage { flex: 1; overflow-y: auto; background: var(--bg-1); padding: 32px 40px; display: flex; justify-content: center; }

    .be-page-wrap { display: flex; flex-direction: column; align-items: center; gap: 18px; max-width: 100%; }
    .be-page-wrap.texture { gap: 10px; }

    .be-page { position: relative; width: 612px; height: 792px; background: #fff; box-shadow: 0 10px 30px rgba(0,0,0,0.18); border-radius: 6px; overflow: hidden; page-break-after: always; }
    .be-page.texture {
      background:
        linear-gradient(rgba(0,0,0,0.03) 0%, rgba(0,0,0,0) 55%),
        repeating-linear-gradient(#f5f0dc, #f5f0dc 1px, transparent 1px, transparent 256px),
        #f4efe1;
      box-shadow: 0 14px 34px rgba(0,0,0,0.35), inset 0 0 20px rgba(0,0,0,0.06);
      border: 1px solid rgba(0,0,0,0.12);
    }
    .be-page-inner { padding: 72px 72px 96px 72px; height: 100%; box-sizing: border-box; position: relative; }

    .be-page-title { font-size: 20px; font-weight: 700; margin: 0 0 18px 0; color: #1a1a1a; outline: none; }
    .be-page.texture .be-page-title { color: #4a3a2a; text-shadow: 0 1px 0 rgba(255,255,255,0.6); }

    .be-page-body { font-size: 15px; line-height: 1.85; color: #222; outline: none; min-height: 400px; white-space: pre-wrap; }
    .be-page.texture .be-page-body { color: #3e3325; text-shadow: 0 1px 0 rgba(255,255,255,0.55); }

    /* images on page */
    .be-page-img { position: absolute; border: 2px solid rgba(255,255,255,0.9); box-shadow: 0 4px 10px rgba(0,0,0,0.25); border-radius: 4px; overflow: hidden; background: #fff; cursor: move; touch-action: none; }
    .be-page.texture .be-page-img { border-color: rgba(255,255,255,0.85); box-shadow: 0 6px 14px rgba(0,0,0,0.35); }
    .be-page-img-img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .be-page-img-remove { position: absolute; top: -8px; right: -8px; width: 20px; height: 20px; border-radius: 50%; background: #ff4d4d; color: white; border: none; font-size: 14px; line-height: 1; cursor: pointer; z-index: 2; }
    .be-page-img-caption { position: absolute; bottom: -16px; left: 0; right: 0; font-size: 11px; color: var(--text-3); text-align: center; pointer-events: none; }

    .be-place-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.15); display: flex; align-items: center; justify-content: center; color: var(--text-2); font-size: 15px; z-index: 5; cursor: pointer; }
  </style>
</div>
