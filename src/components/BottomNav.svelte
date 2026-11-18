<script lang="ts">
  import Icon from './Icon.svelte';
  import { router, openSheet } from '../lib/nav.svelte';
  import QuickAdd from '../pages/QuickAdd.svelte';

  const top = $derived('/' + (router.path.split('/')[1] ?? ''));
  const isHome = $derived(!['/calendar', '/history', '/settings'].includes(top));
</script>

<nav class="nav">
  <a href="#/" class:on={isHome}><Icon name="home" /><span>Главная</span></a>
  <a href="#/calendar" class:on={top === '/calendar'}><Icon name="calendar" /><span>Календарь</span></a>
  <button class="plus-btn" aria-label="Добавить запись" onclick={() => openSheet(QuickAdd)}>
    <Icon name="plus" size={28} stroke={2.4} />
  </button>
  <a href="#/history" class:on={top === '/history'}><Icon name="history" /><span>История</span></a>
  <a href="#/settings" class:on={top === '/settings'}><Icon name="settings" /><span>Настройки</span></a>
</nav>
