<script lang="ts">
  import type { Account } from '../../lib/types';
  import { data, add, find, remove } from '../../lib/store.svelte';
  import { ask, toast } from '../../lib/nav.svelte';
  import { SWATCHES, uid } from '../../lib/utils';
  import SheetFrame from '../../components/SheetFrame.svelte';
  import Seg from '../../components/Seg.svelte';
  import Icon from '../../components/Icon.svelte';

  let { id, onsaved, close }: { id?: string; onsaved?: (id: string) => void; close: () => void } = $props();

  const existing = id ? find('accounts', id) : undefined;

  let kind = $state<Account['kind']>(existing?.kind ?? 'card');
  let name = $state(existing?.name ?? '');
  let bank = $state(existing?.bank ?? '');
  let last4 = $state(existing?.last4 ?? '');
  let cardType = $state<'debit' | 'credit'>(existing?.cardType ?? 'debit');
  let color = $state(existing?.color ?? SWATCHES[data.accounts.length % SWATCHES.length]);

  const valid = $derived(name.trim().length > 0);
  const used = $derived(existing ? data.transactions.some((t) => t.accountId === existing.id) : false);

  function save() {
    if (!valid) return;
    const fields: Partial<Account> = {
      kind,
      name: name.trim(),
      bank: bank.trim() || undefined,
      last4: kind === 'card' ? last4.replace(/\D/g, '').slice(-4) || undefined : undefined,
      cardType: kind === 'card' ? cardType : undefined,
      color,
    };
    let savedId = existing?.id;
    if (existing) Object.assign(existing, fields);
    else savedId = add('accounts', { id: uid(), archived: false, ...fields } as Account).id;
    toast(existing ? 'Сохранено' : 'Карта добавлена');
    onsaved?.(savedId!);
    close();
  }

  async function del() {
    if (!existing) return;
    if (used) {
      if (await ask('По этой карте есть операции. Скрыть её из выбора? История сохранится.', { ok: 'Скрыть' })) {
        existing.archived = true;
        close();
      }
      return;
    }
    if (await ask(`Удалить «${existing.name}»?`, { ok: 'Удалить', danger: true })) {
      remove('accounts', existing.id);
      close();
    }
  }
</script>

<SheetFrame title={existing ? 'Способ оплаты' : 'Новая карта / счёт'} {close}>
  <!-- превью карты -->
  <div class="preview" style:--c={color}>
    <div class="hstack between">
      <span class="bold">{bank || (kind === 'cash' ? 'Наличные' : 'Банк')}</span>
      <span>{kind === 'cash' ? '💵' : kind === 'card' ? (cardType === 'credit' ? 'Кредитная' : 'Дебетовая') : 'Счёт'}</span>
    </div>
    <div class="num tnum">{kind === 'card' ? `•••• ${last4.replace(/\D/g, '').slice(-4) || '0000'}` : ''}</div>
    <div class="bold">{name || 'Название'}</div>
  </div>

  <Seg
    bind:value={kind}
    options={[
      { value: 'card', label: 'Карта' },
      { value: 'cash', label: 'Наличные' },
      { value: 'other', label: 'Другое' },
    ]}
  />

  <label class="field">
    <span class="label">Название</span>
    <input class="input" bind:value={name} placeholder={kind === 'card' ? 'Например: Основная Visa' : 'Например: Кошелёк'} />
  </label>

  {#if kind !== 'cash'}
    <div class="grid2">
      <label class="field">
        <span class="label">Банк</span>
        <input class="input" bind:value={bank} placeholder="Swedbank" />
      </label>
      {#if kind === 'card'}
        <label class="field">
          <span class="label">Последние 4 цифры</span>
          <input class="input tnum" bind:value={last4} inputmode="numeric" maxlength="4" placeholder="1234" />
        </label>
      {/if}
    </div>
    {#if kind === 'card'}
      <Seg
        bind:value={cardType}
        options={[
          { value: 'debit', label: 'Дебетовая' },
          { value: 'credit', label: 'Кредитная' },
        ]}
      />
    {/if}
  {/if}

  <div class="field">
    <span class="label">Цвет</span>
    <div class="swatches">
      {#each SWATCHES as c (c)}
        <button class="swatch" class:on={color === c} style:background={c} aria-label={c} onclick={() => (color = c)}></button>
      {/each}
    </div>
  </div>

  <p class="hint">Номер карты целиком не нужен — достаточно последних цифр, чтобы отличать карты.</p>

  {#snippet footer()}
    {#if existing}
      <button class="btn danger icon-only" aria-label="Удалить" onclick={del}><Icon name="trash" size={20} /></button>
    {/if}
    <button class="btn primary" disabled={!valid} onclick={save}>Сохранить</button>
  {/snippet}
</SheetFrame>

<style>
  .preview {
    border-radius: 18px;
    padding: 16px 18px;
    min-height: 130px;
    color: #fff;
    background: linear-gradient(135deg, var(--c), color-mix(in srgb, var(--c) 55%, #000));
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 10px;
    box-shadow: 0 10px 30px color-mix(in srgb, var(--c) 35%, transparent);
  }
  .num {
    font-size: 20px;
    letter-spacing: 0.12em;
    opacity: 0.9;
    min-height: 26px;
  }
</style>
