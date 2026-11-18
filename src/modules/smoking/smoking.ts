import { data, add, remove, find } from '../../lib/store.svelte';
import { toast } from '../../lib/nav.svelte';
import { nowLocal, uid, dayOf, todayKey, parseLocal, sum, vibrate, lastDays } from '../../lib/utils';

/** Быстрая запись «покурил» с возможностью отменить */
export function logSmoke(productId?: string) {
  const pid = productId ?? data.settings.lastSmokeProductId;
  const product = find('smokeProducts', pid);
  const s = add('smokes', { id: uid(), date: nowLocal(), productId: product?.id, count: 1 });
  if (product) data.settings.lastSmokeProductId = product.id;
  vibrate(20);
  const n = countOn(todayKey());
  const limit = data.settings.smokeLimit;
  toast(limit ? `Записано · сегодня ${n} из ${limit}` : `Записано · сегодня ${n}`, {
    label: 'Отменить',
    fn: () => remove('smokes', s.id),
  });
}

export const countOn = (key: string) => sum(data.smokes.filter((s) => dayOf(s.date) === key), (s) => s.count);

export function lastSmoke() {
  let last: (typeof data.smokes)[number] | undefined;
  for (const s of data.smokes) if (!last || s.date > last.date) last = s;
  return last;
}

/** средний интервал между записями за день, мин */
export function avgInterval(key: string): number | undefined {
  const times = data.smokes
    .filter((s) => dayOf(s.date) === key)
    .map((s) => parseLocal(s.date).getTime())
    .sort((a, b) => a - b);
  if (times.length < 2) return undefined;
  return Math.round((times[times.length - 1] - times[0]) / (times.length - 1) / 60000);
}

/** примерная стоимость выкуренного (по цене штуки) */
export function smokedCost(keys: Set<string>): number {
  let c = 0;
  for (const s of data.smokes) {
    if (!keys.has(dayOf(s.date))) continue;
    const p = find('smokeProducts', s.productId);
    if (p?.packPrice && p.unitsPerPack) c += (p.packPrice / p.unitsPerPack) * s.count;
  }
  return Math.round(c);
}

/** распределение по времени суток за n дней: 12 интервалов по 2 часа */
export function byHour(days = 30): { label: string; value: number }[] {
  const since = lastDays(days)[0];
  const bins = Array(12).fill(0);
  for (const s of data.smokes) {
    if (dayOf(s.date) < since) continue;
    bins[Math.floor(Number(s.date.slice(11, 13)) / 2)] += s.count;
  }
  return bins.map((v, i) => ({ label: String(i * 2), value: v }));
}

/** самый длинный перерыв между записями за n дней (мин) */
export function longestBreak(days = 30, now = Date.now()): { minutes: number; from: string } | null {
  const since = lastDays(days)[0];
  const list = data.smokes
    .filter((s) => dayOf(s.date) >= since)
    .map((s) => s.date)
    .sort();
  let best: { minutes: number; from: string } | null = null;
  for (let i = 1; i < list.length; i++) {
    const m = Math.round((parseLocal(list[i]).getTime() - parseLocal(list[i - 1]).getTime()) / 60000);
    if (!best || m > best.minutes) best = { minutes: m, from: list[i - 1] };
  }
  // текущий перерыв тоже может быть рекордом
  const last = list[list.length - 1];
  if (last) {
    const cur = Math.round((now - parseLocal(last).getTime()) / 60000);
    if (!best || cur > best.minutes) best = { minutes: cur, from: last };
  }
  return best;
}

/** дней подряд в пределах лимита (сегодня — если пока укладываемся) */
export function limitStreak(): number {
  const limit = data.settings.smokeLimit;
  if (!limit || !data.smokes.length) return 0;
  const first = data.smokes.reduce((m, s) => (s.date < m ? s.date : m), data.smokes[0].date).slice(0, 10);
  let n = 0;
  const days = lastDays(366).reverse();
  for (const k of days) {
    if (k < first) break;
    if (countOn(k) > limit) break;
    n++;
  }
  return n;
}

export function avgPerDay(days: number): number {
  const keys = lastDays(days + 1).slice(0, days); // без сегодняшнего (он неполный)
  const total = sum(keys, (k) => countOn(k));
  return total / days;
}
