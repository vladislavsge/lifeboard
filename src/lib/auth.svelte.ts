// Состояние аккаунта. Без аккаунта приложение работает как раньше —
// это просто дополнительная возможность, а не условие работы.
import { gql, isOffline } from './api';
import { createPasskey, usePasskey } from './webauthn';

export interface Me {
  id: string;
  email: string;
  role: string;
  emailVerified: boolean;
  totpEnabled: boolean;
  passkeyCount: number;
  mfaPassed: boolean;
  createdAt: string;
}

const ME = 'id email role emailVerified totpEnabled passkeyCount mfaPassed createdAt';

/** unknown — ещё не спрашивали сервер; guest — не вошли; mfa — ждём код; in — вошли */
export type AuthState = 'unknown' | 'guest' | 'mfa' | 'in';

class Auth {
  me = $state<Me | null>(null);
  state = $state<AuthState>('unknown');
  /** false — сервера нет (статичный хостинг или нет сети). Приложение работает локально */
  serverReachable = $state(false);
  openRegistration = $state(false);
  mailEnabled = $state(false);
}

export const auth = new Auth();

function apply(me: Me | null): AuthState {
  auth.me = me;
  auth.state = !me ? 'guest' : me.mfaPassed ? 'in' : 'mfa';
  return auth.state;
}

/** Спрашивает сервер, кто мы. Ошибку наружу не бросает: нет сервера — работаем локально. */
export async function refresh(): Promise<void> {
  try {
    const d = await gql<{ me: Me | null; authConfig: { openRegistration: boolean; mailEnabled: boolean } }>(
      `{ me { ${ME} } authConfig { openRegistration mailEnabled } }`,
    );
    auth.openRegistration = d.authConfig.openRegistration;
    auth.mailEnabled = d.authConfig.mailEnabled;
    auth.serverReachable = true;
    apply(d.me);
  } catch (e) {
    auth.serverReachable = false;
    if (auth.state === 'unknown') auth.state = 'guest';
    if (!isOffline(e)) console.warn('Сервер аккаунтов недоступен', e);
  }
}

export async function login(email: string, password: string): Promise<AuthState> {
  const d = await gql<{ login: { status: string; me: Me | null } }>(
    `mutation($e:String!,$p:String!){ login(email:$e,password:$p){ status me { ${ME} } } }`,
    { e: email, p: password },
  );
  return apply(d.login.me);
}

export async function register(email: string, password: string, inviteCode?: string): Promise<AuthState> {
  const d = await gql<{ register: { status: string; me: Me | null } }>(
    `mutation($e:String!,$p:String!,$c:String){ register(email:$e,password:$p,inviteCode:$c){ status me { ${ME} } } }`,
    { e: email, p: password, c: inviteCode || null },
  );
  return apply(d.register.me);
}

export async function verifyTotp(code: string): Promise<AuthState> {
  const d = await gql<{ verifyTotp: { me: Me | null } }>(
    `mutation($c:String!){ verifyTotp(code:$c){ status me { ${ME} } } }`,
    { c: code },
  );
  return apply(d.verifyTotp.me);
}

export async function useRecoveryCode(code: string): Promise<AuthState> {
  const d = await gql<{ useRecoveryCode: { me: Me | null } }>(
    `mutation($c:String!){ useRecoveryCode(code:$c){ status me { ${ME} } } }`,
    { c: code },
  );
  return apply(d.useRecoveryCode.me);
}

export async function logout(): Promise<void> {
  try {
    await gql('mutation{ logout }');
  } finally {
    apply(null);
  }
}

/* ---------- Passkeys ---------- */

export async function addPasskey(label?: string): Promise<void> {
  const start = await gql<{ startPasskeyRegistration: { handle: string; options: Record<string, unknown> } }>(
    'mutation{ startPasskeyRegistration{ handle options } }',
  );
  const response = await createPasskey(start.startPasskeyRegistration.options);
  await gql(
    'mutation($h:String!,$r:JSON!,$l:String){ finishPasskeyRegistration(handle:$h,response:$r,label:$l){ id } }',
    { h: start.startPasskeyRegistration.handle, r: response, l: label || null },
  );
  await refresh();
}

export async function loginWithPasskey(email?: string): Promise<AuthState> {
  const start = await gql<{ startPasskeyLogin: { handle: string; options: Record<string, unknown> } }>(
    'mutation($e:String){ startPasskeyLogin(email:$e){ handle options } }',
    { e: email || null },
  );
  const response = await usePasskey(start.startPasskeyLogin.options);
  const d = await gql<{ finishPasskeyLogin: { me: Me | null } }>(
    `mutation($h:String!,$r:JSON!){ finishPasskeyLogin(handle:$h,response:$r){ status me { ${ME} } } }`,
    { h: start.startPasskeyLogin.handle, r: response },
  );
  return apply(d.finishPasskeyLogin.me);
}
