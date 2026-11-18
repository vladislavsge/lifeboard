<script lang="ts">
  // Каркас содержимого шторки: заголовок, прокручиваемое тело, закреплённый футер.
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  let {
    title,
    close,
    children,
    footer,
    headerActions,
  }: { title: string; close: () => void; children: Snippet; footer?: Snippet; headerActions?: Snippet } = $props();
</script>

<div class="sheet-grip"></div>
<div class="sheet-head">
  <h2>{title}</h2>
  {#if headerActions}{@render headerActions()}{/if}
  <button class="icon-btn filled sm" aria-label="Закрыть" onclick={close}><Icon name="x" size={18} /></button>
</div>
<div class="sheet-body">
  {@render children()}
</div>
{#if footer}
  <div class="sheet-foot">{@render footer()}</div>
{/if}
