// Экспорт событий в календарь телефона (.ics) — так работают напоминания без сервера.
import { download, pad } from './utils';

const esc = (s = '') => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');

/** "2026-11-18T14:30" → "20261118T143000" (плавающее локальное время) */
const icsLocal = (s: string) => s.replace(/[-:]/g, '').slice(0, 13) + '00';

function utcStamp(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function addMinutes(s: string, min: number): string {
  const [d, t = '00:00'] = s.split('T');
  const [y, m, dd] = d.split('-').map(Number);
  const [hh, mm] = t.split(':').map(Number);
  const x = new Date(y, m - 1, dd, hh, mm + min);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
}

export interface IcsEvent {
  uid: string;
  start: string; // "YYYY-MM-DDTHH:mm"
  minutes?: number;
  title: string;
  location?: string;
  description?: string;
  /** напоминания: минут до начала */
  alarms?: number[];
  /** еженедельное повторение: дни 1..7 */
  weekly?: number[];
}

const BYDAY = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

function vevent(e: IcsEvent): string[] {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${e.uid}@lifeboard`,
    `DTSTAMP:${utcStamp()}`,
    `DTSTART:${icsLocal(e.start)}`,
    `DTEND:${icsLocal(addMinutes(e.start, e.minutes ?? 60))}`,
    `SUMMARY:${esc(e.title)}`,
  ];
  if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
  if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
  if (e.weekly?.length) lines.push(`RRULE:FREQ=WEEKLY;BYDAY=${e.weekly.map((d) => BYDAY[d - 1]).join(',')}`);
  for (const a of e.alarms ?? []) {
    lines.push('BEGIN:VALARM', `TRIGGER:-PT${a}M`, 'ACTION:DISPLAY', `DESCRIPTION:${esc(e.title)}`, 'END:VALARM');
  }
  lines.push('END:VEVENT');
  return lines;
}

export function downloadIcs(filename: string, events: IcsEvent[]) {
  const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Lifeboard//Tracker//RU', 'CALSCALE:GREGORIAN', ...events.flatMap(vevent), 'END:VCALENDAR'].join('\r\n');
  download(filename, body, 'text/calendar;charset=utf-8');
}
