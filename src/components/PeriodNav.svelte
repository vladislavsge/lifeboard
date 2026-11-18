<script lang="ts">
  import type { PeriodKind } from '../lib/utils';
  import { periodRange } from '../lib/utils';
  import Seg from './Seg.svelte';
  import Icon from './Icon.svelte';

  let {
    kind = $bindable(),
    offset = $bindable(),
    kinds = ['week', 'month', 'year', 'all'],
  }: { kind: PeriodKind; offset: number; kinds?: PeriodKind[] } = $props();

  const NAMES: Record<PeriodKind, string> = { day: 'День', week: 'Неделя', month: 'Месяц', year: 'Год', all: 'Всё' };
  const label = $derived(periodRange(kind, offset).label);
</script>

<div class="vstack">
  <Seg bind:value={kind} options={kinds.map((k) => ({ value: k, label: NAMES[k] }))} onchange={() => (offset = 0)} />
  {#if kind !== 'all'}
    <div class="hstack between">
      <button class="icon-btn" aria-label="Раньше" onclick={() => offset--}><Icon name="left" /></button>
      <button class="bold" onclick={() => (offset = 0)}>{label}</button>
      <button class="icon-btn" aria-label="Позже" disabled={offset >= 0} style:opacity={offset >= 0 ? 0.3 : 1} onclick={() => offset < 0 && offset++}>
        <Icon name="right" />
      </button>
    </div>
  {/if}
</div>
