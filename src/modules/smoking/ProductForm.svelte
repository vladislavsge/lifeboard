<script lang="ts">
  import type { SmokeProduct } from '../../lib/types';
  import { data, add, find, remove } from '../../lib/store.svelte';
  import { ask, toast } from '../../lib/nav.svelte';
  import { uid, money } from '../../lib/utils';
  import { SMOKE_TYPES } from '../../data/defaults';
  import SheetFrame from '../../components/SheetFrame.svelte';
  import MoneyInput from '../../components/MoneyInput.svelte';
  import NumInput from '../../components/NumInput.svelte';
  import Icon from '../../components/Icon.svelte';

  let { id, onsaved, close }: { id?: string; onsaved?: (id: string) => void; close: () => void } = $props();
  const existing = id ? find('smokeProducts', id) : undefined;

  let name = $state(existing?.name ?? '');
  let type = $state(existing?.type ?? 'cigarettes');
  let packPrice = $state<number | undefined>(existing?.packPrice);
  let unitsPerPack = $state<number | undefined>(existing?.unitsPerPack ?? 20);

  const unitHint = $derived(
    type === 'vape' ? 'затяжек/сессий на картридж' : type === 'hookah' ? 'сессий на упаковку' : 'штук в пачке',
  );
  const used = $derived(existing ? data.smokes.some((s) => s.productId === existing.id) : false);

  function save() {
    if (!name.trim()) return;
    const fields = { name: name.trim(), type, packPrice, unitsPerPack: unitsPerPack ? Math.round(unitsPerPack) : undefined };
    let savedId = existing?.id;
    if (existing) Object.assign(existing, fields);
    else {
      savedId = add('smokeProducts', { id: uid(), ...fields } as SmokeProduct).id;
      data.settings.lastSmokeProductId = savedId;
    }
    toast('Сохранено');
    onsaved?.(savedId!);
    close();
  }

  async function del() {
    if (!existing) return;
    if (used) {
      if (await ask('Есть записи с этим продуктом. Скрыть его из выбора? История останется.', { ok: 'Скрыть' })) {
        existing.archived = true;
        close();
      }
      return;
    }
    if (await ask(`Удалить «${existing.name}»?`, { ok: 'Удалить', danger: true })) {
      remove('smokeProducts', existing.id);
      close();
    }
  }
</script>

<SheetFrame title={existing ? 'Что курю' : 'Добавить, что курю'} {close}>
  <label class="field">
    <span class="label">Название / марка</span>
    <input class="input" bind:value={name} placeholder="Например: Marlboro Gold, HEETS Amber" />
  </label>

  <div class="field">
    <span class="label">Тип</span>
    <div class="chips wrap">
      {#each SMOKE_TYPES as t (t.id)}
        <button class="chip sm" class:on={type === t.id} onclick={() => (type = t.id)}>{t.icon} {t.name}</button>
      {/each}
    </div>
  </div>

  <div class="grid2">
    <div class="field">
      <span class="label">Цена пачки / упаковки</span>
      <MoneyInput bind:value={packPrice} />
    </div>
    <div class="field">
      <span class="label">{unitHint}</span>
      <NumInput bind:value={unitsPerPack} cls="input" inputmode="numeric" placeholder="20" />
    </div>
  </div>
  {#if packPrice && unitsPerPack}
    <p class="hint">Одна штука ≈ {money(Math.round(packPrice / unitsPerPack))}</p>
  {/if}

  {#snippet footer()}
    {#if existing}
      <button class="btn danger icon-only" aria-label="Удалить" onclick={del}><Icon name="trash" size={20} /></button>
    {/if}
    <button class="btn primary" disabled={!name.trim()} onclick={save}>Сохранить</button>
  {/snippet}
</SheetFrame>
