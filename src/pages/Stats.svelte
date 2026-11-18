<script lang="ts">
  // Сводная статистика за месяц/год по всем включённым разделам + автоматические выводы.
  import type { Period, PeriodKind } from '../lib/utils';
  import { data, isEnabled, exercise, find } from '../lib/store.svelte';
  import { go } from '../lib/nav.svelte';
  import {
    money, periodRange, inPeriod, sum, todayKey, parseLocal, fmtMinutes, fmtNum, dayOf, fmtDay, MONTHS, WD_SHORT,
    isoWeekday, addDays, dateKey,
  } from '../lib/utils';
  import TopBar from '../components/TopBar.svelte';
  import PeriodNav from '../components/PeriodNav.svelte';
  import Bars from '../components/Bars.svelte';
  import { totals, byCategory, previousPeriod, deltaPct } from '../modules/finance/finance';
  import { primaryField, goalProgress } from '../modules/custom/tracker';

  let kind = $state<PeriodKind>('month');
  let offset = $state(0);

  const p = $derived(periodRange(kind, offset));
  const prev = $derived(previousPeriod(kind, offset));

  /** сколько дней периода уже прошло (для средних) */
  function daysIn(per: Period): number {
    const start = parseLocal(per.start).getTime();
    const endKey = per.end > dateKey(addDays(new Date(), 1)) ? dateKey(addDays(new Date(), 1)) : per.end;
    return Math.max(1, Math.round((parseLocal(endKey).getTime() - start) / 86400000));
  }
  const days = $derived(daysIn(p));

  /* ---------- Финансы ---------- */
  const tx = $derived(data.transactions.filter((t) => inPeriod(t.date, p)));
  const t = $derived(totals(tx));
  const tPrev = $derived(prev ? totals(data.transactions.filter((x) => inPeriod(x.date, prev))) : null);
  const cats = $derived(byCategory(tx, 'expense'));
  const catsPrev = $derived(prev ? new Map(byCategory(data.transactions.filter((x) => inPeriod(x.date, prev)), 'expense').map((c) => [c.id, c.amount])) : new Map<string, number>());

  const monthsChart = $derived.by(() => {
    const base = parseLocal(p.start);
    const n = kind === 'year' ? 12 : 6;
    return Array.from({ length: n }, (_, i) => {
      const s = kind === 'year' ? new Date(base.getFullYear(), i, 1) : new Date(base.getFullYear(), base.getMonth() - (n - 1 - i), 1);
      const e = new Date(s.getFullYear(), s.getMonth() + 1, 1);
      const per = { start: dateKey(s), end: dateKey(e), label: '' };
      const v = sum(data.transactions.filter((x) => x.type === 'expense' && inPeriod(x.date, per)), (x) => x.amount);
      return { label: MONTHS[s.getMonth()].slice(0, 3).toLowerCase(), value: v };
    });
  });

  const weekdayChart = $derived.by(() => {
    const totalsWd = Array(7).fill(0);
    for (const x of tx) if (x.type === 'expense') totalsWd[isoWeekday(parseLocal(x.date)) - 1] += x.amount;
    const weeks = Math.max(1, days / 7);
    return totalsWd.map((v, i) => ({ label: WD_SHORT[i].toLowerCase(), value: Math.round(v / weeks) }));
  });

  const biggestDay = $derived.by(() => {
    const m = new Map<string, number>();
    for (const x of tx) if (x.type === 'expense') m.set(dayOf(x.date), (m.get(dayOf(x.date)) ?? 0) + x.amount);
    let best: [string, number] | null = null;
    for (const e of m) if (!best || e[1] > best[1]) best = e;
    return best;
  });
  const biggestTx = $derived(tx.filter((x) => x.type === 'expense').sort((a, b) => b.amount - a.amount)[0]);

  /* ---------- Тренировки ---------- */
  const ws = $derived(data.workouts.filter((w) => w.status === 'done' && inPeriod(w.date, p)));
  const wsPrev = $derived(prev ? data.workouts.filter((w) => w.status === 'done' && inPeriod(w.date, prev)) : []);
  const wMinutes = $derived(sum(ws, (w) => w.duration ?? 0));
  const topExercise = $derived.by(() => {
    const m = new Map<string, number>();
    for (const w of ws) for (const e of w.exercises) m.set(e.exerciseId, (m.get(e.exerciseId) ?? 0) + 1);
    let best: [string, number] | null = null;
    for (const e of m) if (!best || e[1] > best[1]) best = e;
    return best ? { name: exercise(best[0]).name, n: best[1] } : null;
  });

  /* ---------- Курение ---------- */
  const smokes = $derived(sum(data.smokes.filter((s) => inPeriod(s.date, p)), (s) => s.count));
  const smokesPrev = $derived(prev ? sum(data.smokes.filter((s) => inPeriod(s.date, prev)), (s) => s.count) : 0);
  const smokeSpent = $derived(
    sum(
      tx.filter((x) => x.source?.module === 'smoking' || find('categories', x.categoryId)?.system === 'smoking'),
      (x) => x.amount,
    ),
  );

  /* ---------- Покупки ---------- */
  const trips = $derived(data.groceryTrips.filter((g) => inPeriod(g.date, p)));
  const tripsTotal = $derived(sum(trips, (g) => g.total));
  const topItems = $derived.by(() => {
    const m = new Map<string, number>();
    for (const g of trips) for (const l of g.lines) m.set(l.name, (m.get(l.name) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]).slice(0, 5);
  });

  /* ---------- Врачи ---------- */
  const visits = $derived(data.appointments.filter((a) => a.status === 'done' && inPeriod(a.date, p)));

  /* ---------- Трекеры ---------- */
  const trackers = $derived(
    data.trackers
      .filter((tr) => isEnabled('tracker:' + tr.id))
      .map((tr) => {
        const es = data.entries.filter((e) => e.trackerId === tr.id && inPeriod(e.date, p));
        const pf = primaryField(tr);
        const total = pf && pf.type !== 'rating' ? sum(es, (e) => Number(e.values[pf.id] ?? 0)) : 0;
        const goal = tr.goal ? goalProgress(tr, p) : null;
        return { tr, count: es.length, pf, total, goal };
      })
      .filter((x) => x.count || x.goal),
  );

  /* ---------- Выводы ---------- */
  const insights = $derived.by(() => {
    const out: { icon: string; text: string; tone?: 'good' | 'bad' }[] = [];
    const prevName = kind === 'year' ? 'прошлым годом' : 'тем же периодом прошлого месяца';
    if (isEnabled('finance') && tx.length) {
      const d = tPrev ? deltaPct(t.expense, tPrev.expense) : null;
      if (d !== null && Math.abs(d) >= 5)
        out.push({
          icon: d > 0 ? '📈' : '📉',
          text: `Расходы ${d > 0 ? 'выросли' : 'снизились'} на ${Math.abs(d)}% по сравнению с ${prevName}.`,
          tone: d > 0 ? 'bad' : 'good',
        });
      for (const c of cats.slice(0, 6)) {
        const was = catsPrev.get(c.id);
        if (!was) continue;
        const cd = deltaPct(c.amount, was)!;
        if (Math.abs(cd) >= 25 && Math.abs(c.amount - was) >= 1000) {
          out.push({
            icon: c.icon,
            text: `«${c.name}»: ${cd > 0 ? '+' : ''}${cd}% (${money(c.amount - was, { sign: true, round: true })}).`,
            tone: cd > 0 ? 'bad' : 'good',
          });
          if (out.length > 3) break;
        }
      }
      if (t.income > 0) {
        const rate = Math.round((t.balance / t.income) * 100);
        out.push({
          icon: rate >= 0 ? '🐷' : '⚠️',
          text: rate >= 0 ? `Отложено ${rate}% дохода — ${money(t.balance, { round: true })}.` : `Расходы превысили доходы на ${money(-t.balance, { round: true })}.`,
          tone: rate >= 10 ? 'good' : rate < 0 ? 'bad' : undefined,
        });
      }
      if (cats[0]) out.push({ icon: '🏆', text: `Больше всего ушло на «${cats[0].name}» — ${money(cats[0].amount, { round: true })} (${Math.round((cats[0].amount / t.expense) * 100)}%).` });
    }
    if (isEnabled('smoking') && (smokes || smokesPrev)) {
      const avg = smokes / days;
      const prevAvg = prev ? smokesPrev / daysIn(prev) : 0;
      const diff = avg - prevAvg;
      out.push({
        icon: '🚬',
        text:
          prev && smokesPrev
            ? `В среднем ${fmtNum(avg)} в день — на ${fmtNum(Math.abs(diff))} ${diff <= 0 ? 'меньше' : 'больше'}, чем раньше.`
            : `В среднем ${fmtNum(avg)} в день.`,
        tone: prev && smokesPrev ? (diff <= 0 ? 'good' : 'bad') : undefined,
      });
    }
    if (isEnabled('workouts') && (ws.length || wsPrev.length)) {
      const d = ws.length - wsPrev.length;
      out.push({
        icon: '🏋️',
        text: `${ws.length} трен., ${fmtMinutes(wMinutes)}${prev ? (d > 0 ? ` — на ${d} больше, чем раньше 💪` : d < 0 ? ` — на ${-d} меньше, чем раньше` : ' — столько же, сколько раньше') : ''}.`,
        tone: d > 0 ? 'good' : d < 0 ? 'bad' : undefined,
      });
    }
    for (const x of trackers) {
      if (x.goal && x.goal.days) {
        const pct = Math.round((x.goal.met / x.goal.days) * 100);
        out.push({ icon: x.tr.icon, text: `${x.tr.name}: цель выполнена ${x.goal.met} из ${x.goal.days} дн. (${pct}%).`, tone: pct >= 70 ? 'good' : pct < 40 ? 'bad' : undefined });
      }
    }
    return out;
  });
