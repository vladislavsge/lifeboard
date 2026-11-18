<script lang="ts">
  import { data, isEnabled, find } from '../lib/store.svelte';
  import { go, openSheet } from '../lib/nav.svelte';
  import { MONTHS, WD_SHORT, dateKey, todayKey, startOfWeek, addDays, dayOf, timeOf, fmtDay, money, sum, fmtMinutes } from '../lib/utils';
  import { workoutTypeIcon } from '../data/exercises';
  import TopBar from '../components/TopBar.svelte';
  import Icon from '../components/Icon.svelte';
  import AppointmentDetail from '../modules/health/AppointmentDetail.svelte';
  import AppointmentForm from '../modules/health/AppointmentForm.svelte';
  import TxForm from '../modules/finance/TxForm.svelte';
  import TxRow from '../modules/finance/TxRow.svelte';
  import EntryForm from '../modules/custom/EntryForm.svelte';
  import { plannedOn, startWorkout } from '../modules/workouts/workouts';
  import { countOn } from '../modules/smoking/smoking';
  import { entrySummary } from '../modules/custom/tracker';

  const today = todayKey();
  let ym = $state({ y: new Date().getFullYear(), m: new Date().getMonth() });
  let selected = $state(today);

  const grid = $derived.by(() => {
    const first = new Date(ym.y, ym.m, 1);
    const start = startOfWeek(first);
    return Array.from({ length: 42 }, (_, i) => {
      const d = addDays(start, i);
      return { key: dateKey(d), day: d.getDate(), inMonth: d.getMonth() === ym.m };
    }).filter((c, i, arr) => i < 35 || arr.slice(35).some((x) => x.inMonth));
  });

  // индекс событий по дням для точек
  const marks = $derived.by(() => {
    const m = new Map<string, Set<string>>();
    const put = (k: string, t: string) => (m.get(k) ?? m.set(k, new Set()).get(k)!).add(t);
    if (isEnabled('workouts')) for (const w of data.workouts) if (w.status === 'done') put(dayOf(w.date), 'workout');
    if (isEnabled('health')) for (const a of data.appointments) if (a.status !== 'cancelled') put(dayOf(a.date), 'health');
    if (isEnabled('finance')) for (const t of data.transactions) put(dayOf(t.date), 'money');
    return m;
  });

  const plannedDays = $derived.by(() => {
    if (!isEnabled('workouts')) return new Set<string>();
    const s = new Set<string>();
    for (const c of grid) if (c.key >= today && plannedOn(c.key).some((p) => !p.done)) s.add(c.key);
    return s;
  });

  function shift(n: number) {
    const d = new Date(ym.y, ym.m + n, 1);
    ym = { y: d.getFullYear(), m: d.getMonth() };
  }

  const dayWorkouts = $derived(data.workouts.filter((w) => w.status === 'done' && dayOf(w.date) === selected));
  const dayPlanned = $derived(isEnabled('workouts') ? plannedOn(selected).filter((p) => !p.done) : []);
  const dayAppts = $derived(data.appointments.filter((a) => dayOf(a.date) === selected).sort((a, b) => (a.date < b.date ? -1 : 1)));
  const dayTx = $derived(data.transactions.filter((t) => dayOf(t.date) === selected).sort((a, b) => (a.date < b.date ? 1 : -1)));
  const daySmokes = $derived(countOn(selected));
  const dayEntries = $derived(data.entries.filter((e) => dayOf(e.date) === selected && isEnabled('tracker:' + e.trackerId)));
  const nothing = $derived(!dayWorkouts.length && !dayPlanned.length && !dayAppts.length && !dayTx.length && !daySmokes && !dayEntries.length);
</script>

<TopBar title="Календарь" />

