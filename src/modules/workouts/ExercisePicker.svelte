<script lang="ts">
  // Выбор упражнений (можно несколько сразу): поиск, группы мышц, недавние.
  import { data, exercises, exercise } from '../../lib/store.svelte';
  import { openSheet } from '../../lib/nav.svelte';
  import { norm } from '../../lib/utils';
  import { GROUPS, KINDS } from '../../data/exercises';
  import SheetFrame from '../../components/SheetFrame.svelte';
  import Icon from '../../components/Icon.svelte';
  import ExerciseForm from './ExerciseForm.svelte';

  let { onpick, title = 'Упражнения', close }: { onpick: (ids: string[]) => void; title?: string; close: () => void } = $props();

  let q = $state('');
  let group = $state('');
  let picked = $state<string[]>([]);

  const recent = $derived.by(() => {
    const seen: string[] = [];
    const ws = [...data.workouts].sort((a, b) => (a.date < b.date ? 1 : -1));
    for (const w of ws) for (const e of w.exercises) if (!seen.includes(e.exerciseId)) seen.push(e.exerciseId);
    return seen.slice(0, 8);
  });

  const list = $derived.by(() => {
    const nq = norm(q);
    return exercises().filter(
      (e) =>
        (!group || (group === '__custom' ? e.custom : e.group === group)) &&
        (!nq || norm(e.name).includes(nq) || norm(e.equipment).includes(nq) || norm(e.group).includes(nq)),
    );
  });

  const kindName = (k: string) => KINDS.find((x) => x.id === k)?.name ?? '';

  function toggle(id: string) {
    picked = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id];
  }

  function done() {
    onpick(picked);
    close();
  }
</script>

<SheetFrame {title} {close}>
  <div class="input-wrap">
    <span class="prefix-icon"><Icon name="search" size={18} /></span>
    <input class="input with-icon" bind:value={q} placeholder="Поиск: жим, тяга, бег…" type="search" />
  </div>

  <div class="chips">
    <button class="chip sm" class:on={!group} onclick={() => (group = '')}>Все</button>
    {#each GROUPS as g (g.id)}
      <button class="chip sm" class:on={group === g.id} onclick={() => (group = g.id)}>{g.icon} {g.id}</button>
    {/each}
    {#if data.exercises.length}
      <button class="chip sm" class:on={group === '__custom'} onclick={() => (group = '__custom')}>⭐ Свои</button>
    {/if}
  </div>

  {#if !q && !group && recent.length}
    <div class="section">
      <div class="section-head"><h3>Недавние</h3></div>
      <div class="list plain">
        {#each recent as id (id)}
          {@const e = exercise(id)}
          <button class="row" onclick={() => toggle(id)}>
            <div class="row-main">
              <div class="row-title">{e.name}</div>
              <div class="row-sub">{e.group} · {e.equipment}</div>
            </div>
            <span class="tick" class:on={picked.includes(id)}><Icon name="check" size={16} stroke={3} /></span>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <div class="section">
    {#if !q && !group}<div class="section-head"><h3>Все упражнения</h3></div>{/if}
    <div class="list plain">
      {#each list as e (e.id)}
        <button class="row" onclick={() => toggle(e.id)}>
          <div class="row-main">
            <div class="row-title">{e.name}</div>
            <div class="row-sub">{e.group} · {e.equipment} · {kindName(e.kind)}</div>
          </div>
          <span class="tick" class:on={picked.includes(e.id)}><Icon name="check" size={16} stroke={3} /></span>
        </button>
      {:else}
        <div class="empty small">Ничего не нашлось</div>
      {/each}
    </div>
  </div>

  <button
    class="btn block"
    onclick={() =>
      openSheet(ExerciseForm, {
        name: q,
        onsaved: (id: string) => {
          picked = [...picked, id];
          group = '';
          q = '';
        },
      })}
  >
    <Icon name="plus" size={18} /> Своё упражнение
  </button>

  {#snippet footer()}
    <button class="btn primary" disabled={!picked.length} onclick={done}>
      Добавить{picked.length ? ` (${picked.length})` : ''}
    </button>
  {/snippet}
</SheetFrame>

<style>
  .tick {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 2px solid var(--card-3);
    display: grid;
    place-items: center;
    color: transparent;
    flex: none;
  }
  .tick.on {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
</style>
