<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  import { goBack } from '../lib/nav.svelte';

  let {
    title,
    sub,
    back,
    actions,
  }: { title: string; sub?: string; back?: string; actions?: Snippet } = $props();
</script>

<header class="topbar">
  {#if back}
    <button class="icon-btn" aria-label="Назад" onclick={() => goBack(back)}>
      <Icon name="back" size={26} />
    </button>
  {/if}
  <div class="title" style:padding-left={back ? '0' : '6px'}>
    {title}
    {#if sub}<small>{sub}</small>{/if}
  </div>
  {#if actions}
    <div class="actions">{@render actions()}</div>
  {/if}
</header>
