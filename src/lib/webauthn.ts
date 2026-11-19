// Passkeys на стороне браузера. Без библиотек: нужно только перевести
// base64url ↔ ArrayBuffer, остальное делает navigator.credentials.

const b64urlToBuf = (s: string): ArrayBuffer => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
};

const bufToB64url = (b: ArrayBuffer | null): string => {
  if (!b) return '';
  const bytes = new Uint8Array(b);
  let bin = '';
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const passkeysSupported = (): boolean =>
  typeof window !== 'undefined' && !!window.PublicKeyCredential && !!navigator.credentials;

interface CredJSON {
  id: string;
  transports?: string[];
}

/** Запрос на создание ключа: серверный JSON → то, что ждёт браузер. */
export async function createPasskey(options: Record<string, unknown>): Promise<unknown> {
  const o = options as unknown as {
    challenge: string;
    user: { id: string; name: string; displayName: string };
    excludeCredentials?: CredJSON[];
  };
  const publicKey = {
    ...(options as object),
    challenge: b64urlToBuf(o.challenge),
    user: { ...o.user, id: b64urlToBuf(o.user.id) },
    excludeCredentials: o.excludeCredentials?.map((c) => ({
      ...c,
      id: b64urlToBuf(c.id),
      type: 'public-key' as const,
    })),
  } as PublicKeyCredentialCreationOptions;

  const cred = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential | null;
  if (!cred) throw new Error('Создание ключа отменено');
  const r = cred.response as AuthenticatorAttestationResponse;

  return {
    id: cred.id,
    rawId: bufToB64url(cred.rawId),
    type: cred.type,
    authenticatorAttachment: cred.authenticatorAttachment ?? undefined,
    clientExtensionResults: cred.getClientExtensionResults(),
    response: {
      clientDataJSON: bufToB64url(r.clientDataJSON),
      attestationObject: bufToB64url(r.attestationObject),
      transports: r.getTransports?.() ?? [],
    },
  };
}

/** Вход имеющимся ключом. */
export async function usePasskey(options: Record<string, unknown>): Promise<unknown> {
  const o = options as unknown as { challenge: string; allowCredentials?: CredJSON[] };
  const publicKey = {
    ...(options as object),
    challenge: b64urlToBuf(o.challenge),
    allowCredentials: o.allowCredentials?.map((c) => ({
      ...c,
      id: b64urlToBuf(c.id),
      type: 'public-key' as const,
    })),
  } as PublicKeyCredentialRequestOptions;

  const cred = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null;
  if (!cred) throw new Error('Вход по ключу отменён');
  const r = cred.response as AuthenticatorAssertionResponse;

  return {
    id: cred.id,
    rawId: bufToB64url(cred.rawId),
    type: cred.type,
    authenticatorAttachment: cred.authenticatorAttachment ?? undefined,
    clientExtensionResults: cred.getClientExtensionResults(),
    response: {
      clientDataJSON: bufToB64url(r.clientDataJSON),
      authenticatorData: bufToB64url(r.authenticatorData),
      signature: bufToB64url(r.signature),
      userHandle: r.userHandle ? bufToB64url(r.userHandle) : undefined,
    },
  };
}
