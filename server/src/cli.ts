// Управление аккаунтами без веб-интерфейса.
//
//   dev:  npm run cli -- invite --uses 1 --days 7
//   prod: docker compose exec api node dist/cli.js invite --uses 1 --days 7
//
// Команды: invite, user, password, admin, unadmin, disable, enable, list, vapid
import { prisma } from './db.js';
import { hashSecret, passwordProblem } from './auth/password.js';
import { randomToken } from './auth/crypto.js';
import { createInvite } from './auth/invite.js';
import { revokeAll } from './auth/session.js';
import { audit } from './audit.js';
import webpush from 'web-push';

const args = process.argv.slice(2);
const command = args[0] ?? 'help';

// Разбор «--ключ значение» и обычных аргументов
const rest: string[] = [];
const flags = new Map<string, string | true>();
for (let i = 1; i < args.length; i++) {
  const a = args[i]!;
  if (!a.startsWith('--')) {
    rest.push(a);
    continue;
  }
  const next = args[i + 1];
  if (next !== undefined && !next.startsWith('--')) {
    flags.set(a.slice(2), next);
    i++;
  } else {
    flags.set(a.slice(2), true);
  }
}

const flag = (name: string): string | undefined => {
  const v = flags.get(name);
  return typeof v === 'string' ? v : undefined;
};
const has = (name: string) => flags.has(name);
const positional = (n: number) => rest[n];

/** Пароль, который не стыдно продиктовать: 4 группы по 5 символов. */
function suggestPassword(): string {
  const raw = randomToken(24).replace(/[-_]/g, '');
  return (raw.slice(0, 20).match(/.{1,5}/g) ?? []).join('-');
}

async function findUser(email: string) {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user) {
    console.error('Пользователь не найден:', email);
    process.exit(1);
  }
  return user;
}

async function main(): Promise<void> {
  switch (command) {
    case 'invite': {
      const uses = Number.parseInt(flag('uses') ?? '1', 10);
      const days = flag('days') ? Number.parseInt(flag('days')!, 10) : null;
      const code = await createInvite({ maxUses: uses, days, note: flag('note') ?? null });
      console.log('Код приглашения:', code);
      console.log('Использований:', uses, days ? `· действует ${days} дн.` : '· без срока');
      await audit('invite_created', { meta: { uses, days, via: 'cli' } });
      break;
    }

    case 'user': {
      const email = (positional(0) ?? '').trim().toLowerCase();
      if (!email) return usage('user <email> [--password ...] [--admin]');
      const password = flag('password') ?? suggestPassword();
      const problem = passwordProblem(password);
      if (problem) {
        console.error(problem);
        process.exit(1);
      }
      const exists = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (exists) {
        console.error('Такая почта уже зарегистрирована:', email);
        process.exit(1);
      }
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash: await hashSecret(password),
          role: has('admin') ? 'admin' : 'user',
          emailVerifiedAt: new Date(),
        },
      });
      console.log('Создан пользователь:', user.email, user.role === 'admin' ? '(администратор)' : '');
      if (!flag('password')) console.log('Пароль:', password);
      break;
    }

    case 'password': {
      const email = positional(0);
      if (!email) return usage('password <email> [--password ...]');
      const user = await findUser(email);
      const password = flag('password') ?? suggestPassword();
      const problem = passwordProblem(password);
      if (problem) {
        console.error(problem);
        process.exit(1);
      }
      await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashSecret(password) } });
      const closed = await revokeAll(user.id);
      await audit('password_reset', { userId: user.id, meta: { via: 'cli' } });
      console.log('Пароль изменён для', user.email);
      if (!flag('password')) console.log('Новый пароль:', password);
      console.log('Закрыто активных входов:', closed);
      break;
    }

    case 'admin':
    case 'unadmin': {
      const email = positional(0);
      if (!email) return usage(command + ' <email>');
      const user = await findUser(email);
      await prisma.user.update({
        where: { id: user.id },
        data: { role: command === 'admin' ? 'admin' : 'user' },
      });
      console.log(user.email, command === 'admin' ? '— теперь администратор' : '— обычный пользователь');
      break;
    }

    case 'disable':
    case 'enable': {
      const email = positional(0);
      if (!email) return usage(command + ' <email>');
      const user = await findUser(email);
      const off = command === 'disable';
      await prisma.user.update({ where: { id: user.id }, data: { disabledAt: off ? new Date() : null } });
      if (off) await revokeAll(user.id);
      console.log(user.email, off ? '— доступ закрыт, входы сброшены' : '— доступ открыт');
      break;
    }

    case 'vapid': {
      const keys = webpush.generateVAPIDKeys();
      console.log('Ключи для push-уведомлений. Скопируйте в .env:\n');
      console.log('VAPID_PUBLIC_KEY=' + keys.publicKey);
      console.log('VAPID_PRIVATE_KEY=' + keys.privateKey);
      console.log('VAPID_SUBJECT=mailto:вашапочта@example.com');
      console.log('\nПриватный ключ никому не показывайте. После смены ключей');
      console.log('все устройства придётся подписать заново.');
      break;
    }

    case 'list': {
      const users = await prisma.user.findMany({
        orderBy: { createdAt: 'asc' },
        include: {
          totp: { select: { confirmedAt: true } },
          _count: { select: { passkeys: true, sessions: true } },
        },
      });
      if (!users.length) {
        console.log('Пользователей пока нет. Создайте код приглашения: invite');
        break;
      }
      for (const u of users) {
        const marks = [
          u.role === 'admin' ? 'админ' : null,
          u.totp?.confirmedAt ? '2FA' : null,
          u._count.passkeys ? `passkeys:${u._count.passkeys}` : null,
          u.disabledAt ? 'ОТКЛЮЧЁН' : null,
        ].filter(Boolean);
        console.log(
          u.email.padEnd(34),
          marks.join(' · ').padEnd(28),
          'входов:',
          u._count.sessions,
          '·',
          u.createdAt.toISOString().slice(0, 10),
        );
      }
      break;
    }

    default:
      console.log(
        [
          'Команды:',
          '  invite [--uses N] [--days N] [--note "..."]   создать код приглашения',
          '  user <email> [--password ...] [--admin]       создать пользователя',
          '  password <email> [--password ...]             сменить пароль и сбросить входы',
          '  admin <email> / unadmin <email>               права администратора',
          '  disable <email> / enable <email>              закрыть или открыть доступ',
          '  list                                          список пользователей',
          '  vapid                                         ключи для push-уведомлений',
        ].join('\n'),
      );
  }
}

function usage(line: string): void {
  console.error('Как использовать: ' + line);
  process.exit(1);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
