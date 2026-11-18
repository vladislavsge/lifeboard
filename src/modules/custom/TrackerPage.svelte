<script lang="ts">
  import { find } from '../../lib/store.svelte';
  import { openSheet, go } from '../../lib/nav.svelte';
  import { fmtDay, dayOf, timeOf, groupBy, lastDays, todayKey, periodRange, inPeriod, fmtNum, money, fmtMinutes, sum, isoWeekday, parseLocal, WD_SHORT } from '../../lib/utils';
  import TopBar from '../../components/TopBar.svelte';
  import Icon from '../../components/Icon.svelte';
  import Empty from '../../components/Empty.svelte';
  import Bars from '../../components/Bars.svelte';
  import EntryForm from './EntryForm.svelte';
  import { entriesOf, entrySummary, primaryField, dayValue, aggregate, goalProgress, goalMet } from './tracker';
  import GoalProgress from './GoalProgress.svelte';

  let { id }: { id: string } = $props();
  const t = $derived(find('trackers', id));
  const entries = $derived(t ? entriesOf(t.id) : []);
  const pf = $derived(t ? primaryField(t) : undefined);

  const week = periodRange('week');
  const month = periodRange('month');
  const todayCount = $derived(entries.filter((e) => dayOf(e.date) === todayKey()).length);
  const weekCount = $derived(entries.filter((e) => inPeriod(e.date, week)).length);
  const monthCount = $derived(entries.filter((e) => inPeriod(e.date, month)).length);

  const fmt = (v: number) => {
    if (!pf) return fmtNum(v);
    if (pf.type === 'money') return money(Math.round(v), { round: true });
    if (pf.type === 'duration') return fmtMinutes(v);
    return fmtNum(v, 1);
  };

  const chart = $derived(
    t && pf
      ? lastDays(14).map((k) => ({
          label: k === todayKey() ? 'сег' : WD_SHORT[isoWeekday(parseLocal(k)) - 1].toLowerCase(),
          value: dayValue(t, pf, k),
        }))
      : [],
  );

  const primaryStat = $derived.by(() => {
    if (!t || !pf) return null;
    const mode = aggregate(t, pf);
    const vals = entries.filter((e) => typeof e.values[pf.id] === 'number');
    if (!vals.length) return null;
    if (mode === 'last') return { k: 'Последнее', v: fmt(Number(vals[0].values[pf.id])) };
    const m = vals.filter((e) => inPeriod(e.date, month));
    if (mode === 'avg') return { k: 'Среднее за месяц', v: m.length ? fmt(sum(m, (e) => Number(e.values[pf.id])) / m.length) : '—' };
    return { k: `${pf.label} за месяц`, v: fmt(sum(m, (e) => Number(e.values[pf.id]))) };
  });

  const days = $derived([...groupBy(entries.slice(0, 200), (e) => dayOf(e.date))]);
  const monthGoal = $derived(t?.goal ? goalProgress(t, month) : null);
</script>

{#if !t}
  <TopBar title="Трекер" back="/" />
  <div class="page"><Empty icon="🤷" title="Трекер не найден" /></div>
{:else}
  <TopBar title="{t.icon} {t.name}" back="/">
    {#snippet actions()}
      <button class="icon-btn" aria-label="Настроить" onclick={() => go('/settings/tracker/' + t!.id)}><Icon name="settings" /></button>
    {/snippet}
  </TopBar>

  <div class="page">
    {#if t.goal}
      <div class="card vstack gap12">
        <div class="label">Цель на сегодня</div>
        <GoalProgress {t} />
        {#if monthGoal && monthGoal.days}
          <div class="small muted">В этом месяце цель выполнена {monthGoal.met} из {monthGoal.days} дн.</div>
        {/if}
      </div>
    {/if}

    <div class="grid3">
      <div class="stat"><span class="k">Сегодня</span><span class="v">{todayCount}</span></div>
      <div class="stat"><span class="k">Неделя</span><span class="v">{weekCount}</span></div>
      <div class="stat"><span class="k">Месяц</span><span class="v">{monthCount}</span></div>
    </div>

    {#if pf && entries.length}
      <div class="card">
        <div class="hstack between">
          <span class="label">{pf.label} · 14 дней</span>
          {#if primaryStat}<span class="small"><span class="muted">{primaryStat.k}:</span> <b>{primaryStat.v}</b></span>{/if}
        </div>
        <div class="mt8"><Bars items={chart} color={t.color} showValues format={fmt} /></div>
      </div>
    {/if}

    <button class="btn solid lg block" style:--c={t.color} onclick={() => openSheet(EntryForm, { trackerId: t!.id })}>
      <Icon name="plus" size={20} /> Добавить запись
    </button>

    {#if !entries.length}
      <div class="card"><Empty icon={t.icon} title="Записей пока нет" text="Нажмите «Добавить запись» — или «+» внизу экрана." /></div>
    {:else}
      {#each days as [day, items] (day)}
        <div class="day-head">
          <span>{fmtDay(day)}</span>
          <span>{#if t.goal}{goalMet(t, day) ? '🎯 ' : ''}{/if}{items.length}</span>
        </div>
        <div class="list">
          {#each items as e (e.id)}
            <button class="row" onclick={() => openSheet(EntryForm, { trackerId: t!.id, id: e.id })}>
              <div class="row-icon" style:--c={t.color}>{t.icon}</div>
              <div class="row-main">
                <div class="row-title">{entrySummary(t, e)}</div>
                {#if e.note}<div class="row-sub">{e.note}</div>{/if}
              </div>
              <span class="tnum muted small">{timeOf(e.date)}</span>
            </button>
          {/each}
        </div>
      {/each}
    {/if}
  </div>
{/if}
