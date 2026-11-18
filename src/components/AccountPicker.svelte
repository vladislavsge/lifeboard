<script lang="ts">
  // Выбор способа оплаты: наличные или одна из своих карт.
  import { activeAccounts } from '../lib/store.svelte';
  import { openSheet } from '../lib/nav.svelte';
  import AccountForm from '../modules/finance/AccountForm.svelte';
  import Icon from './Icon.svelte';

  let { value = $bindable() }: { value: string } = $props();
  const list = $derived(activeAccounts());
</script>

<div class="chips">
  {#each list as a (a.id)}
    <button type="button" class="chip" class:on={value === a.id} onclick={() => (value = a.id)}>
      {#if a.kind === 'cash'}💵{:else}<span class="dot" style:--c={a.color}></span>{/if}
      {a.name}{#if a.last4}<span class="muted small">·{a.last4}</span>{/if}
    </button>
  {/each}
  <button type="button" class="chip" onclick={() => openSheet(AccountForm, { onsaved: (id: string) => (value = id) })}>
    <Icon name="plus" size={16} /> Карта
  </button>
</div>
