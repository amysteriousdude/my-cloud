<!-- hello there, tf u doing on my code???? -->
<!-- src/lib/components/Login.svelte -->
<script lang="ts">
  import CloudLogo from '$lib/components/icons/CloudLogo.svelte';
  import { branding } from '$lib/branding.svelte';
  import { startAuthentication, browserSupportsWebAuthn } from '@simplewebauthn/browser';
  import { IconKey, IconChevronDown, IconChevronUp } from '@tabler/icons-svelte';

  let {
    onsuccess,
  }: {
    onsuccess: () => void;
  } = $props();

  let tokenInput = $state('');
  let tokenError = $state('');
  let tokenLoading = $state(false);
  let passkeyLoading = $state(false);
  let passkeyError = $state('');
  let showToken = $state(false);

  const passkeysOk = browserSupportsWebAuthn();

  async function submit() {
    tokenError = '';
    tokenLoading = true;
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: tokenInput.trim() }),
      });
      const d = await res.json();
      if (!res.ok) { tokenError = d.error ?? 'Invalid token'; return; }
      onsuccess();
    } catch {
      tokenError = 'Something went wrong';
    } finally {
      tokenLoading = false;
    }
  }

  async function passkeyLogin() {
    passkeyError = '';
    passkeyLoading = true;
    try {
      const optRes = await fetch('/api/auth/webauthn/login/options', { method: 'POST' });
      const options = await optRes.json().catch(() => ({}));
      if (!optRes.ok) throw new Error(options.error ?? 'No passkeys registered');

      const cred = await startAuthentication(options);

      const verifyRes = await fetch('/api/auth/webauthn/login/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cred),
      });
      const d = await verifyRes.json().catch(() => ({}));
      if (!verifyRes.ok) throw new Error(d.error ?? 'Verification failed');
      onsuccess();
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.name === 'NotAllowedError') return;
      passkeyError = err?.message ?? 'Passkey login failed';
    } finally {
      passkeyLoading = false;
    }
  }
</script>

<div class="centered">
  <div class="login-card">
    <div class="logo">
      <CloudLogo size={40} stroke={1.5} />
      <h1>{branding.name}'s Cloud</h1>
    </div>

    {#if passkeysOk}
      <button class="passkey-btn" onclick={passkeyLogin} disabled={passkeyLoading || tokenLoading}>
        <IconKey size={18} stroke={1.8} />
        {passkeyLoading ? 'Waiting for authenticator…' : 'Sign in with passkey'}
      </button>
      <p class="passkey-hint">Face ID, fingerprint, or a security key</p>
      {#if passkeyError}<p class="login-error">{passkeyError}</p>{/if}
    {/if}

    <button class="token-toggle" onclick={() => { showToken = !showToken; tokenError = ''; }} disabled={passkeyLoading || tokenLoading}>
      {#if showToken}
        <IconChevronUp size={14} /> Hide token login
      {:else}
        <IconChevronDown size={14} /> Use API token instead
      {/if}
    </button>

    {#if showToken || !passkeysOk}
      <div class="token-form">
        <input
          class="token-input"
          type="password"
          placeholder="Paste your token..."
          bind:value={tokenInput}
          onkeydown={(e) => e.key === 'Enter' && submit()}
          disabled={tokenLoading || passkeyLoading}
        />
        <button
          class="token-btn"
          onclick={submit}
          disabled={tokenLoading || passkeyLoading || !tokenInput.trim()}
        >{tokenLoading ? '...' : 'Continue →'}</button>
      </div>
      {#if tokenError}<p class="login-error">{tokenError}</p>{/if}
    {/if}
  </div>
</div>

<style>
  .centered {
    display: flex; align-items: center; justify-content: center;
    min-height: 100vh; padding: 20px;
  }
  .login-card {
    display: flex; flex-direction: column; align-items: center;
    gap: 16px; padding: 48px 40px;
    background: var(--bg-2); border: 1px solid var(--border);
    border-radius: 16px; width: 100%; max-width: 400px;
  }
  .logo {
    display: flex; flex-direction: column; align-items: center;
    gap: 8px; text-align: center; color: var(--text-1);
    margin-bottom: 8px;
  }
  .logo h1 { font-size: 20px; font-weight: 600; letter-spacing: -0.5px; margin: 0; }
  .passkey-btn {
    width: 100%; display: flex; align-items: center; justify-content: center; gap: 10px;
    background: var(--accent); border: none; border-radius: 12px;
    padding: 16px; color: #fff;
    font: inherit; font-size: 15px; font-weight: 600; cursor: pointer;
    transition: filter 0.15s, transform 0.1s;
  }
  .passkey-btn:hover:not(:disabled) { filter: brightness(1.1); }
  .passkey-btn:active:not(:disabled) { transform: scale(0.98); }
  .passkey-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .passkey-hint { font-size: 12px; color: var(--text-3); margin: -6px 0 0; }
  .token-toggle {
    display: flex; align-items: center; gap: 5px;
    background: none; border: none; padding: 6px 8px;
    color: var(--text-3); font: inherit; font-size: 12.5px;
    cursor: pointer; border-radius: 6px; transition: color 0.15s;
  }
  .token-toggle:hover:not(:disabled) { color: var(--text-1); }
  .token-toggle:disabled { opacity: 0.4; cursor: not-allowed; }
  .token-form {
    display: flex; flex-direction: column; gap: 8px; width: 100%;
    padding-top: 8px; border-top: 1px solid var(--border);
  }
  .token-input {
    background: var(--bg-1); border: 1px solid var(--border);
    border-radius: 9px; padding: 11px 14px;
    color: var(--text-1); font-size: 14px;
    font-family: 'Geist Mono', monospace; outline: none;
    width: 100%; transition: border-color 0.15s;
  }
  .token-input:focus { border-color: var(--border-hover); }
  .token-input::placeholder { color: var(--text-3); }
  .token-btn {
    background: var(--bg-3); border: 1px solid var(--border);
    border-radius: 9px; padding: 11px; color: var(--text-1);
    font-size: 14px; font-family: 'Geist', sans-serif;
    font-weight: 500; cursor: pointer; transition: background 0.15s;
  }
  .token-btn:hover:not(:disabled) { background: var(--border); }
  .token-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .login-error { font-size: 12px; color: var(--red); margin: 0; text-align: center; }
</style>
