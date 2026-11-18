<script lang="ts">
  import { data, activeWorkout } from '../../lib/store.svelte';
  import { go } from '../../lib/nav.svelte';
  import { periodRange, inPeriod, sum, fmtMinutes, fmtDay, dayOf, timeOf, todayKey, lastDays, startOfWeek, addDays, dateKey, WD_SHORT, fmtClock, groupBy, MONTHS } from '../../lib/utils';
  import { workoutTypeIcon } from '../../data/exercises';
  import TopBar from '../../components/TopBar.svelte';
  import Icon from '../../components/Icon.svelte';
  import Empty from '../../components/Empty.svelte';
  import Bars from '../../components/Bars.svelte';
  import { startWorkout, logPastWorkout, plannedOn, workoutStats } from './workouts';

  const C = '#f97316';
  const cur = $derived(activeWorkout());
  const done = $derived(data.workouts.filter((w) => w.status === 'done').sort((a, b) => (a.date < b.date ? 1 : -1)));
  const week = periodRange('week');
  const month = periodRange('month');
  const weekList = $derived(done.filter((w) => inPeriod(w.date, week)));
  const monthList = $derived(done.filter((w) => inPeriod(w.date, month)));
  const today = $derived(plannedOn(todayKey()));

  // текущая неделя по дням: план / сделано
  const weekDays = $derived.by(() => {
    const s = startOfWeek(new Date());
    return Array.from({ length: 7 }, (_, i) => {
      const key = dateKey(addDays(s, i));
      return {
        key,
        label: WD_SHORT[i],
        done: done.some((w) => dayOf(w.date) === key),
        planned: plannedOn(key).length > 0,
        today: key === todayKey(),
      };
    });
  });

  // минуты по неделям (8 недель)
  const weeksChart = $derived.by(() => {
    const s = startOfWeek(new Date());
    return Array.from({ length: 8 }, (_, i) => {
      const ws = addDays(s, (i - 7) * 7);
      const p = { start: dateKey(ws), end: dateKey(addDays(ws, 7)), label: '' };
      const mins = sum(done.filter((w) => inPeriod(w.date, p)), (w) => w.duration ?? 0);
      return { label: `${ws.getDate()}.${String(ws.getMonth() + 1).padStart(2, '0')}`, value: mins };
    });
  });

  // серия: подряд недель с хотя бы одной тренировкой
  const streak = $derived.by(() => {
    let n = 0;
    let ws = startOfWeek(new Date());
    // текущую неделю считаем, если в ней уже есть тренировка
    for (let i = 0; i < 104; i++) {
      const p = { start: dateKey(ws), end: dateKey(addDays(ws, 7)), label: '' };
      const has = done.some((w) => inPeriod(w.date, p));
      if (has) n++;
      else if (i > 0) break;
      ws = addDays(ws, -7);
    }
    return n;
  });

  const history = $derived([...groupBy(done.slice(0, 60), (w) => MONTHS[Number(w.date.slice(5, 7)) - 1] + ' ' + w.date.slice(0, 4))]);
  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(t);
  });
</script>

