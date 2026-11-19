// Отправка писем. Если SMTP не настроен (режим «только по инвайтам»),
// письмо не теряется молча — оно уходит в лог, чтобы ссылку можно было взять оттуда.
import nodemailer from 'nodemailer';
import { env, isProd } from '../env.js';

const transport = env.SMTP_URL ? nodemailer.createTransport(env.SMTP_URL) : null;

export const mailEnabled = (): boolean => transport !== null;

export async function sendMail(p: { to: string; subject: string; text: string }): Promise<boolean> {
  if (!transport) {
    if (isProd) console.warn('[mail] SMTP не настроен — письмо не отправлено:', p.subject, '→', p.to);
    else console.warn('[mail] SMTP не настроен. Письмо «%s» для %s:\n%s', p.subject, p.to, p.text);
    return false;
  }
  await transport.sendMail({ from: env.MAIL_FROM, to: p.to, subject: p.subject, text: p.text });
  return true;
}

// Приложение использует hash-роутер, поэтому ссылки идут через #
const link = (path: string, token: string) => env.APP_ORIGIN + '/#/auth/' + path + '/' + token;

export async function sendVerifyEmail(to: string, token: string): Promise<boolean> {
  return sendMail({
    to,
    subject: 'Подтверждение почты в трекере',
    text:
      'Здравствуйте!\n\nПодтвердите почту, чтобы можно было восстановить доступ к аккаунту:\n' +
      link('verify', token) +
      '\n\nСсылка действует сутки. Если вы не регистрировались — просто не открывайте её.\n',
  });
}

export async function sendResetEmail(to: string, token: string): Promise<boolean> {
  return sendMail({
    to,
    subject: 'Смена пароля в трекере',
    text:
      'Здравствуйте!\n\nЧтобы задать новый пароль, откройте ссылку:\n' +
      link('reset', token) +
      '\n\nСсылка действует час и срабатывает один раз. Все входы на других устройствах будут сброшены.\n' +
      'Если вы не просили смену пароля — ничего делать не нужно.\n',
  });
}
