<script lang="ts">
  import type { TxType } from '../../lib/types';
  import { data, accountLabel, account, payRecurring } from '../../lib/store.svelte';
  import { openSheet, go } from '../../lib/nav.svelte';
  import { money, periodRange, fmtDay, groupBy, dayOf, sum, todayKey, untilText, type PeriodKind } from '../../lib/utils';
  import TopBar from '../../components/TopBar.svelte';
  import PeriodNav from '../../components/PeriodNav.svelte';
  import Seg from '../../components/Seg.svelte';
  import Empty from '../../components/Empty.svelte';
  import Icon from '../../components/Icon.svelte';
  import TxRow from './TxRow.svelte';
  import TxForm from './TxForm.svelte';
  import BudgetBar from './BudgetBar.svelte';
  import RecurringForm from './RecurringForm.svelte';
  import { txIn, totals, byCategory, previousPeriod, deltaPct, budgetStatuses, upcomingRecurring, exportCsv, budgetColor } from './finance';

  let kind = $state<PeriodKind>('month');
  let offset = $state(0);
  let tab = $state<'ops' | 'cats' | 'accounts'>('ops');
  let filter = $state<'all' | TxType>('all');
  let catType = $state<TxType>('expense');
  let accFilter = $state<string>('');

  const period = $derived(periodRange(kind, offset));
  const list = $derived(txIn(period));
  const t = $derived(totals(list));
  const shown = $derived(list.filter((x) => (filter === 'all' || x.type === filter) && (!accFilter || x.accountId === accFilter)));
  const days = $derived([...groupBy(shown, (x) => dayOf(x.date))]);
  const cats = $derived(byCategory(list, catType));
  const catTotal = $derived(sum(cats, (c) => c.amount));

  // сравнение с прошлым периодом (для текущего — тот же отрезок дней)
  const prevP = $derived(previousPeriod(kind, offset));
  const prevT = $derived(prevP ? totals(txIn(prevP)) : null);
  const expDelta = $derived(prevT ? deltaPct(t.expense, prevT.expense) : null);
  const prevCats = $derived(prevP ? new Map(byCategory(txIn(prevP), catType).map((c) => [c.id, c.amount])) : new Map<string, number>());

  const budgets = $derived(budgetStatuses());
  const totalBudget = $derived(budgets.find((b) => !b.budget.categoryId));
  const budgetByCat = $derived(new Map(budgets.filter((b) => b.budget.categoryId).map((b) => [b.budget.categoryId!, b])));
  const upcoming = $derived(upcomingRecurring(7));
  const today = todayKey();

  function csv() {
    exportCsv(shown, `operacii-${period.label.replace(/\s+/g, '-').toLowerCase()}.csv`);
  }

  const accounts = $derived.by(() => {
    const m = new Map<string, { id: string; expense: number; income: number; count: number }>();
    for (const x of list) {
      const a = m.get(x.accountId) ?? { id: x.accountId, expense: 0, income: 0, count: 0 };
      if (x.type === 'expense') a.expense += x.amount;
      else a.income += x.amount;
      a.count++;
      m.set(x.accountId, a);
    }
    return [...m.values()].sort((a, b) => b.expense - a.expense);
  });
</script>

