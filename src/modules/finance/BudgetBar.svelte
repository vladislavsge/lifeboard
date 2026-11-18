<script lang="ts">
  import type { BudgetStatus } from './finance';
  import { budgetColor } from './finance';
  import { money } from '../../lib/utils';

  let { s, compact = false }: { s: BudgetStatus; compact?: boolean } = $props();
  const color = $derived(budgetColor(s.pct));
</script>

<div class="vstack gap4">
  <div class="hstack between small">
    <span class="bold ellipsis">{s.icon} {s.name}</span>
    <span class="tnum nowrap"><b>{money(s.spent, { round: true })}</b> <span class="muted">из {money(s.budget.amount, { round: true })}</span></span>
  </div>
  <div class="progress" style:--c={color}><div style:width="{Math.min(100, s.pct)}%"></div></div>
  {#if !compact}
    <div class="tiny muted hstack between">
      {#if s.left >= 0}
        <span>осталось {money(s.left, { round: true })} · {money(s.perDay, { round: true })}/день</span>
      {:else}
        <span class="danger-text">перерасход {money(-s.left, { round: true })}</span>
      {/if}
      {#if s.forecast > s.budget.amount && s.left >= 0}<span style:color="var(--orange)">прогноз {money(s.forecast, { round: true })}</span>{/if}
    </div>
  {/if}
</div>
