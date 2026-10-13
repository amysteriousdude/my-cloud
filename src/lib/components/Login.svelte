<!-- hello there, tf u doing on my code???? -->
<!-- src/lib/components/Login.svelte -->
<script lang="ts">
  import CloudLogo from '$lib/components/icons/CloudLogo.svelte';
  import { branding } from '$lib/branding.svelte';
  import { startAuthentication, browserSupportsWebAuthn } from '@simplewebauthn/browser';
  import { IconKey, IconChevronDown, IconChevronUp, IconShieldCheck } from '@tabler/icons-svelte';

  let {
    onsuccess,
  }: {
    onsuccess: () => void;
  } = $props();

  let tokenInput = $state('');
  let totpCode = $state('');
  let totpRequired = $state(false);
  let tokenError = $state('');
  let tokenLoading = $state(false);
  let passkeyLoading = $state(false);
  let passkeyError = $state('');
  let showToken = $state(false);
  let showTotp = $state(false);
  let totpLoginCode = $state('');
  let totpLoginError = $state('');
  let totpLoginLoading = $state(false);

  const passkeysOk = browserSupportsWebAuthn();

  async function submit() {
    tokenError = '';
    tokenLoading = true;
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: tokenInput.trim(), code: totpCode.trim() || undefined }),
      });
      const d = await res.json();
      if (!res.ok) {
        if (d.totpRequired) totpRequired = true;
        tokenError = d.error ?? 'Invalid token';
        return;
      }
      onsuccess();
    } catch {
      tokenError = 'Something went wrong';
    } finally {
      tokenLoading = false;
    }
  }

  function discordLogin() {
    window.location.href = '/api/auth/discord/start';
  }

  async function totpLogin() {
    totpLoginError = '';
    const code = totpLoginCode.trim();
    if (!/^\d{6}$/.test(code)) {
      totpLoginError = 'Enter the 6-digit code';
      return;
    }
    totpLoginLoading = true;
    try {
      const res = await fetch('/api/auth/totp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', code }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? 'Verification failed');
      onsuccess();
    } catch (err: any) {
      totpLoginError = err?.message ?? 'Wrong code';
    } finally {
      totpLoginLoading = false;
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

    <button class="discord-btn" onclick={discordLogin} disabled={passkeyLoading || tokenLoading || totpLoginLoading}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
      </svg>
      Sign in with Discord
    </button>

    <button class="totp-toggle" onclick={() => { showTotp = !showTotp; totpLoginError = ''; totpLoginCode = ''; }} disabled={passkeyLoading || tokenLoading || totpLoginLoading}>
      {#if showTotp}
        <IconChevronUp size={14} /> Hide authenticator login
      {:else}
        <IconShieldCheck size={14} /> Sign in with authenticator code
      {/if}
    </button>

    {#if showTotp}
      <div class="token-form">
        <input
          class="token-input totp-code-input"
          type="text"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="6"
          placeholder="6-digit code"
          bind:value={totpLoginCode}
          onkeydown={(e) => e.key === 'Enter' && totpLogin()}
          disabled={totpLoginLoading}
        />
        <button class="token-btn" onclick={totpLogin} disabled={totpLoginLoading || totpLoginCode.trim().length !== 6}>
          {totpLoginLoading ? '...' : 'Continue →'}
        </button>
      </div>
      {#if totpLoginError}<p class="login-error">{totpLoginError}</p>{/if}
    {/if}

    <button class="token-toggle" onclick={() => { showToken = !showToken; tokenError = ''; }} disabled={passkeyLoading || tokenLoading || totpLoginLoading}>
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
          onkeydown={(e) => e.key === 'Enter' && !totpRequired && submit()}
          disabled={tokenLoading || passkeyLoading || totpLoginLoading}
        />
        {#if totpRequired}
          <input
            class="token-input totp-input"
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6"
            placeholder="6-digit authenticator code"
            bind:value={totpCode}
            onkeydown={(e) => e.key === 'Enter' && submit()}
            disabled={tokenLoading || passkeyLoading || totpLoginLoading}
          />
        {/if}
        <button
          class="token-btn"
          onclick={submit}
          disabled={tokenLoading || passkeyLoading || totpLoginLoading || !tokenInput.trim() || (totpRequired && totpCode.trim().length !== 6)}
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
  .discord-btn {
    width: 100%; display: flex; align-items: center; justify-content: center; gap: 10px;
    background: #5865F2; border: none; border-radius: 12px;
    padding: 14px; color: #fff;
    font: inherit; font-size: 14px; font-weight: 600; cursor: pointer;
    transition: filter 0.15s, transform 0.1s;
  }
  .discord-btn:hover:not(:disabled) { filter: brightness(1.1); }
  .discord-btn:active:not(:disabled) { transform: scale(0.98); }
  .discord-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .token-toggle {
    display: flex; align-items: center; gap: 5px;
    background: none; border: none; padding: 6px 8px;
    color: var(--text-3); font: inherit; font-size: 12.5px;
    cursor: pointer; border-radius: 6px; transition: color 0.15s;
  }
  .token-toggle:hover:not(:disabled) { color: var(--text-1); }
  .token-toggle:disabled { opacity: 0.4; cursor: not-allowed; }
  .totp-toggle {
    display: flex; align-items: center; gap: 6px;
    background: none; border: none; padding: 8px 10px;
    color: var(--text-3); font: inherit; font-size: 13px;
    cursor: pointer; border-radius: 8px; transition: color 0.15s, background 0.15s;
  }
  .totp-toggle:hover:not(:disabled) { color: var(--text-1); background: var(--bg-3); }
  .totp-toggle:disabled { opacity: 0.4; cursor: not-allowed; }
  .totp-code-input {
    text-align: center; font-size: 20px; letter-spacing: 8px;
    font-variant-numeric: tabular-nums;
  }
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
