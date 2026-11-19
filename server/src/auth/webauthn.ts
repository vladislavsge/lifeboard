// Passkeys (WebAuthn): вход по Face ID / отпечатку вместо пароля.
// Challenge живёт в базе 5 минут и гасится при первой же проверке,
// поэтому ответ аутентификатора нельзя переиспользовать.
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { randomToken } from './crypto.js';

const RP_NAME = 'Трекер';
const TTL_MS = 5 * 60 * 1000;

/** rpID — это домен без схемы и порта; для dev подходит localhost. */
const rpID = env.APP_DOMAIN;

export interface WebauthnOptions {
  handle: string;
  options: unknown;
}

async function saveChallenge(purpose: 'register' | 'login', challenge: string, userId: string | null) {
  const handle = randomToken(32);
  await prisma.webauthnChallenge.create({
    data: { handle, challenge, purpose, userId, expiresAt: new Date(Date.now() + TTL_MS) },
  });
  return handle;
}

/** Достаёт challenge и сразу удаляет его — один ответ на один запрос. */
async function takeChallenge(
  handle: string,
  purpose: 'register' | 'login',
): Promise<{ challenge: string; userId: string | null } | null> {
  const row = await prisma.webauthnChallenge.findUnique({ where: { handle } });
  if (!row) return null;
  await prisma.webauthnChallenge.delete({ where: { id: row.id } }).catch(() => undefined);
  if (row.purpose !== purpose || row.expiresAt <= new Date()) return null;
  return { challenge: row.challenge, userId: row.userId };
}

const transportsOf = (s: string | null): AuthenticatorTransportFuture[] | undefined =>
  s ? (s.split(',').filter(Boolean) as AuthenticatorTransportFuture[]) : undefined;

export async function registrationOptions(user: {
  id: string;
  email: string;
}): Promise<WebauthnOptions> {
  const existing = await prisma.passkey.findMany({
    where: { userId: user.id },
    select: { credentialId: true, transports: true },
  });
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userID: new TextEncoder().encode(user.id),
    userName: user.email,
    attestationType: 'none',
    excludeCredentials: existing.map((p) => ({
      id: p.credentialId,
      transports: transportsOf(p.transports),
    })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
  });
  const handle = await saveChallenge('register', options.challenge, user.id);
  return { handle, options };
}

export async function verifyRegistration(p: {
  handle: string;
  response: RegistrationResponseJSON;
  userId: string;
  label?: string | null;
}) {
  const saved = await takeChallenge(p.handle, 'register');
  if (!saved || saved.userId !== p.userId) return null;

  const result = await verifyRegistrationResponse({
    response: p.response,
    expectedChallenge: saved.challenge,
    expectedOrigin: env.APP_ORIGINS,
    expectedRPID: rpID,
  });
  if (!result.verified) return null;

  const { credential, credentialDeviceType, credentialBackedUp } = result.registrationInfo;
  return prisma.passkey.create({
    data: {
      userId: p.userId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey),
      counter: BigInt(credential.counter),
      transports: credential.transports?.join(',') ?? null,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      label: p.label?.slice(0, 80) || null,
    },
  });
}

/** Если почта не указана — вход по ключу, который сам себя опознает (resident key). */
export async function authenticationOptions(email?: string | null): Promise<WebauthnOptions> {
  let userId: string | null = null;
  let allow: { id: string; transports?: AuthenticatorTransportFuture[] }[] = [];

  if (email) {
    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: { id: true, passkeys: { select: { credentialId: true, transports: true } } },
    });
    if (user) {
      userId = user.id;
      allow = user.passkeys.map((p) => ({ id: p.credentialId, transports: transportsOf(p.transports) }));
    }
  }

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: 'preferred',
    ...(allow.length ? { allowCredentials: allow } : {}),
  });
  const handle = await saveChallenge('login', options.challenge, userId);
  return { handle, options };
}

export async function verifyAuthentication(p: {
  handle: string;
  response: AuthenticationResponseJSON;
}): Promise<{ userId: string; passkeyId: string } | null> {
  const saved = await takeChallenge(p.handle, 'login');
  if (!saved) return null;

  const passkey = await prisma.passkey.findUnique({ where: { credentialId: p.response.id } });
  if (!passkey) return null;
  if (saved.userId && saved.userId !== passkey.userId) return null;

  const result = await verifyAuthenticationResponse({
    response: p.response,
    expectedChallenge: saved.challenge,
    expectedOrigin: env.APP_ORIGINS,
    expectedRPID: rpID,
    credential: {
      id: passkey.credentialId,
      publicKey: new Uint8Array(passkey.publicKey),
      counter: Number(passkey.counter),
      transports: transportsOf(passkey.transports),
    },
  });
  if (!result.verified) return null;

  await prisma.passkey.update({
    where: { id: passkey.id },
    data: { counter: BigInt(result.authenticationInfo.newCounter), lastUsedAt: new Date() },
  });
  return { userId: passkey.userId, passkeyId: passkey.id };
}

/** Фоновая уборка просроченных challenge. */
export const cleanupChallenges = (): Promise<unknown> =>
  prisma.webauthnChallenge.deleteMany({ where: { expiresAt: { lt: new Date() } } });
