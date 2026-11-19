// Тонкий клиент GraphQL. Без библиотек: один fetch, cookie сессии и понятные ошибки.
// В dev запросы идут через прокси vite, в prod — на тот же домен за Caddy,
// поэтому всегда один origin и никаких CORS.

const ENDPOINT = import.meta.env.VITE_API_URL || '/graphql';

export class ApiError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

/** Нет сети или сервер недоступен — не повод показывать страшную ошибку. */
export const isOffline = (e: unknown): boolean => e instanceof ApiError && e.code === 'OFFLINE';

/** Сессия кончилась или её не было. */
export const isUnauthenticated = (e: unknown): boolean =>
  e instanceof ApiError && (e.code === 'UNAUTHENTICATED' || e.code === 'MFA_REQUIRED');

export async function gql<T>(
  query: string,
  variables?: Record<string, unknown>,
  opts?: { keepalive?: boolean },
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      keepalive: opts?.keepalive ?? false,
      body: JSON.stringify({ query, variables }),
    });
  } catch {
    throw new ApiError('Нет связи с сервером', 'OFFLINE');
  }

  if (res.status === 413) throw new ApiError('Слишком много данных за один раз', 'PAYLOAD_TOO_BIG');
  if (res.status >= 500) throw new ApiError('Сервер сейчас недоступен', 'SERVER_ERROR');

  let body: { data?: T; errors?: { message: string; extensions?: { code?: string } }[] };
  try {
    body = await res.json();
  } catch {
    throw new ApiError('Непонятный ответ сервера', 'BAD_RESPONSE');
  }

  const err = body.errors?.[0];
  if (err) throw new ApiError(err.message || 'Ошибка запроса', err.extensions?.code ?? 'ERROR');
  if (!body.data) throw new ApiError('Пустой ответ сервера', 'BAD_RESPONSE');
  return body.data;
}
