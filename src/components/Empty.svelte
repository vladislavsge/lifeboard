<script lang="ts">
  import type { Snippet } from 'svelte';
  let { icon = '✨', title, text, children }: { icon?: string; title: string; text?: string; children?: Snippet } = $props();
</script>

<div class="empty">
  <div class="e">{icon}</div>
  <b>{title}</b>
  {#if text}<div class="small">{text}</div>{/if}
  {#if children}<div class="mt8">{@render children()}</div>{/if}
</div>
