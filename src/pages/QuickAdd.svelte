<script lang="ts">
  // Быстрое добавление из любой точки приложения (кнопка «+» внизу).
  import type { Component } from 'svelte';
  import { data, isEnabled } from '../lib/store.svelte';
  import { go, replaceSheet, closeSheet } from '../lib/nav.svelte';
  import SheetFrame from '../components/SheetFrame.svelte';
  import TxForm from '../modules/finance/TxForm.svelte';
  import PurchaseForm from '../modules/smoking/PurchaseForm.svelte';
  import SmokeForm from '../modules/smoking/SmokeForm.svelte';
  import ItemForm from '../modules/groceries/ItemForm.svelte';
  import TripForm from '../modules/groceries/TripForm.svelte';
  import AppointmentForm from '../modules/health/AppointmentForm.svelte';
  import EntryForm from '../modules/custom/EntryForm.svelte';
  import { logSmoke } from '../modules/smoking/smoking';
  import { startWorkout, logPastWorkout } from '../modules/workouts/workouts';

  let { close }: { close: () => void } = $props();

  interface Action {
    icon: string;
    label: string;
    color: string;
    run: () => void;
  }

  const sheet =
    <P extends Record<string, any>>(c: Component<P>, props: Omit<P, 'close'>) =>
    () =>
      replaceSheet(c, props);

  const groups = $derived.by(() => {
    const g: { title: string; actions: Action[] }[] = [];
    for (const m of data.settings.modules) {
      if (!m.enabled) continue;
      if (m.id === 'finance')
        g.push({
          title: 'Финансы',
          actions: [
            { icon: '➖', label: 'Расход', color: '#f43f5e', run: sheet(TxForm, { type: 'expense' }) },
            { icon: '➕', label: 'Доход', color: '#22c55e', run: sheet(TxForm, { type: 'income' }) },
          ],
        });
      if (m.id === 'workouts')
        g.push({
          title: 'Тренировки',
          actions: [
            { icon: '▶️', label: 'Начать', color: '#f97316', run: () => go('/workouts/w/' + startWorkout()) },
            { icon: '📝', label: 'Записать прошедшую', color: '#f97316', run: () => go('/workouts/w/' + logPastWorkout()) },
          ],
        });
      if (m.id === 'smoking')
        g.push({
          title: 'Курение',
          actions: [
            {
              icon: '🚬',
              label: 'Покурил',
              color: '#94a3b8',
              run: () => {
                closeSheet();
                logSmoke();
              },
            },
            { icon: '🕒', label: 'С другим временем', color: '#94a3b8', run: sheet(SmokeForm, {}) },
            { icon: '🛍️', label: 'Купил', color: '#94a3b8', run: sheet(PurchaseForm, {}) },
          ],
        });
      if (m.id === 'groceries')
        g.push({
          title: 'Покупки',
          actions: [
            { icon: '📝', label: 'В список', color: '#3b82f6', run: sheet(ItemForm, { inList: true }) },
            { icon: '🧾', label: 'Чек', color: '#3b82f6', run: sheet(TripForm, {}) },
          ],
        });
      if (m.id === 'health')
        g.push({
          title: 'Врачи',
          actions: [{ icon: '🩺', label: 'Запись к врачу', color: '#ef4444', run: sheet(AppointmentForm, {}) }],
        });
    }
    const trackers = data.trackers.filter((t) => isEnabled('tracker:' + t.id));
    if (trackers.length)
      g.push({
        title: 'Мои трекеры',
        actions: trackers.map((t) => ({ icon: t.icon, label: t.name, color: t.color, run: sheet(EntryForm, { trackerId: t.id }) })),
      });
    return g;
  });
</script>

<SheetFrame title="Добавить" {close}>
  {#each groups as g (g.title)}
    <div class="section">
      <div class="section-head"><h3>{g.title}</h3></div>
      <div class="qa">
        {#each g.actions as a (a.label)}
          <button class="pick" style:--c={a.color} onclick={a.run}>
            <span class="e qi">{a.icon}</span>
            <span>{a.label}</span>
          </button>
        {/each}
      </div>
    </div>
  {/each}
  {#if !groups.length}
    <p class="muted center">Все разделы выключены.</p>
  {/if}
  <button class="btn block" onclick={() => go('/settings/tracker/new')}>✨ Создать свой трекер</button>
</SheetFrame>

<style>
  .qa {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .qi {
    width: 44px;
    height: 44px;
    border-radius: 14px;
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--c) 18%, transparent);
    margin-bottom: 2px;
  }
</style>