<TopBar title="Тренировки" back="/">
  {#snippet actions()}
    <button class="icon-btn" aria-label="Программы" onclick={() => go('/workouts/programs')}><Icon name="list" /></button>
    <button class="icon-btn" aria-label="Упражнения" onclick={() => go('/workouts/exercises')}><Icon name="search" /></button>
  {/snippet}
</TopBar>

<div class="page">
  {#if cur}
    <button class="card live" onclick={() => go('/workouts/w/' + cur.id)}>
      <div class="grow" style="text-align:left">
        <div class="small" style="opacity:.85">Идёт тренировка</div>
        <div class="bold" style="font-size:17px">{cur.title}</div>
      </div>
      <div class="big-num" style="font-size:24px">{fmtClock((now - (cur.startedAt ?? now)) / 1000)}</div>
      <Icon name="right" />
    </button>
  {/if}

  <div class="card vstack gap12">
    <div class="week">
      {#each weekDays as d (d.key)}
        <div class="wd" class:today={d.today}>
          <span class="small muted">{d.label}</span>
          <span class="circle" class:done={d.done} class:planned={d.planned && !d.done}>
            {#if d.done}<Icon name="check" size={16} stroke={3} />{:else}{Number(d.key.slice(8))}{/if}
          </span>
        </div>
      {/each}
    </div>
    <div class="grid3">
      <div class="stat alt"><span class="k">За неделю</span><span class="v">{weekList.length}</span></div>
      <div class="stat alt"><span class="k">Время</span><span class="v">{fmtMinutes(sum(weekList, (w) => w.duration ?? 0))}</span></div>
      <div class="stat alt"><span class="k">Серия, нед.</span><span class="v">{streak} 🔥</span></div>
    </div>
  </div>

  {#if !cur}
    {#if today.length}
      <div class="section">
        <div class="section-head"><h3>Сегодня по плану</h3></div>
        <div class="list">
          {#each today as p (p.day.id)}
            <div class="row">
              <div class="row-icon" style:--c={C}>{p.done ? '✅' : '📋'}</div>
              <div class="row-main">
                <div class="row-title">{p.day.name}</div>
                <div class="row-sub">{p.program.name}{p.day.time ? ' · ' + p.day.time : ''} · {p.day.exercises.length} упр.</div>
              </div>
              {#if p.done}
                <button class="btn sm" onclick={() => go('/workouts/w/' + p.done!.id)}>Открыть</button>
              {:else}
                <button class="btn sm solid" style:--c={C} onclick={() => go('/workouts/w/' + startWorkout({ programId: p.program.id, dayId: p.day.id }))}>
                  <Icon name="play" size={14} /> Начать
                </button>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}
    <div class="grid2">
      <button class="btn solid lg" style:--c={C} onclick={() => go('/workouts/w/' + startWorkout())}><Icon name="play" size={18} /> Начать</button>
      <button class="btn lg" onclick={() => go('/workouts/w/' + logPastWorkout())}><Icon name="plus" size={18} /> Записать</button>
    </div>
  {/if}

  <div class="grid2">
    <button class="card tight navcard" onclick={() => go('/workouts/programs')}>
      <span style="font-size:24px">📋</span>
      <span class="bold">Программы</span>
      <span class="small muted">{data.programs.length ? `${data.programs.filter((p) => p.active).length} активн.` : 'создать план'}</span>
    </button>
    <button class="card tight navcard" onclick={() => go('/workouts/exercises')}>
      <span style="font-size:24px">📖</span>
      <span class="bold">Упражнения</span>
      <span class="small muted">библиотека и рекорды</span>
    </button>
  </div>

  {#if done.length}
    <div class="card">
      <div class="hstack between">
        <span class="label">Минут в неделю</span>
        <span class="small muted">в этом месяце: {monthList.length} трен.</span>
      </div>
      <div class="mt8"><Bars items={weeksChart} color={C} showValues /></div>
    </div>
  {/if}

  <div class="section">
    <div class="section-head"><h3>История</h3></div>
    {#if !done.length}
      <div class="card"><Empty icon="🏋️" title="Пока нет тренировок" text="Нажмите «Начать» в зале или «Записать», если уже позанимались." /></div>
    {:else}
      {#each history as [label, items] (label)}
        <div class="day-head"><span>{label}</span><span>{items.length}</span></div>
        <div class="list">
          {#each items as w (w.id)}
            {@const st = workoutStats(w)}
            <button class="row" onclick={() => go('/workouts/w/' + w.id)}>
              <div class="row-icon" style:--c={C}>{workoutTypeIcon(w.type)}</div>
              <div class="row-main">
                <div class="row-title">{w.title}</div>
                <div class="row-sub">
                  {fmtDay(dayOf(w.date))}, {timeOf(w.date)} · {fmtMinutes(w.duration)}{st.exercises ? ` · ${st.exercises} упр.` : ''}
                </div>
              </div>
              {#if w.rating}<span>{['😫', '😕', '😐', '🙂', '💪'][w.rating - 1]}</span>{/if}
            </button>
          {/each}
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .live {
    display: flex;
    align-items: center;
    gap: 12px;
    background: linear-gradient(135deg, #f97316, #ea580c);
    color: #fff;
  }
  .week {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 4px;
  }
  .wd {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  .wd.today .small {
    color: var(--text);
    font-weight: 700;
  }
  .circle {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--card-2);
    font-weight: 650;
    font-size: 14px;
    font-variant-numeric: tabular-nums;
  }
  .wd.today .circle {
    box-shadow: inset 0 0 0 2px var(--text);
  }
  .circle.done {
    background: #f97316;
    color: #fff;
  }
  .circle.planned {
    box-shadow: inset 0 0 0 2px #f97316;
  }
  .navcard {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    text-align: left;
  }
  .navcard:active {
    transform: scale(0.98);
  }
</style>
