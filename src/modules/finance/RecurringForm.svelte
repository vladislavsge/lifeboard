<script lang="ts">
  import type { Freq, Recurring, TxType } from '../../lib/types';
  import { add, find, remove, categoriesOf, defaultAccountId, processRecurring } from '../../lib/store.svelte';
  import { ask, toast } from '../../lib/nav.svelte';
  import { uid, todayKey, money } from '../../lib/utils';
  import SheetFrame from '../../components/SheetFrame.svelte';
  import Seg from '../../components/Seg.svelte';
  import MoneyInput from '../../components/MoneyInput.svelte';
  import CategoryPicker from '../../components/CategoryPicker.svelte';
  import AccountPicker from '../../components/AccountPicker.svelte';
  import Icon from '../../components/Icon.svelte';

  let { id, close }: { id?: string; close: () => void } = $props();
  const existing = id ? find('recurring', id) : undefined;

  let name = $state(existing?.name ?? '');
  let type = $state<TxType>(existing?.type ?? 'expense');
  let amount = $state<number | undefined>(existing?.amount);
  let categoryId = $state(existing?.categoryId ?? categoriesOf('expense').find((c) => c.id === 'c-subs')?.id ?? categoriesOf('expense')[0]?.id ?? '');
  let accountId = $state(existing?.accountId ?? defaultAccountId());
  let freq = $state<Freq>(existing?.freq ?? 'monthly');
  let nextDate = $state(existing?.nextDate ?? todayKey());
  let auto = $state(existing?.auto ?? true);
  let active = $state(existing?.active ?? true);

  const SUGGEST = ['Аренда', 'Интернет', 'Телефон', 'Netflix', 'Spotify', 'Спортзал', 'Страховка', 'Кредит', 'Зарплата'];

  function onType(t: TxType) {
    const list = categoriesOf(t);
    if (!list.some((c) => c.id === categoryId)) categoryId = list[0]?.id ?? '';
  }

  const valid = $derived(!!name.trim() && !!amount && !!categoryId && !!nextDate);

  function save() {
    if (!valid) return;
    const fields = {
      name: name.trim(), type, amount: amount!, categoryId, accountId, freq, nextDate,
      day: Number(nextDate.slice(8, 10)), auto, active,
    };
    if (existing) Object.assign(existing, fields);
    else add('recurring', { id: uid(), ...fields } as Recurring);
    const n = processRecurring();
    toast(n ? `Сохранено · создано операций: ${n}` : 'Регулярный платёж сохранён');
    close();
  }

  async function del() {
    if (existing && (await ask(`Удалить «${existing.name}»? Уже созданные операции останутся.`, { ok: 'Удалить', danger: true }))) {
      remove('recurring', existing.id);
      close();
    }
  }
</script>

<SheetFrame title={existing ? 'Регулярный платёж' : 'Новый регулярный платёж'} {close}>
  <Seg
    bind:value={type}
    onchange={onType}
    options={[
      { value: 'expense', label: 'Расход' },
      { value: 'income', label: 'Доход' },
    ]}
  />

  <label class="field">
    <span class="label">Название</span>
    <input class="input" bind:value={name} placeholder="Например: Netflix, аренда, зарплата" />
  </label>
  {#if !existing && !name}
    <div class="chips">
      {#each SUGGEST as s (s)}<button class="chip sm" onclick={() => (name = s)}>{s}</button>{/each}
    </div>
  {/if}

  <div class="field">
    <span class="label">Сумма</span>
    <MoneyInput bind:value={amount} big />
  </div>

  <div class="field">
    <span class="label">Как часто</span>
    <Seg
      bind:value={freq}
      options={[
        { value: 'weekly', label: 'Неделя' },
        { value: 'monthly', label: 'Месяц' },
        { value: 'yearly', label: 'Год' },
      ]}
    />
  </div>

  <label class="field">
    <span class="label">Ближайший платёж</span>
    <input class="input" type="date" bind:value={nextDate} />
  </label>

  <label class="hstack between card tight" style="background:var(--card-2)">
    <span>
      <span class="bold" style="display:block">Записывать автоматически</span>
      <span class="small muted">{auto ? 'операция появится сама в день платежа' : 'напомню, а отмечу оплату я сам'}</span>
    </span>
    <span class="switch"><input type="checkbox" bind:checked={auto} /><span></span></span>
  </label>

  <div class="field">
    <span class="label">Категория</span>
    <CategoryPicker bind:value={categoryId} {type} />
  </div>

  <div class="field">
    <span class="label">{type === 'expense' ? 'С какой карты' : 'Куда приходит'}</span>
    <AccountPicker bind:value={accountId} />
  </div>

  {#if existing}
    <label class="hstack between">
      <span>Активен</span>
      <span class="switch"><input type="checkbox" bind:checked={active} /><span></span></span>
    </label>
  {/if}

  {#if amount && nextDate < todayKey() && auto}
    <p class="hint">Дата в прошлом — операции за пропущенные периоды создадутся сразу ({money(amount)} каждая).</p>
  {/if}

  {#snippet footer()}
    {#if existing}
      <button class="btn danger icon-only" aria-label="Удалить" onclick={del}><Icon name="trash" size={20} /></button>
    {/if}
    <button class="btn primary" disabled={!valid} onclick={save}>Сохранить</button>
  {/snippet}
</SheetFrame>
