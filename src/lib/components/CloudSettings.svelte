<!-- hello there, tf u doing on my code???? -->
<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { env } from '$env/dynamic/public';
  import {
    IconCopy, IconCheck, IconTrash, IconRefresh, IconUpload, IconAlertTriangle,
  } from '@tabler/icons-svelte';
  import { branding, saveBranding } from '$lib/branding.svelte';
  import { CLOUD_ICONS, CLOUD_ICON_KEYS } from '$lib/cloudIcons';
  import CloudLogo from '$lib/components/icons/CloudLogo.svelte';
  import Avatar from '$lib/components/Avatar.svelte';

  let {
    user,
  }: { user: { username: string; discordId: string; createdAt: string } | null } = $props();

  let displayName = $state(branding.name);
  let username = $state(user?.username ?? '');
  let userMsg = $state<{ ok: boolean; text: string } | null>(null);
  let busy = $state(false);
  let newToken = $state<string | null>(null);
  let tokenCopied = $state(false);

  $effect(() => {
    displayName = branding.name;
  });

  function saveName() {
    saveBranding({ name: displayName });
  }

  function resetName() {
    displayName = env.PUBLIC_NAME ?? 'Omar';
    saveBranding({ name: displayName });
  }

  function pickIcon(key: string) {
    saveBranding({ icon: key });
  }

  function onPfp(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const size = 160;
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d');
      if (ctx) {
        const s = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        saveBranding({ pfp: c.toDataURL('image/jpeg', 0.85) });
      }
      URL.revokeObjectURL(url);
      input.value = '';
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  }

  function removePfp() {
    saveBranding({ pfp: '' });
  }

  async function saveUsername() {
    if (!username.trim() || busy) return;
    busy = true;
    userMsg = null;
    try {
      const res = await fetch('/api/auth/username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      userMsg = { ok: true, text: 'Username saved' };
      await invalidateAll();
    } catch (err: any) {
      userMsg = { ok: false, text: err?.message ?? 'Failed to save' };
    } finally {
      busy = false;
    }
  }

  async function resetToken() {
    if (busy) return;
    if (!confirm('Reset your token? The old token stops working immediately. Save the new one — it is only shown once.')) return;
    busy = true;
    userMsg = null;
    newToken = null;
    tokenCopied = false;
    try {
      const res = await fetch('/api/auth/reset-token', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      newToken = data.apiKey;
      userMsg = { ok: true, text: 'Token reset — copy it now' };
    } catch (err: any) {
      userMsg = { ok: false, text: err?.message ?? 'Failed to reset' };
    } finally {
      busy = false;
    }
  }

  async function copyToken() {
    if (!newToken) return;
    try {
      await navigator.clipboard.writeText(newToken);
      tokenCopied = true;
      setTimeout(() => (tokenCopied = false), 1500);
    } catch {
      /* clipboard blocked */
    }
  }
</script>

<section class="cs">
  <div class="cs-card">
    <h3 class="cs-h">Appearance</h3>

    <div class="cs-row">
      <div class="cs-preview">
        <div class="cs-avatar"><Avatar name={user?.username ?? '?'} /></div>
        <div class="cs-logo"><CloudLogo size={22} /></div>
      </div>
      <div class="cs-fields">
        <label class="cs-label">Display name</label>
        <div class="cs-inline">
          <input class="cs-input" type="text" maxlength="32" bind:value={displayName} placeholder={env.PUBLIC_NAME ?? 'Omar'} />
          <button class="cs-btn" onclick={saveName} disabled={busy || displayName.trim() === branding.name}>Save</button>
          <button class="cs-btn cs-btn-ghost" onclick={resetName} title="Reset to default">Default</button>
        </div>
        <span class="cs-hint">Shown as <b>{branding.name}'s Cloud</b> in the sidebar, dock and title.</span>
      </div>
    </div>

    <div class="cs-row cs-row-col">
      <label class="cs-label">Logo</label>
      <div class="cs-icons">
        {#each CLOUD_ICON_KEYS as key (key)}
          <button class="cs-icon" class:cs-icon-active={branding.icon === key} onclick={() => pickIcon(key)} title={key}>
            {@const I = CLOUD_ICONS[key]}
            <I size={18} stroke={1.6} />
          </button>
        {/each}
      </div>
    </div>

    <div class="cs-row cs-row-col">
      <label class="cs-label">Profile picture</label>
      <div class="cs-inline">
        <label class="cs-btn">
          <IconUpload size={14} /> Upload
          <input class="cs-file" type="file" accept="image/*" onchange={onPfp} />
        </label>
        {#if branding.pfp}
          <button class="cs-btn cs-btn-ghost" onclick={removePfp}><IconTrash size={14} /> Remove</button>
        {/if}
        <span class="cs-hint">{branding.pfp ? 'Using your picture everywhere.' : 'No picture — using the first letter of your name.'}</span>
      </div>
    </div>
  </div>

  <div class="cs-card">
    <h3 class="cs-h">Account</h3>

    <div class="cs-row cs-row-col">
      <label class="cs-label">Username</label>
      <div class="cs-inline">
        <input class="cs-input" type="text" maxlength="32" bind:value={username} />
        <button class="cs-btn" onclick={saveUsername} disabled={busy || !username.trim() || username.trim() === user?.username}>Save</button>
      </div>
      {#if user}
        <span class="cs-hint">Discord ID: <b>{user.discordId}</b> · joined {new Date(user.createdAt).toLocaleDateString()}</span>
      {/if}
    </div>

    <div class="cs-row cs-row-col">
      <label class="cs-label">Token</label>
      <div class="cs-inline">
        <button class="cs-btn cs-btn-danger" onclick={resetToken} disabled={busy}>
          <IconRefresh size={14} /> Reset token
        </button>
      </div>
      <span class="cs-hint">Used to sign in outside this browser and in the ShareX config. Resetting kills the old one instantly.</span>
      {#if newToken}
        <div class="cs-token">
          <code class="cs-token-val">{newToken}</code>
          <button class="cs-btn" onclick={copyToken} title="Copy">
            {#if tokenCopied}<IconCheck size={14} />{:else}<IconCopy size={14} />{/if}
          </button>
        </div>
      {/if}
    </div>

    {#if userMsg}
      <div class="cs-msg" class:cs-msg-bad={!userMsg.ok}>
        {#if !userMsg.ok}<IconAlertTriangle size={14} />{/if}
        {userMsg.text}
      </div>
    {/if}
  </div>
</section>

<style>
  .cs { display: flex; flex-direction: column; gap: 16px; }
  .cs-card { background: var(--bg-2); border: 1px solid var(--border); border-radius: 14px; padding: 20px; }
  .cs-h { margin: 0 0 16px; font-size: 13px; font-weight: 700; color: var(--text-1); letter-spacing: .02em; text-transform: uppercase; }
  .cs-row { display: flex; gap: 16px; align-items: flex-start; padding: 12px 0; border-top: 1px solid var(--border); }
  .cs-card .cs-row:first-of-type { border-top: none; padding-top: 0; }
  .cs-row-col { flex-direction: column; gap: 8px; }
  .cs-preview { display: flex; flex-direction: column; gap: 8px; align-items: center; flex-shrink: 0; }
  .cs-avatar {
    width: 44px; height: 44px; border-radius: 12px; overflow: hidden;
    background: var(--accent); color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-size: 17px; font-weight: 700; flex-shrink: 0;
  }
  .cs-logo { display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; border: 1px solid var(--border); border-radius: 12px; background: var(--bg-3); color: var(--text-1); }
  .cs-fields { display: flex; flex-direction: column; gap: 7px; min-width: 0; flex: 1; }
  .cs-label { font-size: 12px; font-weight: 600; color: var(--text-2); }
  .cs-inline { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .cs-input {
    flex: 1; min-width: 140px; max-width: 260px;
    background: var(--bg-3); border: 1px solid var(--border); border-radius: 8px;
    color: var(--text-1); font: inherit; font-size: 13px; padding: 7px 10px; outline: none;
  }
  .cs-input:focus { border-color: var(--accent); }
  .cs-btn {
    display: inline-flex; align-items: center; gap: 6px;
    background: var(--accent); color: #fff; border: none; border-radius: 8px;
    font: inherit; font-size: 12.5px; font-weight: 600; padding: 7px 12px; cursor: pointer;
    transition: filter .15s, opacity .15s;
  }
  .cs-btn:hover:not(:disabled) { filter: brightness(1.1); }
  .cs-btn:disabled { opacity: .45; cursor: default; }
  .cs-btn-ghost { background: var(--bg-3); color: var(--text-2); border: 1px solid var(--border); }
  .cs-btn-danger { background: #dc2626; }
  .cs-hint { font-size: 11.5px; color: var(--text-3); line-height: 1.45; }
  .cs-hint b { color: var(--text-2); font-weight: 600; }
  .cs-icons { display: flex; gap: 8px; flex-wrap: wrap; }
  .cs-icon {
    display: flex; align-items: center; justify-content: center;
    width: 38px; height: 38px; border-radius: 10px; cursor: pointer;
    background: var(--bg-3); border: 1px solid var(--border); color: var(--text-2);
    transition: all .15s;
  }
  .cs-icon:hover { border-color: var(--border-hover); color: var(--text-1); }
  .cs-icon-active { background: var(--accent); border-color: var(--accent); color: #fff; }
  .cs-file { display: none; }
  .cs-token {
    display: flex; gap: 8px; align-items: center; width: 100%;
    background: var(--bg-3); border: 1px dashed var(--accent); border-radius: 8px; padding: 8px 10px;
  }
  .cs-token-val {
    flex: 1; font-family: 'Geist Mono', monospace; font-size: 12px;
    color: var(--text-1); word-break: break-all;
  }
  .cs-msg {
    display: flex; align-items: center; gap: 6px; margin-top: 12px;
    font-size: 12.5px; color: #16a34a;
  }
  .cs-msg-bad { color: #dc2626; }
</style>
