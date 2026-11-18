<script lang="ts">
  import { data } from '../../lib/store.svelte';
  import { openSheet } from '../../lib/nav.svelte';
  import { periodRange } from '../../lib/utils';
  import TopBar from '../../components/TopBar.svelte';
  import Icon from '../../components/Icon.svelte';
  import Empty from '../../components/Empty.svelte';
  import BudgetForm from './BudgetForm.svelte';
  import BudgetBar from './BudgetBar.svelte';
  import { budgetStatuses } from './finance';

  const statuses = $derived(budgetStatuses());
  const over = $derived(statuses.filter((s) => s.pct >= 100).length);
</script>

<TopBar title="Бюджеты" sub={periodRange('month').label} back="/finance" />

<div class="page">
  {#if !data.budgets.length}
    <div class="card">
      <Empty icon="🎯" title="Бюджетов пока нет" text="Задайте лимит на месяц — на все расходы или на отдельные категории, например «Кафе» или «Такси»." />
    </div>
  {:else}
    {#if over}
      <div class="card tight small" style="background:color-mix(in srgb, var(--red) 14%, var(--card))">
        ⚠️ Превышено бюджетов: <b>{over}</b>
      </div>
    {/if}
    <div class="list plain">
      {#each statuses as s (s.budget.id)}
        <button class="row" style="display:block" onclick={() => openSheet(BudgetForm, { id: s.budget.id })}>
          <BudgetBar {s} />
        </button>
      {/each}
    </div>
  {/if}
  <button class="btn primary block" onclick={() => openSheet(BudgetForm, {})}><Icon name="plus" size={18} /> Добавить бюджет</button>
</div>
