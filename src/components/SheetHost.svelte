<script lang="ts">
  // Рисует стек шторок из ui.sheets. Содержимое — любой компонент, получающий проп close().
  import { fade, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { ui, closeSheet } from '../lib/nav.svelte';

  $effect(() => {
    document.body.style.overflow = ui.sheets.length ? 'hidden' : '';
  });
</script>

{#each ui.sheets as s, i (s.id)}
  <div class="backdrop" style:z-index={50 + i * 2} transition:fade={{ duration: 180 }} onclick={closeSheet} role="presentation"></div>
  <div
    class="sheet"
    style:z-index={51 + i * 2}
    role="dialog"
    aria-modal="true"
    transition:fly={{ y: 500, duration: 260, easing: cubicOut, opacity: 1 }}
  >
    <s.component {...s.props} close={closeSheet} />
  </div>
{/each}
