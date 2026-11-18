<script lang="ts">
  import type { EntryValue } from '../../lib/types';
  import { add, find, remove, defaultAccountId, syncLinkedTx } from '../../lib/store.svelte';
  import { ask, toast } from '../../lib/nav.svelte';
  import { uid, nowLocal, sum } from '../../lib/utils';
  import SheetFrame from '../../components/SheetFrame.svelte';
  import MoneyInput from '../../components/MoneyInput.svelte';
  import NumInput from '../../components/NumInput.svelte';
  import AccountPicker from '../../components/AccountPicker.svelte';
  import DateTime from '../../components/DateTime.svelte';
  import Icon from '../../components/Icon.svelte';
  import { RATING_EMOJI } from './tracker';
  import GoalProgress from './GoalProgress.svelte';

  let { trackerId, id, close }: { trackerId: string; id?: string; close: () => void } = $props();
  const t = find('trackers', trackerId)!;
  const existing = id ? find('entries', id) : undefined;

  // по умолчанию подставляем значения из последней записи для «выбора» — удобно для повторов
  let values = $state<Record<string, EntryValue>>(existing ? { ...existing.values } : {});
  let date = $state(existing?.date ?? nowLocal());
  let note = $state(existing?.note ?? '');
  let accountId = $state(existing?.accountId ?? defaultAccountId());

  const moneyFields = t.fields.filter((f) => f.type === 'money');
  const moneyTotal = $derived(sum(moneyFields, (f) => Number(values[f.id] ?? 0)));

  function save() {
    const clean: Record<string, EntryValue> = {};
    for (const f of t.fields) {
      const v = values[f.id];
      if (v !== undefined && v !== '' && !(typeof v === 'number' && Number.isNaN(v))) clean[f.id] = typeof v === 'string' ? v.trim() : v;
    }
    const e = existing ?? { id: uid(), trackerId: t.id, values: {}, date };
    Object.assign(e, { values: clean, date, note: note.trim() || undefined, accountId });
    e.txId = t.categoryId
      ? syncLinkedTx(e.txId, {
          amount: moneyTotal,
          categoryId: t.categoryId,
          accountId,
          date,
          note: `${t.icon} ${t.name}`,
          module: 'tracker',
          refId: e.id,
        })
      : e.txId;
    if (!existing) add('entries', e);
    toast('Записано');
    close();
  }

  async function del() {
    if (existing && (await ask('Удалить запись?', { ok: 'Удалить', danger: true }))) {
      if (existing.txId) remove('transactions', existing.txId);
      remove('entries', existing.id);
      close();
    }
  }
</script>

<SheetFrame title="{t.icon} {t.name}" {close}>
  {#if t.goal}<GoalProgress {t} />{/if}

  {#each t.fields as f, i (f.id)}
    <div class="field">
      <span class="label">{f.label}{f.unit ? `, ${f.unit}` : ''}</span>
      {#if f.type === 'number'}
        <NumInput bind:value={() => values[f.id] as number | undefined, (v) => (values[f.id] = v)} cls="input big" placeholder="0" autofocus={i === 0 && !existing} />
      {:else if f.type === 'money'}
        <MoneyInput bind:value={() => values[f.id] as number | undefined, (v) => (values[f.id] = v)} autofocus={i === 0 && !existing} />
      {:else if f.type === 'duration'}
        <NumInput bind:value={() => values[f.id] as number | undefined, (v) => (values[f.id] = v)} cls="input" inputmode="numeric" placeholder="минут" />
      {:else if f.type === 'text'}
        <input class="input" value={(values[f.id] as string) ?? ''} oninput={(e) => (values[f.id] = (e.currentTarget as HTMLInputElement).value)} />
      {:else if f.type === 'checkbox'}
        <label class="hstack between card tight" style="background:var(--card-2)">
          <span>{values[f.id] ? 'Да' : 'Нет'}</span>
          <span class="switch">
            <input type="checkbox" checked={!!values[f.id]} onchange={(e) => (values[f.id] = (e.currentTarget as HTMLInputElement).checked)} /><span></span>
          </span>
        </label>
      {:else if f.type === 'rating'}
        <div class="hstack between">
          {#each RATING_EMOJI as r, i (i)}
            <button class="emoji-btn" style="width:56px;height:52px;font-size:26px" class:on={values[f.id] === i + 1} onclick={() => (values[f.id] = values[f.id] === i + 1 ? undefined : i + 1)}>{r}</button>
          {/each}
        </div>
      {:else if f.type === 'select'}
        <div class="chips wrap">
          {#each f.options ?? [] as o (o)}
            <button class="chip" class:on={values[f.id] === o} onclick={() => (values[f.id] = values[f.id] === o ? undefined : o)}>{o}</button>
          {/each}
        </div>
      {/if}
    </div>
  {/each}

  {#if moneyFields.length && t.categoryId && moneyTotal}
    <div class="field">
      <span class="label">Чем платил</span>
      <AccountPicker bind:value={accountId} />
    </div>
  {/if}

  <div class="field">
    <span class="label">Когда</span>
    <DateTime bind:value={date} />
  </div>

  <label class="field">
    <span class="label">Заметка</span>
    <input class="input" bind:value={note} placeholder="Необязательно" />
  </label>

  {#snippet footer()}
    {#if existing}
      <button class="btn danger icon-only" aria-label="Удалить" onclick={del}><Icon name="trash" size={20} /></button>
    {/if}
    <button class="btn primary" style:background={t.color} onclick={save}>Сохранить</button>
  {/snippet}
</SheetFrame>
