<script lang="ts">
  import type { TxType } from '../../lib/types';
  import { data } from '../../lib/store.svelte';
  import { openSheet } from '../../lib/nav.svelte';
  import TopBar from '../../components/TopBar.svelte';
  import Seg from '../../components/Seg.svelte';
  import Icon from '../../components/Icon.svelte';
  import CategoryForm from './CategoryForm.svelte';

  let type = $state<TxType>('expense');
  const list = $derived(data.categories.filter((c) => c.type === type && !c.archived));
  const hidden = $derived(data.categories.filter((c) => c.type === type && c.archived));

  function move(id: string, dir: -1 | 1) {
    const arr = data.categories;
    const i = arr.findIndex((c) => c.id === id);
    // ищем соседа того же типа
    let j = i + dir;
    while (j >= 0 && j < arr.length && (arr[j].type !== type || arr[j].archived)) j += dir;
    if (j < 0 || j >= arr.length) return;
    const [x] = arr.splice(i, 1);
    arr.splice(j, 0, x);
  }
</script>

<TopBar title="Категории" back="/finance" />

<div class="page">
  <Seg
    bind:value={type}
    options={[
      { value: 'expense', label: 'Расходы' },
      { value: 'income', label: 'Доходы' },
    ]}
  />

  <div class="list">
    {#each list as c, i (c.id)}
      <div class="row">
        <div class="row-icon" style:--c="var(--muted)">{c.icon}</div>
        <button class="row-main" style="text-align:left" onclick={() => openSheet(CategoryForm, { id: c.id })}>
          <div class="row-title">{c.name}</div>
          {#if c.system}<div class="row-sub">связана с разделом приложения</div>{/if}
        </button>
        <button class="icon-btn sm" aria-label="Выше" disabled={i === 0} onclick={() => move(c.id, -1)}><Icon name="up" size={18} /></button>
        <button class="icon-btn sm" aria-label="Ниже" disabled={i === list.length - 1} onclick={() => move(c.id, 1)}><Icon name="down" size={18} /></button>
      </div>
    {/each}
  </div>

  <button class="btn primary block" onclick={() => openSheet(CategoryForm, { type })}><Icon name="plus" size={18} /> Новая категория</button>

  {#if hidden.length}
    <div class="section">
      <div class="section-head"><h3>Скрытые</h3></div>
      <div class="list">
        {#each hidden as c (c.id)}
          <div class="row">
            <div class="row-icon" style:--c="var(--muted)">{c.icon}</div>
            <div class="row-main"><div class="row-title">{c.name}</div></div>
            <button class="btn sm" onclick={() => (c.archived = false)}>Вернуть</button>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>
