<script lang="ts">
  import { data, app, enabledModules, activeWorkout } from '../lib/store.svelte';
  import { go, openSheet } from '../lib/nav.svelte';
  import {
    money, periodRange, inPeriod, sum, todayKey, dayOf, WD_FULL, MONTHS_GEN, isoWeekday, relTime, untilText,
    fmtClock, fmtMinutes, addDays, dateKey,
  } from '../lib/utils';
  import Icon from '../components/Icon.svelte';
  import TxForm from '../modules/finance/TxForm.svelte';
  import EntryForm from '../modules/custom/EntryForm.svelte';
  import AppointmentForm from '../modules/health/AppointmentForm.svelte';
  import { totals, budgetStatuses, upcomingRecurring } from '../modules/finance/finance';
  import BudgetBar from '../modules/finance/BudgetBar.svelte';
  import GoalProgress from '../modules/custom/GoalProgress.svelte';
  import { logSmoke, countOn, lastSmoke } from '../modules/smoking/smoking';
  import { plannedOn, startWorkout } from '../modules/workouts/workouts';
  import { entriesOf, entrySummary } from '../modules/custom/tracker';

  const modules = $derived(enabledModules());
  const d = new Date();
  const hour = d.getHours();
  const greeting = hour < 5 ? 'Доброй ночи' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';
  const dateLine = `${WD_FULL[isoWeekday(d) - 1]}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;

  // финансы
  const month = periodRange('month');
  const monthTx = $derived(data.transactions.filter((t) => inPeriod(t.date, month)));
  const mt = $derived(totals(monthTx));
  const todaySpent = $derived(sum(data.transactions.filter((t) => t.type === 'expense' && dayOf(t.date) === todayKey()), (t) => t.amount));
  const totalBudget = $derived(budgetStatuses().find((b) => !b.budget.categoryId));
  const overBudgets = $derived(budgetStatuses().filter((b) => b.budget.categoryId && b.pct >= 100));
  const soonPay = $derived(upcomingRecurring(3)[0]);

  // тренировки
  const cur = $derived(activeWorkout());
  const week = periodRange('week');
  const weekWorkouts = $derived(data.workouts.filter((w) => w.status === 'done' && inPeriod(w.date, week)));
  const todayPlan = $derived(plannedOn(todayKey()).filter((p) => !p.done));
  const nextPlan = $derived.by(() => {
    for (let i = 1; i <= 7; i++) {
      const key = dateKey(addDays(new Date(), i));
      const p = plannedOn(key)[0];
      if (p) return { key, p };
    }
    return null;
  });

  // курение
  const smokesToday = $derived(countOn(todayKey()));
  const last = $derived(lastSmoke());

  // покупки
  const inList = $derived(data.groceryItems.filter((i) => i.inList).length);
  const groceriesMonth = $derived(sum(data.groceryTrips.filter((t) => inPeriod(t.date, month)), (t) => t.total));

  // врачи
  const nextAppt = $derived(
    data.appointments.filter((a) => a.status === 'planned' && a.date >= todayKey()).sort((a, b) => (a.date < b.date ? -1 : 1))[0],
  );

  let now = $state(Date.now());
  $effect(() => {
    if (!cur) return;
    const t = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(t);
  });
</script>

<div class="page" style="padding-top:calc(var(--safe-t) + 18px)">
  <header class="hello">
    <div>
      <div class="muted small">{dateLine}</div>
      <h1>{greeting}</h1>
    </div>
    <div class="hstack gap4">
      <button class="icon-btn filled" aria-label="Статистика" onclick={() => go('/stats')}><Icon name="chart" size={20} /></button>
      <button class="icon-btn filled" aria-label="Настроить главную" onclick={() => go('/settings/modules')}><Icon name="grid" size={20} /></button>
    </div>
  </header>

  {#if !data.settings.onboarded}
    <div class="card vstack gap12 onboard">
      <div class="bold" style="font-size:17px">👋 Это ваш личный трекер</div>
      <p class="small">
        Включите нужные разделы, добавьте свои карты и создайте любые трекеры — вес, сон, воду, что угодно. Все данные хранятся только на этом устройстве.
      </p>
      <div class="grid2">
        <button class="btn primary sm" onclick={() => go('/settings/modules')}>Настроить</button>
        <button class="btn sm" onclick={() => (data.settings.onboarded = true)}>Понятно</button>
      </div>
    </div>
  {/if}

  {#if cur}
    <button class="card live" onclick={() => go('/workouts/w/' + cur.id)}>
      <span style="font-size:26px">🏋️</span>
      <div class="grow" style="text-align:left">
        <div class="small" style="opacity:.85">Идёт тренировка</div>
        <div class="bold">{cur.title}</div>
      </div>
      <span class="bold tnum" style="font-size:20px">{fmtClock((now - (cur.startedAt ?? now)) / 1000)}</span>
    </button>
  {/if}

  {#each modules as m (m.id)}
    <section class="card widget" style:--c={m.color}>
      <button class="wh" onclick={() => go(m.path)}>
        <span class="row-icon">{m.icon}</span>
        <span class="grow bold">{m.name}</span>
        <Icon name="right" size={18} />
      </button>

      {#if m.id === 'finance'}
        <div class="grid2">
          <div><div class="label">Расходы, {month.label.toLowerCase()}</div><div class="v">{money(mt.expense)}</div></div>
          <div><div class="label">Доходы</div><div class="v plus">+{money(mt.income)}</div></div>
        </div>
        {#if totalBudget}<BudgetBar s={totalBudget} />{/if}
        <div class="small muted">Сегодня потрачено: <b class="tnum" style="color:var(--text)">{money(todaySpent)}</b></div>
        {#if overBudgets.length}
          <div class="small danger-text">⚠️ Превышен бюджет: {overBudgets.map((b) => b.name).join(', ')}</div>
        {/if}
        {#if soonPay}
          <div class="small muted">🔁 {soonPay.name} {money(soonPay.amount)} — {untilText(soonPay.nextDate + 'T09:00')}</div>
        {/if}
        <div class="grid2">
          <button class="btn sm solid" style:--c="var(--red)" onclick={() => openSheet(TxForm, { type: 'expense' })}><Icon name="minus" size={16} /> Расход</button>
          <button class="btn sm solid" style:--c="var(--green)" onclick={() => openSheet(TxForm, { type: 'income' })}><Icon name="plus" size={16} /> Доход</button>
        </div>
      {:else if m.id === 'workouts'}
        <div class="grid2">
          <div><div class="label">На этой неделе</div><div class="v">{weekWorkouts.length} трен.</div></div>
          <div><div class="label">Время</div><div class="v">{fmtMinutes(sum(weekWorkouts, (w) => w.duration ?? 0))}</div></div>
        </div>
        {#if todayPlan.length}
          <div class="small">Сегодня: <b>{todayPlan[0].day.name}</b>{todayPlan[0].day.time ? ' в ' + todayPlan[0].day.time : ''}</div>
        {:else if nextPlan}
          <div class="small muted">Следующая: {nextPlan.p.day.name} · {untilText(nextPlan.key + 'T' + (nextPlan.p.day.time ?? '12:00'))}</div>
        {/if}
        {#if !cur}
          <button
            class="btn sm solid block"
            onclick={() =>
              go('/workouts/w/' + startWorkout(todayPlan[0] ? { programId: todayPlan[0].program.id, dayId: todayPlan[0].day.id } : {}))}
          >
            <Icon name="play" size={14} /> {todayPlan.length ? 'Начать по плану' : 'Начать тренировку'}
          </button>
        {/if}
      {:else if m.id === 'smoking'}
        <div class="hstack between">
          <div>
            <div class="label">Сегодня</div>
            <div class="v" class:danger-text={!!data.settings.smokeLimit && smokesToday >= data.settings.smokeLimit}>
              {smokesToday}{data.settings.smokeLimit ? ` / ${data.settings.smokeLimit}` : ''}
            </div>
          </div>
          <div style="text-align:right">
            <div class="label">Последняя</div>
            <div class="small bold">{last ? relTime(last.date, app.now) : '—'}</div>
          </div>
        </div>
        <button class="btn sm block" style="background:#475569;color:#fff" onclick={() => logSmoke()}>🚬 Покурил</button>
      {:else if m.id === 'groceries'}
        <div class="grid2">
          <div><div class="label">В списке</div><div class="v">{inList} {inList === 1 ? 'товар' : 'тов.'}</div></div>
          <div><div class="label">Продукты за месяц</div><div class="v">{money(groceriesMonth)}</div></div>
        </div>
        <button class="btn sm solid block" onclick={() => go('/groceries')}><Icon name="cart" size={16} /> Открыть список</button>
      {:else if m.id === 'health'}
        {#if nextAppt}
          <button class="appt" onclick={() => go('/health')}>
            <div class="bold">{nextAppt.specialty}{nextAppt.doctorName ? ' — ' + nextAppt.doctorName : ''}</div>
            <div class="small" style="color:var(--c)">{untilText(nextAppt.date)}{nextAppt.clinic ? ' · ' + nextAppt.clinic : ''}</div>
          </button>
        {:else}
          <div class="small muted">Ближайших визитов нет</div>
        {/if}
        <button class="btn sm block tinted" onclick={() => openSheet(AppointmentForm, {})}><Icon name="plus" size={16} /> Запись к врачу</button>
      {:else if m.tracker}
        {@const t = m.tracker}
        {@const es = entriesOf(t.id)}
        {@const todayN = es.filter((e) => dayOf(e.date) === todayKey()).length}
        <div class="hstack between">
          <div class="grow" style="min-width:0">
            <div class="label">Последняя запись</div>
            <div class="small bold ellipsis">{es[0] ? entrySummary(t, es[0]) : '—'}</div>
            {#if es[0]}<div class="tiny muted">{relTime(es[0].date, app.now)}</div>{/if}
          </div>
          <div style="text-align:right">
            <div class="label">Сегодня</div>
            <div class="v">{todayN}</div>
          </div>
        </div>
        {#if t.goal}<GoalProgress {t} compact />{/if}
        <button class="btn sm block solid" onclick={() => openSheet(EntryForm, { trackerId: t.id })}><Icon name="plus" size={16} /> Добавить</button>
      {/if}
    </section>
  {/each}

  {#if !modules.length}
    <div class="card empty">
      <div class="e">🧩</div>
      <b>Все разделы выключены</b>
      <button class="btn sm primary mt8" onclick={() => go('/settings/modules')}>Включить разделы</button>
    </div>
  {/if}

  <button class="card add-tracker" onclick={() => go('/settings/tracker/new')}>
    <span class="row-icon" style:--c="var(--accent)"><Icon name="plus" size={20} /></span>
    <span class="grow" style="text-align:left">
      <span class="bold" style="display:block">Свой трекер</span>
      <span class="small muted">Вес, сон, вода, лекарства — что угодно</span>
    </span>
  </button>

  {#if data.settings.lastBackupAt === undefined && data.transactions.length + data.smokes.length + data.workouts.length > 30}
    <button class="hint center" onclick={() => go('/settings')}>💾 Данные только на этом телефоне — сделайте резервную копию в настройках</button>
  {/if}
</div>

<style>
  .hello {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    padding: 0 4px 4px;
  }
  .hello h1 {
    font-size: 28px;
    font-weight: 800;
    letter-spacing: -0.02em;
  }
  .onboard {
    background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 22%, var(--card)), var(--card));
  }
  .live {
    display: flex;
    align-items: center;
    gap: 12px;
    background: linear-gradient(135deg, #f97316, #ea580c);
    color: #fff;
  }
  .widget {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .wh {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: -4px -4px 0;
    color: var(--text);
    text-align: left;
  }
  .wh .row-icon {
    width: 34px;
    height: 34px;
    font-size: 18px;
    border-radius: 11px;
  }
  .wh :global(svg) {
    color: var(--faint);
  }
  .v {
    font-size: 20px;
    font-weight: 750;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.01em;
  }
  .appt {
    text-align: left;
    padding: 10px 12px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--c) 10%, transparent);
  }
  .add-tracker {
    display: flex;
    align-items: center;
    gap: 12px;
    border: 1.5px dashed var(--card-3);
    background: transparent;
  }
</style>