<TopBar title="Финансы" back="/">
  {#snippet actions()}
    <button class="icon-btn" aria-label="Статистика" onclick={() => go('/stats')}><Icon name="chart" /></button>
  {/snippet}
</TopBar>

<div class="page">
  <div class="chips">
    <button class="chip sm" onclick={() => go('/finance/accounts')}>💳 Карты</button>
    <button class="chip sm" onclick={() => go('/finance/budgets')}>🎯 Бюджеты{data.budgets.length ? ` · ${data.budgets.length}` : ''}</button>
    <button class="chip sm" onclick={() => go('/finance/recurring')}>🔁 Регулярные{data.recurring.length ? ` · ${data.recurring.length}` : ''}</button>
    <button class="chip sm" onclick={() => go('/finance/categories')}>🗂️ Категории</button>
    <button class="chip sm" onclick={csv} disabled={!shown.length}>⬇️ CSV</button>
  </div>

  <PeriodNav bind:kind bind:offset />

  <div class="card vstack gap12">
    <div>
      <div class="label">Баланс за период</div>
      <div class="big-num" class:plus={t.balance > 0}>{money(t.balance, { sign: true })}</div>
    </div>
    <div class="grid2">
      <div class="stat alt">
        <span class="k">Доходы</span>
        <span class="v plus">+{money(t.income)}</span>
      </div>
      <div class="stat alt">
        <span class="k">Расходы</span>
        <span class="v">−{money(t.expense)}</span>
        {#if expDelta !== null}
          <span class="tiny" style:color={expDelta > 0 ? 'var(--red)' : 'var(--green)'}>
            {expDelta > 0 ? '▲' : '▼'} {Math.abs(expDelta)}% к прошлому периоду
          </span>
        {/if}
      </div>
    </div>
    {#if totalBudget && kind === 'month' && offset === 0}
      <BudgetBar s={totalBudget} />
    {/if}
    <div class="grid2">
      <button class="btn solid" style:--c="var(--red)" onclick={() => openSheet(TxForm, { type: 'expense' })}>
        <Icon name="minus" size={18} /> Расход
      </button>
      <button class="btn solid" style:--c="var(--green)" onclick={() => openSheet(TxForm, { type: 'income' })}>
        <Icon name="plus" size={18} /> Доход
      </button>
    </div>
  </div>

  {#if upcoming.length && offset === 0}
    <div class="section">
      <div class="section-head"><h3>Ближайшие платежи</h3><button onclick={() => go('/finance/recurring')}>Все</button></div>
      <div class="list">
        {#each upcoming.slice(0, 4) as r (r.id)}
          {@const due = !r.auto && r.nextDate <= today}
          <div class="row" style="min-height:48px">
            <button class="row-main" style="text-align:left" onclick={() => openSheet(RecurringForm, { id: r.id })}>
              <div class="row-title">{r.name}</div>
              <div class="row-sub">{due ? 'пора оплатить' : untilText(r.nextDate + 'T09:00')}{r.auto ? ' · спишется само' : ''}</div>
            </button>
            {#if due}
              <button class="btn sm solid" style:--c="var(--green)" onclick={() => payRecurring(r)}>Оплачено</button>
            {:else}
              <span class="bold tnum" class:plus={r.type === 'income'}>{r.type === 'income' ? '+' : '−'}{money(r.amount)}</span>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <Seg
    bind:value={tab}
    options={[
      { value: 'ops', label: 'Операции' },
      { value: 'cats', label: 'Категории' },
      { value: 'accounts', label: 'Карты' },
    ]}
  />

  {#if tab === 'ops'}
    <div class="chips">
      <button class="chip sm" class:on={filter === 'all'} onclick={() => (filter = 'all')}>Все</button>
      <button class="chip sm" class:on={filter === 'expense'} onclick={() => (filter = 'expense')}>Расходы</button>
      <button class="chip sm" class:on={filter === 'income'} onclick={() => (filter = 'income')}>Доходы</button>
      {#each data.accounts.filter((a) => !a.archived) as a (a.id)}
        <button class="chip sm" class:on={accFilter === a.id} onclick={() => (accFilter = accFilter === a.id ? '' : a.id)}>
          {a.kind === 'cash' ? '💵' : '💳'} {a.name}
        </button>
      {/each}
    </div>

    {#if !shown.length}
      <Empty icon="🧾" title="Операций нет" text="Добавьте первый расход или доход — кнопками выше или «+» внизу." />
    {:else}
      {#each days as [day, items] (day)}
        <div class="section">
          <div class="day-head">
            <span>{fmtDay(day)}</span>
            <span class="tnum">{money(sum(items, (x) => (x.type === 'income' ? x.amount : -x.amount)), { sign: true })}</span>
          </div>
          <div class="list">
            {#each items as tx (tx.id)}
              <TxRow {tx} />
            {/each}
          </div>
        </div>
      {/each}
    {/if}
  {:else if tab === 'cats'}
    <Seg
      bind:value={catType}
      options={[
        { value: 'expense', label: 'Расходы' },
        { value: 'income', label: 'Доходы' },
      ]}
    />
    {#if !cats.length}
      <Empty icon="📊" title="Нет данных за период" />
    {:else}
      <div class="list">
        {#each cats as c (c.id)}
          {@const b = kind === 'month' && offset === 0 && catType === 'expense' ? budgetByCat.get(c.id) : undefined}
          {@const prev = prevCats.get(c.id)}
          {@const d = prev ? deltaPct(c.amount, prev) : null}
          <button
            class="row"
            onclick={() => {
              tab = 'ops';
              filter = catType;
            }}
          >
            <div class="row-icon" style:--c="var(--muted)">{c.icon}</div>
            <div class="row-main vstack gap4">
              <div class="hstack between">
                <span class="row-title">{c.name}</span>
                <span class="bold tnum">{money(c.amount)}</span>
              </div>
              <div class="progress" style:--c={b ? budgetColor(b.pct) : catType === 'income' ? 'var(--green)' : 'var(--accent)'}>
                <div style:width="{b ? Math.min(100, b.pct) : (c.amount / catTotal) * 100}%"></div>
              </div>
              <div class="row-sub">
                {#if b}{b.pct}% бюджета {money(b.budget.amount, { round: true })} ·{:else}{Math.round((c.amount / catTotal) * 100)}% ·{/if}
                {c.count} опер.{#if d !== null && Math.abs(d) >= 10}<span style:color={d > 0 ? 'var(--red)' : 'var(--green)'}> · {d > 0 ? '▲' : '▼'}{Math.abs(d)}%</span>{/if}
              </div>
            </div>
          </button>
        {/each}
      </div>
    {/if}
  {:else}
    {#if !accounts.length}
      <Empty icon="💳" title="Нет операций за период" />
    {:else}
      <div class="list">
        {#each accounts as a (a.id)}
          {@const acc = account(a.id)}
          <button
            class="row"
            onclick={() => {
              accFilter = a.id;
              filter = 'all';
              tab = 'ops';
            }}
          >
            <div class="row-icon" style:--c={acc?.color ?? 'var(--muted)'}>{acc?.kind === 'cash' ? '💵' : '💳'}</div>
            <div class="row-main">
              <div class="row-title">{accountLabel(a.id)}</div>
              <div class="row-sub">{a.count} опер.</div>
            </div>
            <div class="row-end tnum">
              <span class="bold">−{money(a.expense)}</span>
              {#if a.income}<span class="small plus">+{money(a.income)}</span>{/if}
            </div>
          </button>
        {/each}
      </div>
    {/if}
    <button class="btn block" onclick={() => go('/finance/accounts')}><Icon name="card" size={18} /> Мои карты и счета</button>
  {/if}
</div>