</script>

<TopBar title="Статистика" back="/" />

<div class="page">
  <PeriodNav bind:kind bind:offset kinds={['month', 'year']} />

  <div class="section">
    <div class="section-head"><h3>Выводы</h3></div>
    <div class="list plain">
      {#each insights as i, n (n)}
        <div class="row" style="min-height:48px;align-items:flex-start">
          <span style="font-size:20px">{i.icon}</span>
          <span class="grow small" style:color={i.tone === 'good' ? 'var(--green)' : i.tone === 'bad' ? 'var(--red)' : 'var(--text)'}>{i.text}</span>
        </div>
      {:else}
        <div class="row muted small">Пока мало данных — записывайте траты, тренировки и привычки, и здесь появятся выводы.</div>
      {/each}
    </div>
  </div>

  {#if isEnabled('finance')}
    <div class="section">
      <div class="section-head"><h3>💶 Финансы</h3><button onclick={() => go('/finance')}>Открыть</button></div>
      <div class="grid2">
        <div class="stat">
          <span class="k">Расходы</span><span class="v">{money(t.expense, { round: true })}</span>
          {#if tPrev && deltaPct(t.expense, tPrev.expense) !== null}
            {@const d = deltaPct(t.expense, tPrev.expense)!}
            <span class="tiny" style:color={d > 0 ? 'var(--red)' : 'var(--green)'}>{d > 0 ? '▲' : '▼'} {Math.abs(d)}%</span>
          {/if}
        </div>
        <div class="stat"><span class="k">Доходы</span><span class="v plus">{money(t.income, { round: true })}</span></div>
        <div class="stat"><span class="k">В среднем в день</span><span class="v">{money(Math.round(t.expense / days), { round: true })}</span></div>
        <div class="stat"><span class="k">Сальдо</span><span class="v" class:plus={t.balance > 0}>{money(t.balance, { sign: true, round: true })}</span></div>
      </div>
      <div class="card">
        <div class="label">Расходы по месяцам</div>
        <div class="mt8"><Bars items={monthsChart} color="var(--accent)" showValues format={(v) => money(v, { round: true }).replace(/\s?€|\s?\$|\s?£/, '')} /></div>
      </div>
      {#if tx.length}
        <div class="card">
          <div class="label">Средние траты по дням недели</div>
          <div class="mt8"><Bars items={weekdayChart} color="#06b6d4" height={90} /></div>
        </div>
      {/if}
      {#if cats.length}
        <div class="list">
          {#each cats.slice(0, 6) as c (c.id)}
            {@const was = catsPrev.get(c.id)}
            {@const d = was ? deltaPct(c.amount, was) : null}
            <div class="row" style="min-height:48px">
              <div class="row-icon" style:--c="var(--muted)">{c.icon}</div>
              <div class="row-main">
                <div class="row-title">{c.name}</div>
                <div class="row-sub">{Math.round((c.amount / t.expense) * 100)}% расходов</div>
              </div>
              <div class="row-end">
                <span class="bold tnum">{money(c.amount, { round: true })}</span>
                {#if d !== null}<span class="tiny" style:color={d > 0 ? 'var(--red)' : 'var(--green)'}>{d > 0 ? '▲' : '▼'}{Math.abs(d)}%</span>{/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
      {#if biggestDay || biggestTx}
        <div class="grid2">
          {#if biggestDay}<div class="stat"><span class="k">Самый дорогой день</span><span class="v">{money(biggestDay[1], { round: true })}</span><span class="tiny muted">{fmtDay(biggestDay[0])}</span></div>{/if}
          {#if biggestTx}<div class="stat"><span class="k">Самая крупная трата</span><span class="v">{money(biggestTx.amount, { round: true })}</span><span class="tiny muted ellipsis">{biggestTx.note || find('categories', biggestTx.categoryId)?.name}</span></div>{/if}
        </div>
      {/if}
    </div>
  {/if}

  {#if isEnabled('workouts')}
    <div class="section">
      <div class="section-head"><h3>🏋️ Тренировки</h3><button onclick={() => go('/workouts')}>Открыть</button></div>
      <div class="grid3">
        <div class="stat"><span class="k">Тренировок</span><span class="v">{ws.length}</span></div>
        <div class="stat"><span class="k">Время</span><span class="v">{fmtMinutes(wMinutes)}</span></div>
        <div class="stat"><span class="k">В среднем</span><span class="v">{ws.length ? fmtMinutes(Math.round(wMinutes / ws.length)) : '—'}</span></div>
      </div>
      {#if topExercise}<p class="hint">Чаще всего: <b>{topExercise.name}</b> ({topExercise.n} раз)</p>{/if}
    </div>
  {/if}

  {#if isEnabled('smoking')}
    <div class="section">
      <div class="section-head"><h3>🚬 Курение</h3><button onclick={() => go('/smoking')}>Открыть</button></div>
      <div class="grid3">
        <div class="stat"><span class="k">Всего</span><span class="v">{smokes}</span></div>
        <div class="stat"><span class="k">В день</span><span class="v">{fmtNum(smokes / days)}</span></div>
        <div class="stat"><span class="k">Потрачено</span><span class="v">{money(smokeSpent, { round: true })}</span></div>
      </div>
    </div>
  {/if}

  {#if isEnabled('groceries') && trips.length}
    <div class="section">
      <div class="section-head"><h3>🛒 Покупки</h3><button onclick={() => go('/groceries/trips')}>Открыть</button></div>
      <div class="grid3">
        <div class="stat"><span class="k">Чеков</span><span class="v">{trips.length}</span></div>
        <div class="stat"><span class="k">Сумма</span><span class="v">{money(tripsTotal, { round: true })}</span></div>
        <div class="stat"><span class="k">Средний чек</span><span class="v">{money(Math.round(tripsTotal / trips.length), { round: true })}</span></div>
      </div>
      {#if topItems.length}<p class="hint">Чаще всего покупаете: {topItems.map(([n, c]) => `${n} (${c})`).join(', ')}</p>{/if}
    </div>
  {/if}

  {#if isEnabled('health') && visits.length}
    <div class="section">
      <div class="section-head"><h3>🩺 Врачи</h3></div>
      <div class="card small">Визитов: <b>{visits.length}</b> · {visits.map((v) => v.specialty).join(', ')}</div>
    </div>
  {/if}

  {#if trackers.length}
    <div class="section">
      <div class="section-head"><h3>✨ Мои трекеры</h3></div>
      <div class="list">
        {#each trackers as x (x.tr.id)}
          <button class="row" onclick={() => go('/t/' + x.tr.id)}>
            <div class="row-icon" style:--c={x.tr.color}>{x.tr.icon}</div>
            <div class="row-main">
              <div class="row-title">{x.tr.name}</div>
              <div class="row-sub">
                {x.count} зап.{x.pf && x.total && x.pf.type !== 'money' && x.pf.type !== 'duration' ? ` · всего ${fmtNum(x.total)} ${x.pf.unit ?? ''}` : ''}{x.pf?.type === 'money' && x.total ? ` · ${money(x.total, { round: true })}` : ''}{x.pf?.type === 'duration' && x.total ? ` · ${fmtMinutes(x.total)}` : ''}
              </div>
            </div>
            {#if x.goal && x.goal.days}<span class="badge c" style:--c={x.tr.color}>🎯 {x.goal.met}/{x.goal.days}</span>{/if}
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <p class="center tiny faint">Период: {p.label}{p.start <= todayKey() && p.end > todayKey() ? ` · прошло дней: ${days}` : ''}</p>
</div>
