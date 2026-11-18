<script lang="ts">
  import type { ExKind, Exercise } from '../../lib/types';
  import { data, add, find, remove } from '../../lib/store.svelte';
  import { ask, toast } from '../../lib/nav.svelte';
  import { uid } from '../../lib/utils';
  import { GROUPS, EQUIPMENT, KINDS } from '../../data/exercises';
  import SheetFrame from '../../components/SheetFrame.svelte';
  import Icon from '../../components/Icon.svelte';

  let { id, name: n0 = '', onsaved, close }: { id?: string; name?: string; onsaved?: (id: string) => void; close: () => void } = $props();
  const existing = id ? find('exercises', id) : undefined;

  let name = $state(existing?.name ?? n0);
  let group = $state(existing?.group ?? 'Грудь');
  let equipment = $state(existing?.equipment ?? 'Тренажёр');
  let kind = $state<ExKind>(existing?.kind ?? 'strength');

  const used = $derived(existing ? data.workouts.some((w) => w.exercises.some((e) => e.exerciseId === existing.id)) : false);

  function save() {
    if (!name.trim()) return;
    const fields = { name: name.trim(), group, equipment, kind };
    let savedId = existing?.id;
    if (existing) Object.assign(existing, fields);
    else savedId = add('exercises', { id: 'u-' + uid(), custom: true, ...fields } as Exercise).id;
    toast('Упражнение сохранено');
    onsaved?.(savedId!);
    close();
  }

  async function del() {
    if (!existing) return;
    const msg = used ? 'Упражнение есть в прошлых тренировках — там оно станет «удалённым». Удалить?' : `Удалить «${existing.name}»?`;
    if (await ask(msg, { ok: 'Удалить', danger: true })) {
      remove('exercises', existing.id);
      close();
    }
  }
</script>

<SheetFrame title={existing ? 'Упражнение' : 'Своё упражнение'} {close}>
  <label class="field">
    <span class="label">Название</span>
    <input class="input" bind:value={name} placeholder="Например: Жим в хаммере" />
  </label>

  <div class="field">
    <span class="label">Как записывать</span>
    <div class="grid2">
      {#each KINDS as k (k.id)}
        <button class="pick" style="align-items:flex-start;text-align:left;padding:10px 12px" class:on={kind === k.id} onclick={() => (kind = k.id)}>
          <span class="bold">{k.name}</span>
          <span class="muted tiny">{k.hint}</span>
        </button>
      {/each}
    </div>
  </div>

  <div class="field">
    <span class="label">Группа</span>
    <div class="chips wrap">
      {#each GROUPS as g (g.id)}
        <button class="chip sm" class:on={group === g.id} onclick={() => (group = g.id)}>{g.icon} {g.id}</button>
      {/each}
    </div>
  </div>

  <div class="field">
    <span class="label">Инвентарь / тренажёр</span>
    <div class="chips wrap">
      {#each EQUIPMENT as e (e)}
        <button class="chip sm" class:on={equipment === e} onclick={() => (equipment = e)}>{e}</button>
      {/each}
    </div>
  </div>

  {#snippet footer()}
    {#if existing}
      <button class="btn danger icon-only" aria-label="Удалить" onclick={del}><Icon name="trash" size={20} /></button>
    {/if}
    <button class="btn primary" disabled={!name.trim()} onclick={save}>Сохранить</button>
  {/snippet}
</SheetFrame>
