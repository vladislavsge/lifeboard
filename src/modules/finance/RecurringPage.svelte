<script lang="ts">
  import { data, category, accountLabel, payRecurring } from '../../lib/store.svelte';
  import { openSheet } from '../../lib/nav.svelte';
  import { money, sum, todayKey, untilText, fmtDateShort } from '../../lib/utils';
  import TopBar from '../../components/TopBar.svelte';
  import Icon from '../../components/Icon.svelte';
  import Empty from '../../components/Empty.svelte';
  import RecurringForm from './RecurringForm.svelte';
  import { monthlyEquivalent, FREQ_NAMES } from './finance';

  const list = $derived([...data.recurring].sort((a, b) => Number(b.active) - Number(a.active) || (a.nextDate < b.nextDate ? -1 : 1)));
  const active = $derived(data.recurring.filter((r) => r.active));
  const monthOut = $derived(sum(active.filter((r) => r.type === 'expense'), monthlyEquivalent));
  const monthIn = $derived(sum(active.filter((r) => r.type === 'income'), monthlyEquivalent));
  const today = todayKey();
</script>

<TopBar title="Регулярные платежи" back="/finance" />

<div class="page">
  <div class="grid2">
    <div class="stat"><span class="k">Расходы в месяц</span><span class="v">−{money(monthOut, { round: true })}</span></div>
    <div class="stat"><span class="k">Доходы в месяц</span><span class="v plus">+{money(monthIn, { round: true })}</span></div>
  </div>
  {#if monthOut}
    <p class="hint">В год на подписки и обязательные платежи уходит ≈ {money(monthOut * 12, { round: true })}.</p>
  {/if}

  {#if !list.length}
    <div class="card">
      <Empty icon="🔁" title="Пока ничего" text="Добавьте подписки, аренду, связь или зарплату — операции будут появляться сами в нужный день." />
    </div>
  {:else}
    <div class="list">
      {#each list as r (r.id)}
        {@const c = category(r.categoryId)}
        {@const due = r.active && !r.auto && r.nextDate <= today}
        <div class="row" style:opacity={r.active ? 1 : 0.5}>
          <div class="row-icon" style:--c={r.type === 'income' ? 'var(--green)' : 'var(--muted)'}>{c?.icon ?? '🔁'}</div>
          <button class="row-main" style="text-align:left" onclick={() => openSheet(RecurringForm, { id: r.id })}>
            <div class="row-title">{r.name}</div>
            <div class="row-sub">
              {#if !r.active}на паузе{:else if due}<span style="color:var(--orange)">пора оплатить</span>{:else}{fmtDateShort(r.nextDate)} · {untilText(r.nextDate + 'T09:00')}{/if}
              · {FREQ_NAMES[r.freq]} · {accountLabel(r.accountId)}{r.auto ? '' : ' · вручную'}
            </div>
          </button>
          <div class="row-end">
            <span class="bold tnum" class:plus={r.type === 'income'}>{r.type === 'income' ? '+' : '−'}{money(r.amount)}</span>
            {#if due}<button class="btn sm solid" style:--c="var(--green)" onclick={() => payRecurring(r)}>Оплачено</button>{/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <button class="btn primary block" onclick={() => openSheet(RecurringForm, {})}><Icon name="plus" size={18} /> Добавить</button>
</div>
