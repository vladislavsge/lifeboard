<script lang="ts">
  import { data, add, find, remove, categoriesOf } from '../../lib/store.svelte';
  import { ask, toast } from '../../lib/nav.svelte';
  import { uid } from '../../lib/utils';
  import SheetFrame from '../../components/SheetFrame.svelte';
  import MoneyInput from '../../components/MoneyInput.svelte';
  import Icon from '../../components/Icon.svelte';

  let { id, close }: { id?: string; close: () => void } = $props();
  const existing = id ? find('budgets', id) : undefined;

  // категории, на которые бюджет ещё не задан (плюс текущая)
  const taken = new Set(data.budgets.filter((b) => b.id !== id).map((b) => b.categoryId ?? '__all'));
  const options = [
    ...(taken.has('__all') ? [] : [{ id: '__all', name: 'Все расходы за месяц', icon: '💶' }]),
    ...categoriesOf('expense').filter((c) => !taken.has(c.id)),
  ];

  let categoryId = $state(existing ? (existing.categoryId ?? '__all') : (options[0]?.id ?? '__all'));
  let amount = $state<number | undefined>(existing?.amount);

  function save() {
    if (!amount) return;
    const fields = { categoryId: categoryId === '__all' ? undefined : categoryId, amount };
    if (existing) Object.assign(existing, fields);
    else add('budgets', { id: uid(), ...fields });
    toast('Бюджет сохранён');
    close();
  }

  async function del() {
    if (existing && (await ask('Удалить этот бюджет?', { ok: 'Удалить', danger: true }))) {
      remove('budgets', existing.id);
      close();
    }
  }
</script>

<SheetFrame title={existing ? 'Бюджет' : 'Новый бюджет'} {close}>
  <div class="field">
    <span class="label">Сколько можно потратить за месяц</span>
    <MoneyInput bind:value={amount} big autofocus={!existing} />
  </div>

  <div class="field">
    <span class="label">На что</span>
    <div class="pick-grid">
      {#each options as c (c.id)}
        <button type="button" class="pick" class:on={categoryId === c.id} onclick={() => (categoryId = c.id)}>
          <span class="e">{c.icon}</span>
          <span>{c.name}</span>
        </button>
      {/each}
    </div>
  </div>

  <p class="hint">Бюджет обновляется каждый месяц. Когда потрачено 80% — полоска станет оранжевой, при превышении — красной.</p>

  {#snippet footer()}
    {#if existing}
      <button class="btn danger icon-only" aria-label="Удалить" onclick={del}><Icon name="trash" size={20} /></button>
    {/if}
    <button class="btn primary" disabled={!amount} onclick={save}>Сохранить</button>
  {/snippet}
</SheetFrame>
