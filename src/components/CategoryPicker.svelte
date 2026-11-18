<script lang="ts">
  import type { TxType } from '../lib/types';
  import { categoriesOf } from '../lib/store.svelte';

  let { value = $bindable(), type }: { value: string; type: TxType } = $props();
  const list = $derived(categoriesOf(type));
</script>

<div class="pick-grid">
  {#each list as c (c.id)}
    <button type="button" class="pick" class:on={value === c.id} onclick={() => (value = c.id)}>
      <span class="e">{c.icon}</span>
      <span>{c.name}</span>
    </button>
  {/each}
</div>
