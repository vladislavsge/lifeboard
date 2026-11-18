<script lang="ts">
  import type { Transaction } from '../../lib/types';
  import { category, accountLabel } from '../../lib/store.svelte';
  import { openSheet } from '../../lib/nav.svelte';
  import { money, timeOf, fmtDateTime } from '../../lib/utils';
  import TxForm from './TxForm.svelte';

  let { tx, showDate = false }: { tx: Transaction; showDate?: boolean } = $props();
  const c = $derived(category(tx.categoryId));
</script>

<button class="row" onclick={() => openSheet(TxForm, { id: tx.id })}>
  <div class="row-icon" style:--c={tx.type === 'income' ? 'var(--green)' : 'var(--muted)'}>{c?.icon ?? '❔'}</div>
  <div class="row-main">
    <div class="row-title">{tx.note || c?.name || 'Операция'}</div>
    <div class="row-sub">
      {tx.note ? (c?.name ?? '') + ' · ' : ''}{accountLabel(tx.accountId)} · {showDate ? fmtDateTime(tx.date) : timeOf(tx.date)}
    </div>
  </div>
  <div class="row-end">
    <span class="bold tnum" class:plus={tx.type === 'income'}>{tx.type === 'income' ? '+' : '−'}{money(tx.amount)}</span>
  </div>
</button>
