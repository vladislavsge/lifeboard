<script lang="ts">
  import type { Category, TxType } from '../../lib/types';
  import { data, add, find, remove } from '../../lib/store.svelte';
  import { ask, toast } from '../../lib/nav.svelte';
  import { uid } from '../../lib/utils';
  import SheetFrame from '../../components/SheetFrame.svelte';
  import Seg from '../../components/Seg.svelte';
  import Icon from '../../components/Icon.svelte';

  let { id, type: t0 = 'expense', close }: { id?: string; type?: TxType; close: () => void } = $props();
  const existing = id ? find('categories', id) : undefined;

  let type = $state<TxType>(existing?.type ?? t0);
  let name = $state(existing?.name ?? '');
  let icon = $state(existing?.icon ?? '📦');

  const ICONS = [
    '🛒', '🍔', '☕', '🍕', '🍺', '🚌', '⛽', '🚕', '🚗', '🎫', '✈️', '🏨', '🏠', '💡', '📱', '💻',
    '💊', '🩺', '🦷', '🚬', '🏋️', '👕', '👟', '💄', '💇', '🎮', '🎬', '🎵', '📚', '🎓', '👶', '🐶',
    '🎁', '🔁', '🧾', '🏦', '💳', '💼', '🧰', '💰', '↩️', '📈', '🪙', '🔧', '🧹', '🌱', '⚽', '📦',
  ];

  const used = $derived(existing ? data.transactions.some((x) => x.categoryId === existing.id) : false);

  function save() {
    if (!name.trim()) return;
    if (existing) Object.assign(existing, { name: name.trim(), icon, type });
    else add('categories', { id: uid(), name: name.trim(), icon, type } as Category);
    toast('Сохранено');
    close();
  }

  async function del() {
    if (!existing) return;
    if (existing.system) {
      toast('Служебную категорию нельзя удалить — её используют другие разделы');
      return;
    }
    if (used) {
      if (await ask('В этой категории есть операции. Скрыть её из выбора? Операции останутся.', { ok: 'Скрыть' })) {
        existing.archived = true;
        close();
      }
      return;
    }
    if (await ask(`Удалить категорию «${existing.name}»?`, { ok: 'Удалить', danger: true })) {
      remove('categories', existing.id);
      close();
    }
  }
</script>

<SheetFrame title={existing ? 'Категория' : 'Новая категория'} {close}>
  {#if !existing}
    <Seg
      bind:value={type}
      options={[
        { value: 'expense', label: 'Расход' },
        { value: 'income', label: 'Доход' },
      ]}
    />
  {/if}
  <div class="hstack">
    <div class="emoji-btn on" style="width:48px;height:48px">{icon}</div>
    <input class="input grow" bind:value={name} placeholder="Название" />
  </div>
  <div class="hstack wrap" style="gap:6px">
    {#each ICONS as e (e)}
      <button class="emoji-btn" class:on={icon === e} onclick={() => (icon = e)}>{e}</button>
    {/each}
  </div>
  <label class="field">
    <span class="label">Или свой эмодзи</span>
    <input class="input" maxlength="4" value={icon} oninput={(e) => (icon = (e.currentTarget as HTMLInputElement).value || '📦')} />
  </label>

  {#snippet footer()}
    {#if existing && !existing.system}
      <button class="btn danger icon-only" aria-label="Удалить" onclick={del}><Icon name="trash" size={20} /></button>
    {/if}
    <button class="btn primary" disabled={!name.trim()} onclick={save}>Сохранить</button>
  {/snippet}
</SheetFrame>