<div class="page">
  <div class="card tight">
    <div class="hstack between" style="padding:0 2px 8px">
      <button class="icon-btn" aria-label="Предыдущий месяц" onclick={() => shift(-1)}><Icon name="left" /></button>
      <button class="bold" style="font-size:17px" onclick={() => { ym = { y: new Date().getFullYear(), m: new Date().getMonth() }; selected = today; }}>
        {MONTHS[ym.m]} {ym.y}
      </button>
      <button class="icon-btn" aria-label="Следующий месяц" onclick={() => shift(1)}><Icon name="right" /></button>
    </div>
    <div class="cal">
      {#each WD_SHORT as w (w)}<span class="wh">{w}</span>{/each}
      {#each grid as c (c.key)}
        {@const mk = marks.get(c.key)}
        <button class="cell" class:out={!c.inMonth} class:today={c.key === today} class:sel={c.key === selected} onclick={() => (selected = c.key)}>
          <span class="num">{c.day}</span>
          <span class="dots">
            {#if mk?.has('workout')}<i style="background:#f97316"></i>{:else if plannedDays.has(c.key)}<i class="ring"></i>{/if}
            {#if mk?.has('health')}<i style="background:#ef4444"></i>{/if}
            {#if mk?.has('money')}<i style="background:var(--green)"></i>{/if}
          </span>
        </button>
      {/each}
    </div>
    <div class="legend tiny muted">
      <span><i style="background:#f97316"></i>тренировка</span>
      <span><i class="ring"></i>по плану</span>
      <span><i style="background:#ef4444"></i>врач</span>
      <span><i style="background:var(--green)"></i>операции</span>
    </div>
  </div>

  <div class="section">
    <div class="section-head">
      <h3>{fmtDay(selected)}</h3>
      {#if isEnabled('health')}<button onclick={() => openSheet(AppointmentForm, { date: selected })}>+ Врач</button>{/if}
    </div>

    {#if nothing}
      <div class="card muted center small">Ничего не запланировано и не записано</div>
    {/if}

    {#if dayPlanned.length || dayWorkouts.length || dayAppts.length}
      <div class="list">
        {#each dayPlanned as p (p.day.id)}
          <div class="row">
            <div class="row-icon" style:--c="#f97316">📋</div>
            <div class="row-main">
              <div class="row-title">{p.day.name}</div>
              <div class="row-sub">по плану{p.day.time ? ' · ' + p.day.time : ''} · {p.program.name}</div>
            </div>
            {#if selected === today}
              <button class="btn sm solid" style:--c="#f97316" onclick={() => go('/workouts/w/' + startWorkout({ programId: p.program.id, dayId: p.day.id }))}>Начать</button>
            {/if}
          </div>
        {/each}
        {#each dayWorkouts as w (w.id)}
          <button class="row" onclick={() => go('/workouts/w/' + w.id)}>
            <div class="row-icon" style:--c="#f97316">{workoutTypeIcon(w.type)}</div>
            <div class="row-main">
              <div class="row-title">{w.title}</div>
              <div class="row-sub">{timeOf(w.date)} · {fmtMinutes(w.duration)}</div>
            </div>
          </button>
        {/each}
        {#each dayAppts as a (a.id)}
          <button class="row" onclick={() => openSheet(AppointmentDetail, { id: a.id })}>
            <div class="row-icon" style:--c="#ef4444">🩺</div>
            <div class="row-main">
              <div class="row-title">{a.specialty}{a.doctorName ? ' — ' + a.doctorName : ''}</div>
              <div class="row-sub">{timeOf(a.date)}{a.clinic ? ' · ' + a.clinic : ''}{a.status === 'cancelled' ? ' · отменено' : a.status === 'done' ? ' · состоялся' : ''}</div>
            </div>
          </button>
        {/each}
      </div>
    {/if}

    {#if daySmokes && isEnabled('smoking')}
      <button class="card tight hstack" onclick={() => go('/smoking')}>
        <span>🚬</span><span class="grow" style="text-align:left">Покурил: <b>{daySmokes}</b></span><Icon name="right" size={18} />
      </button>
    {/if}

    {#if dayEntries.length}
      <div class="list">
        {#each dayEntries as e (e.id)}
          {@const t = find('trackers', e.trackerId)}
          {#if t}
            <button class="row" onclick={() => openSheet(EntryForm, { trackerId: t.id, id: e.id })}>
              <div class="row-icon" style:--c={t.color}>{t.icon}</div>
              <div class="row-main">
                <div class="row-title">{entrySummary(t, e)}</div>
                <div class="row-sub">{t.name} · {timeOf(e.date)}</div>
              </div>
            </button>
          {/if}
        {/each}
      </div>
    {/if}

    {#if dayTx.length && isEnabled('finance')}
      <div class="day-head">
        <span>Операции</span>
        <span class="tnum">{money(sum(dayTx, (t) => (t.type === 'income' ? t.amount : -t.amount)), { sign: true })}</span>
      </div>
      <div class="list">
        {#each dayTx as tx (tx.id)}<TxRow {tx} />{/each}
      </div>
    {/if}

    {#if isEnabled('finance')}
      <button class="btn block" onclick={() => openSheet(TxForm, { type: 'expense' })}><Icon name="plus" size={18} /> Расход</button>
    {/if}
  </div>
</div>

<style>
  .cal {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 2px;
  }
  .wh {
    text-align: center;
    font-size: 11px;
    font-weight: 600;
    color: var(--muted);
    padding-bottom: 4px;
  }
  .cell {
    aspect-ratio: 1 / 1.05;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    font-variant-numeric: tabular-nums;
  }
  .cell .num {
    font-weight: 600;
    font-size: 15px;
  }
  .cell.out {
    opacity: 0.35;
  }
  .cell.today .num {
    color: var(--accent);
    font-weight: 800;
  }
  .cell.sel {
    background: var(--accent);
  }
  .cell.sel .num {
    color: #fff;
  }
  .dots {
    display: flex;
    gap: 3px;
    height: 6px;
  }
  i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    display: inline-block;
  }
  i.ring {
    box-shadow: inset 0 0 0 1.5px #f97316;
  }
  .cell.sel i {
    box-shadow: 0 0 0 1px #fff;
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    padding: 10px 4px 2px;
  }
  .legend span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
</style>
