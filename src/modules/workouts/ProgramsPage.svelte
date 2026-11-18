<script lang="ts">
  import { data, add } from '../../lib/store.svelte';
  import { go, openSheet } from '../../lib/nav.svelte';
  import { uid, WD_SHORT } from '../../lib/utils';
  import TopBar from '../../components/TopBar.svelte';
  import Icon from '../../components/Icon.svelte';
  import Empty from '../../components/Empty.svelte';
  import TemplatePicker from './TemplatePicker.svelte';

  const C = '#f97316';

  function create() {
    const p = add('programs', {
      id: uid(),
      name: 'Моя программа',
      active: true,
      days: [{ id: uid(), name: 'День 1', weekdays: [1], time: '19:00', exercises: [] }],
    });
    go('/workouts/p/' + p.id);
  }

  const days = (wd: number[]) => [...wd].sort().map((d) => WD_SHORT[d - 1]).join(', ');
</script>

<TopBar title="Программы" back="/workouts" />

<div class="page">
  <p class="hint">Программа — это план по дням недели: какие упражнения, сколько подходов и во сколько. Активные программы видны в календаре и на главной.</p>

  {#if !data.programs.length}
    <div class="card"><Empty icon="📋" title="Программ пока нет" text="Создайте свою или возьмите готовый шаблон." /></div>
  {:else}
    <div class="vstack gap12">
      {#each data.programs as p (p.id)}
        <div class="card tight vstack">
          <div class="hstack">
            <button class="grow" style="text-align:left" onclick={() => go('/workouts/p/' + p.id)}>
              <div class="bold" style="font-size:16px">{p.name}</div>
              <div class="small muted">{p.days.length} {p.days.length === 1 ? 'день' : 'дн.'} · {p.active ? 'активна' : 'на паузе'}</div>
            </button>
            <label class="switch" aria-label="Активна">
              <input type="checkbox" bind:checked={p.active} />
              <span></span>
            </label>
          </div>
          <div class="list plain" style="background:var(--card-2)">
            {#each p.days as d (d.id)}
              <button class="row" style="min-height:48px" onclick={() => go('/workouts/p/' + p.id)}>
                <div class="row-main">
                  <div class="row-title">{d.name}</div>
                  <div class="row-sub">{days(d.weekdays) || 'без дня'}{d.time ? ' · ' + d.time : ''} · {d.exercises.length} упр.</div>
                </div>
                <Icon name="right" size={18} />
              </button>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <div class="grid2">
    <button class="btn solid" style:--c={C} onclick={create}><Icon name="plus" size={18} /> Своя</button>
    <button class="btn" onclick={() => openSheet(TemplatePicker, {})}><Icon name="copy" size={18} /> Из шаблона</button>
  </div>
</div>
