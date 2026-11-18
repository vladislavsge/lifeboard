<script lang="ts">
  import type { Transaction, TxType } from '../../lib/types';
  import { data, add, find, categoriesOf, defaultAccountId, removeTransaction, category } from '../../lib/store.svelte';
  import { ask, toast, replaceSheet, go } from '../../lib/nav.svelte';
  import TripForm from '../groceries/TripForm.svelte';
  import AppointmentDetail from '../health/AppointmentDetail.svelte';
  import EntryForm from '../custom/EntryForm.svelte';
  import { nowLocal, uid, money } from '../../lib/utils';
  import SheetFrame from '../../components/SheetFrame.svelte';
  import MoneyInput from '../../components/MoneyInput.svelte';
  import Seg from '../../components/Seg.svelte';
  import CategoryPicker from '../../components/CategoryPicker.svelte';
  import AccountPicker from '../../components/AccountPicker.svelte';
  import DateTime from '../../components/DateTime.svelte';
  import Icon from '../../components/Icon.svelte';
  import { SOURCE_NAMES, frequentTx, type Frequent } from './finance';

  let {
    id,
    type: initialType = 'expense',
    categoryId,
    close,
  }: { id?: string; type?: TxType; categoryId?: string; close: () => void } = $props();

  const existing = id ? find('transactions', id) : undefined;

  let type = $state<TxType>(existing?.type ?? initialType);
  let amount = $state<number | undefined>(existing?.amount);
  let cat = $state(existing?.categoryId ?? categoryId ?? categoriesOf(initialType)[0]?.id ?? '');
  let accountId = $state(existing?.accountId ?? defaultAccountId());
  let date = $state(existing?.date ?? nowLocal());
  let note = $state(existing?.note ?? '');

  function onType(t: TxType) {
    const list = categoriesOf(t);
    if (!list.some((c) => c.id === cat)) cat = list[0]?.id ?? '';
  }

  const valid = $derived(!!amount && amount > 0 && !!cat);

  // частые операции — заполнить форму одним касанием
  const frequent = $derived(existing ? [] : frequentTx(type));
  function applyFrequent(f: Frequent) {
    amount = f.amount;
    cat = f.categoryId;
    if (data.accounts.some((a) => a.id === f.accountId && !a.archived)) accountId = f.accountId;
    note = f.note ?? '';
  }

  // открыть запись-источник (чек, визит, запись трекера)
  const sourceAction = $derived.by(() => {
    const s = existing?.source;
    if (!s?.refId) return null;
    if (s.module === 'groceries' && find('groceryTrips', s.refId)) return { label: 'Открыть чек', run: () => replaceSheet(TripForm, { id: s.refId }) };
    if (s.module === 'health' && find('appointments', s.refId)) return { label: 'Открыть визит', run: () => replaceSheet(AppointmentDetail, { id: s.refId! }) };
    if (s.module === 'tracker') {
      const e = find('entries', s.refId);
      if (e) return { label: 'Открыть запись', run: () => replaceSheet(EntryForm, { trackerId: e.trackerId, id: e.id }) };
    }
    if (s.module === 'recurring') return { label: 'Регулярные платежи', run: () => go('/finance/recurring') };
    return null;
  });

  function save() {
    if (!valid) return;
    const fields = { type, amount: amount!, categoryId: cat, accountId, date, note: note.trim() || undefined };
    if (existing) Object.assign(existing, fields);
    else {
      add('transactions', { id: uid(), ...fields } as Transaction);
      data.settings.defaultAccountId = accountId;
    }
    toast(`${type === 'expense' ? 'Расход' : 'Доход'} ${money(amount)} сохранён`);
    close();
  }

  async function del() {
    if (!existing) return;
    const linked = existing.source ? `\nЗапись связана с разделом «${SOURCE_NAMES[existing.source.module]}» — там она останется без суммы.` : '';
    if (await ask('Удалить операцию?' + linked, { ok: 'Удалить', danger: true })) {
      removeTransaction(existing.id);
      toast('Операция удалена');
      close();
    }
  }
</script>

<SheetFrame title={existing ? 'Операция' : type === 'expense' ? 'Новый расход' : 'Новый доход'} {close}>
  <Seg
    bind:value={type}
    onchange={onType}
    options={[
      { value: 'expense', label: 'Расход' },
      { value: 'income', label: 'Доход' },
    ]}
  />

  {#if existing?.source}
    <div class="hstack between card tight" style="background:var(--card-2)">
      <span class="small">Из раздела «{SOURCE_NAMES[existing.source.module]}»{existing.source.module === 'groceries' || existing.source.module === 'health' ? ' — сумму лучше менять там' : ''}</span>
      {#if sourceAction}<button class="btn sm" onclick={sourceAction.run}>{sourceAction.label}</button>{/if}
    </div>
  {/if}

  {#if frequent.length}
    <div class="chips">
      {#each frequent as f (f.key)}
        <button class="chip sm" onclick={() => applyFrequent(f)}>
          {category(f.categoryId)?.icon ?? '💶'} {f.note || category(f.categoryId)?.name} · <b class="tnum">{money(f.amount)}</b>
        </button>
      {/each}
    </div>
  {/if}

  <MoneyInput bind:value={amount} big autofocus={!existing} />

  <div class="field">
    <span class="label">Категория</span>
    <CategoryPicker bind:value={cat} {type} />
  </div>

  <div class="field">
    <span class="label">{type === 'expense' ? 'Чем платил' : 'Куда пришло'}</span>
    <AccountPicker bind:value={accountId} />
  </div>

  <div class="field">
    <span class="label">Когда</span>
    <DateTime bind:value={date} />
  </div>

  <label class="field">
    <span class="label">Комментарий</span>
    <input class="input" bind:value={note} placeholder="Например: обед с коллегами" enterkeyhint="done" />
  </label>

  {#snippet footer()}
    {#if existing}
      <button class="btn danger icon-only" aria-label="Удалить" onclick={del}><Icon name="trash" size={20} /></button>
    {/if}
    <button class="btn primary" disabled={!valid} onclick={save}>Сохранить</button>
  {/snippet}
</SheetFrame>
