// Проверки без базы: пароли, коды, шифрование, TOTP, лимиты синхронизации.
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { passwordProblem } from '../src/auth/password.js';
import { decrypt, encrypt, inviteCode } from '../src/auth/crypto.js';
import { normalizeCode } from '../src/auth/invite.js';
import { normalizeCode as normalizeRecovery } from '../src/auth/recovery.js';
import { checkTotp, newTotpSecret, otpauthUrl } from '../src/auth/totp.js';
import { deviceLabel } from '../src/auth/session.js';
import { MAX_BYTES, validate } from '../src/sync/service.js';

describe('пароли', () => {
  it('отклоняет короткий', () => {
    expect(passwordProblem('korotkiy')).toMatch(/не короче 12/);
  });
  it('отклоняет частый', () => {
    expect(passwordProblem('password123')).not.toBeNull();
  });
  it('отклоняет только цифры', () => {
    expect(passwordProblem('1234567890123')).toMatch(/цифр/);
  });
  it('принимает нормальный', () => {
    expect(passwordProblem('korova-bystro-7721')).toBeNull();
  });
});

describe('коды', () => {
  it('инвайт приводится к виду ABCD-EFGH-JKLM', () => {
    expect(normalizeCode('abcd efgh jklm')).toBe('ABCD-EFGH-JKLM');
    expect(normalizeCode('ABCDEFGHJKLM')).toBe('ABCD-EFGH-JKLM');
  });
  it('инвайт генерируется в нужном формате', () => {
    expect(inviteCode()).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });
  it('код восстановления нормализуется', () => {
    expect(normalizeRecovery('qdudnkxpp3')).toBe('QDUDN-KXPP3');
  });
});

describe('шифрование секретов', () => {
  it('расшифровывает своё же', () => {
    const packed = encrypt('секрет-2fa');
    expect(packed).not.toContain('секрет');
    expect(decrypt(packed)).toBe('секрет-2fa');
  });
  it('ломается на подмене данных', () => {
    const [iv, data, tag] = encrypt('секрет').split('.');
    const broken = [iv, data?.slice(0, -2) + 'AA', tag].join('.');
    expect(() => decrypt(broken)).toThrow();
  });
});

describe('TOTP', () => {
  const secret = newTotpSecret();
  const email = 'test@example.com';
  const step = Math.floor(Date.now() / 1000 / 30);

  /** Тот же алгоритм, что в приложении-аутентификаторе (RFC 6238). */
  function code(base32: string, forStep: number): string {
    const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    for (const ch of base32.toUpperCase().replace(/=+$/, '')) {
      const i = A.indexOf(ch);
      if (i >= 0) bits += i.toString(2).padStart(5, '0');
    }
    const bytes: number[] = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64BE(BigInt(forStep));
    const h = createHmac('sha1', Buffer.from(bytes)).update(buf).digest();
    const o = h[h.length - 1]! & 0x0f;
    return ((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
  }

  it('даёт ссылку для аутентификатора', () => {
    expect(otpauthUrl(secret, email)).toContain('otpauth://totp/');
  });
  it('принимает текущий код', () => {
    expect(checkTotp(secret, email, code(secret, step))).toBe(step);
  });
  it('принимает соседний шаг (±30 секунд)', () => {
    expect(checkTotp(secret, email, code(secret, step - 1))).toBe(step - 1);
    expect(checkTotp(secret, email, code(secret, step + 1))).toBe(step + 1);
  });
  it('отклоняет далёкий код', () => {
    expect(checkTotp(secret, email, code(secret, step + 5))).toBeNull();
  });
  it('отклоняет мусор', () => {
    expect(checkTotp(secret, email, '12345')).toBeNull();
    expect(checkTotp(secret, email, 'абвгде')).toBeNull();
  });
});

describe('имя устройства', () => {
  it('узнаёт iPhone и Safari', () => {
    expect(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit Safari/605')).toContain('iPhone');
  });
  it('не падает на пустом', () => {
    expect(deviceLabel('')).toBe('Неизвестное устройство');
  });
});

describe('проверка коллекций синхронизации', () => {
  it('отклоняет кривое имя', () => {
    expect(() => validate('плохое имя', [])).toThrow(/Недопустимое имя/);
    expect(() => validate('', [])).toThrow();
  });
  it('отклоняет не объект', () => {
    expect(() => validate('transactions', 'строка')).toThrow(/массивом или объектом/);
    expect(() => validate('transactions', null)).toThrow();
  });
  it('отклоняет слишком большую коллекцию', () => {
    const big = [{ note: 'x'.repeat(MAX_BYTES) }];
    expect(() => validate('transactions', big)).toThrow(/слишком большая/);
  });
  it('принимает нормальную', () => {
    const res = validate('transactions', [{ id: 'a', amount: 1 }]);
    expect(res.checksum).toHaveLength(64);
    expect(res.bytes).toBeGreaterThan(0);
  });
});
