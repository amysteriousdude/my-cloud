// hello there, tf u doing on my code????
import type { Cookies } from '@sveltejs/kit';
import { encrypt, decrypt } from './crypto';
import {
  downloadFileFromTelegram,
  uploadBytesToTelegram,
  deleteTelegramMessage,
  saveRecord,
  getRecordByApiKey,
  type ApiKeyRecord,
} from './telegramStorage';

export type StoredPasskey = {
  id: string;
  publicKey: string;
  counter: number;
  transports?: string[];
  label: string;
  createdAt: string;
};

function b64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const b = Buffer.from(s, 'base64url');
  const out = new Uint8Array(b.byteLength);
  out.set(b);
  return out;
}

export function toStored(
  credential: { id: string; publicKey: Uint8Array | Uint8Array<ArrayBuffer>; counter: number; transports?: string[] },
  label: string
): StoredPasskey {
  return {
    id: credential.id,
    publicKey: b64url(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports ?? [],
    label,
    createdAt: new Date().toISOString(),
  };
}

export type AuthBlob = {
  creds: StoredPasskey[];
  totp?: string;
};

export async function loadAuthBlob(rec: ApiKeyRecord): Promise<AuthBlob> {
  if (!rec.passkeys?.fileId) return { creds: [] };
  const { data } = await downloadFileFromTelegram(rec.passkeys.fileId);
  const json = decrypt(data.toString('utf8'));
  if (!json) return { creds: [] };
  try {
    const blob = JSON.parse(json);
    return {
      creds: Array.isArray(blob.creds) ? blob.creds : [],
      totp: typeof blob.totp === 'string' && blob.totp ? blob.totp : undefined,
    };
  } catch {
    return { creds: [] };
  }
}

export async function saveAuthBlob(rec: ApiKeyRecord, blob: AuthBlob): Promise<void> {
  const oldMsgId = rec.passkeys?.messageId;
  if (!blob.creds.length && !blob.totp) {
    if (oldMsgId) await deleteTelegramMessage(oldMsgId);
    delete rec.passkeys;
    await saveRecord(rec);
    return;
  }
  const encrypted = encrypt(JSON.stringify({ creds: blob.creds, totp: blob.totp ?? null }));
  const buf = Buffer.from(encrypted, 'utf8');
  const { message_id, file_id } = await uploadBytesToTelegram(buf, 'passkeys.enc');
  rec.passkeys = { fileId: file_id, messageId: message_id };
  await saveRecord(rec);
  if (oldMsgId && oldMsgId !== message_id) {
    await deleteTelegramMessage(oldMsgId);
  }
}

export async function loadPasskeys(rec: ApiKeyRecord): Promise<StoredPasskey[]> {
  return (await loadAuthBlob(rec)).creds;
}

export async function savePasskeys(rec: ApiKeyRecord, creds: StoredPasskey[]): Promise<void> {
  const blob = await loadAuthBlob(rec).catch(() => ({ creds: [] as StoredPasskey[] }));
  await saveAuthBlob(rec, { creds, totp: blob.totp });
}

export function setChallenge(cookies: Cookies, challenge: string, type: 'reg' | 'auth'): void {
  cookies.set('webauthn_chal', JSON.stringify({ c: challenge, t: type }), {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 300,
  });
}

export function takeChallenge(cookies: Cookies, type: 'reg' | 'auth'): string | null {
  const raw = cookies.get('webauthn_chal');
  cookies.delete('webauthn_chal', { path: '/' });
  if (!raw) return null;
  try {
    const { c, t } = JSON.parse(raw);
    return t === type && typeof c === 'string' ? c : null;
  } catch {
    return null;
  }
}

export { fromB64url, b64url };

export async function sessionRec(cookies: Cookies): Promise<ApiKeyRecord | null> {
  const session = cookies.get('session');
  const apiKey = session ? decrypt(session) : null;
  if (!apiKey) return null;
  try {
    return await getRecordByApiKey(apiKey);
  } catch {
    return null;
  }
}
