<script lang="ts">
  import { data, add, find, remove } from '../../lib/store.svelte';
  import { ask, toast } from '../../lib/nav.svelte';
  import { nowLocal, uid } from '../../lib/utils';
  import { smokeTypeIcon } from '../../data/defaults';
  import SheetFrame from '../../components/SheetFrame.svelte';
  import DateTime from '../../components/DateTime.svelte';
  import Icon from '../../components/Icon.svelte';

  let { id, close }: { id?: string; close: () => void } = $props();
  const existing = id ? find('smokes', id) : undefined;

  let productId = $state(existing?.productId ?? data.settings.lastSmokeProductId ?? '');
  let count = $state(existing?.count ?? 1);
  let date = $state(existing?.date ?? nowLocal());
  let note = $state(existing?.note ?? '');

  const products = $derived(data.smokeProducts.filter((p) => !p.archived || p.id === productId));

  function save() {
    const fields = { productId: productId || undefined, count: Math.max(1, count), date, note: note.trim() || undefined };
    if (existing) Object.assign(existing, fields);
    else add('smokes', { id: uid(), ...fields });
    if (productId) data.settings.lastSmokeProductId = productId;
    toast('Сохранено');
    close();
  }

  async function del() {
    if (existing && (await ask('Удалить запись?', { ok: 'Удалить', danger: true }))) {
      remove('smokes', existing.id);
      close();
    }
  }
</script>

<SheetFrame title={existing ? 'Запись' : 'Покурил'} {close}>
  <div class="field">
    <span class="label">Что курил</span>
    <div class="chips wrap">
      <button class="chip" class:on={!productId} onclick={() => (productId = '')}>Не указано</button>
      {#each products as p (p.id)}
        <button class="chip" class:on={productId === p.id} onclick={() => (productId = p.id)}>{smokeTypeIcon(p.type)} {p.name}</button>
      {/each}
    </div>
  </div>

  <div class="hstack between">
    <span class="label">Сколько штук / сессий</span>
    <div class="stepper">
      <button onclick={() => (count = Math.max(1, count - 1))} aria-label="Меньше">−</button>
      <span>{count}</span>
      <button onclick={() => count++} aria-label="Больше">+</button>
    </div>
  </div>

  <div class="field">
    <span class="label">Когда</span>
    <DateTime bind:value={date} />
  </div>

  <label class="field">
    <span class="label">Заметка</span>
    <input class="input" bind:value={note} placeholder="После кофе, стресс, за компанию…" />
  </label>

  {#snippet footer()}
    {#if existing}
      <button class="btn danger icon-only" aria-label="Удалить" onclick={del}><Icon name="trash" size={20} /></button>
    {/if}
    <button class="btn primary" onclick={save}>Сохранить</button>
  {/snippet}
</SheetFrame>
