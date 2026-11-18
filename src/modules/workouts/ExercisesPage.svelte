<script lang="ts">
  import { data, exercises } from '../../lib/store.svelte';
  import { openSheet } from '../../lib/nav.svelte';
  import { norm } from '../../lib/utils';
  import { GROUPS, KINDS } from '../../data/exercises';
  import TopBar from '../../components/TopBar.svelte';
  import Icon from '../../components/Icon.svelte';
  import ExerciseForm from './ExerciseForm.svelte';
  import ExerciseInfo from './ExerciseInfo.svelte';

  let q = $state('');
  let group = $state('');

  const counts = $derived.by(() => {
    const m = new Map<string, number>();
    for (const w of data.workouts) if (w.status === 'done') for (const e of w.exercises) m.set(e.exerciseId, (m.get(e.exerciseId) ?? 0) + 1);
    return m;
  });

  const list = $derived.by(() => {
    const nq = norm(q);
    return exercises().filter(
      (e) =>
        (!group || (group === '__custom' ? e.custom : group === '__done' ? counts.has(e.id) : e.group === group)) &&
        (!nq || norm(e.name).includes(nq) || norm(e.equipment).includes(nq)),
    );
  });

  const kindName = (k: string) => KINDS.find((x) => x.id === k)?.name ?? '';
</script>

<TopBar title="Упражнения" sub="{exercises().length} в библиотеке" back="/workouts">
  {#snippet actions()}
    <button class="icon-btn" aria-label="Своё упражнение" onclick={() => openSheet(ExerciseForm, {})}><Icon name="plus" /></button>
  {/snippet}
</TopBar>

<div class="page">
  <div class="input-wrap">
    <span class="prefix-icon"><Icon name="search" size={18} /></span>
    <input class="input with-icon" bind:value={q} placeholder="Поиск упражнения или тренажёра" type="search" />
  </div>

  <div class="chips">
    <button class="chip sm" class:on={!group} onclick={() => (group = '')}>Все</button>
    {#if counts.size}<button class="chip sm" class:on={group === '__done'} onclick={() => (group = '__done')}>✅ Делал</button>{/if}
    {#if data.exercises.length}<button class="chip sm" class:on={group === '__custom'} onclick={() => (group = '__custom')}>⭐ Свои</button>{/if}
    {#each GROUPS as g (g.id)}
      <button class="chip sm" class:on={group === g.id} onclick={() => (group = g.id)}>{g.icon} {g.id}</button>
    {/each}
  </div>

  <div class="list plain">
    {#each list as e (e.id)}
      <button class="row" onclick={() => openSheet(ExerciseInfo, { id: e.id })}>
        <div class="row-main">
          <div class="row-title">{e.name}{e.custom ? ' ⭐' : ''}</div>
          <div class="row-sub">{e.group} · {e.equipment} · {kindName(e.kind)}</div>
        </div>
        {#if counts.get(e.id)}<span class="badge">{counts.get(e.id)}×</span>{/if}
      </button>
    {:else}
      <div class="empty small">
        Ничего не нашлось
        <button class="btn sm" onclick={() => openSheet(ExerciseForm, { name: q })}>Создать «{q}»</button>
      </div>
    {/each}
  </div>
</div>
