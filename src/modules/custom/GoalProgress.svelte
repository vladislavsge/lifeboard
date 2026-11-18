<script lang="ts">
  // Прогресс дневной цели трекера: «1500 / 2000 мл», полоска и серия дней.
  import type { Tracker } from '../../lib/types';
  import { todayKey } from '../../lib/utils';
  import { goalDayValue, goalMet, goalStreak, fmtGoal, goalLabel } from './tracker';

  let { t, compact = false }: { t: Tracker; compact?: boolean } = $props();

  const v = $derived(goalDayValue(t, todayKey()));
  const met = $derived(goalMet(t, todayKey()));
  const streak = $derived(goalStreak(t));
  const pct = $derived(t.goal ? Math.min(100, (v / t.goal) * 100) : 0);
  const color = $derived(t.goalMode === 'max' ? (met ? t.color : 'var(--red)') : met ? 'var(--green)' : t.color);
</script>

{#if t.goal}
  <div class="vstack gap4">
    <div class="hstack between small">
      <span>
        <b class="tnum">{fmtGoal(t, v)}</b>
        <span class="muted">/ {fmtGoal(t, t.goal)} {compact ? '' : goalLabel(t)}</span>
      </span>
      <span class="nowrap">
        {#if t.goalMode === 'max' ? !met : met}{t.goalMode === 'max' ? '⚠️ перебор' : '✅'}{/if}
        {#if streak}<span class="badge" style="margin-left:4px">🔥 {streak}</span>{/if}
      </span>
    </div>
    <div class="progress" style:--c={color}><div style:width="{pct}%"></div></div>
  </div>
{/if}
