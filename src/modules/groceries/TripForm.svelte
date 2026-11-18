<script lang="ts">
  // Чек покупки: строки товаров, итог, способ оплаты. Сумма автоматически уходит в расходы.
  import type { GroceryTrip, TripLine } from '../../lib/types';
  import { data, add, find, remove, defaultAccountId, systemCategoryId, syncLinkedTx } from '../../lib/store.svelte';
  import { ask, toast } from '../../lib/nav.svelte';
  import { nowLocal, uid, money, norm, sum, clone } from '../../lib/utils';
  import SheetFrame from '../../components/SheetFrame.svelte';
  import MoneyInput from '../../components/MoneyInput.svelte';
  import NumInput from '../../components/NumInput.svelte';
  import AccountPicker from '../../components/AccountPicker.svelte';
  import DateTime from '../../components/DateTime.svelte';
  import Icon from '../../components/Icon.svelte';

  let { id, fromList = false, close }: { id?: string; fromList?: boolean; close: () => void } = $props();
  const existing = id ? find('groceryTrips', id) : undefined;

  const initialLines: TripLine[] = existing
    ? clone($state.snapshot(existing.lines) as TripLine[])
    : fromList
      ? data.groceryItems
          .filter((i) => i.inList && i.checked)
          .map((i) => ({ itemId: i.id, name: i.name, qty: i.qty || 1, price: Math.round((i.price ?? 0) * (i.qty || 1)) }))
      : [];

  let lines = $state<TripLine[]>(initialLines);
  let store = $state(existing?.store ?? lastStore());
  let date = $state(existing?.date ?? nowLocal());
  let accountId = $state(existing?.accountId ?? defaultAccountId());
  let note = $state(existing?.note ?? '');
  let manualTotal = $state<number | undefined>(existing && !existing.lines.length ? existing.total : undefined);
  let newName = $state('');

  const linesTotal = $derived(sum(lines, (l) => l.price));
  const total = $derived(lines.length ? linesTotal : (manualTotal ?? 0));
  const stores = $derived([...new Set(data.groceryTrips.map((t) => t.store).filter(Boolean))] as string[]);

  function lastStore() {
    const t = [...data.groceryTrips].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    return t?.store ?? '';
  }

  function addLine() {
    const n = newName.trim();
    if (!n) return;
    const item = data.groceryItems.find((i) => norm(i.name) === norm(n));
    lines.push({ itemId: item?.id, name: item?.name ?? n, qty: 1, price: item?.price ?? 0 });
    newName = '';
  }

  function save() {
    if (!total) return;
    const cleanLines = lines.filter((l) => l.name.trim()).map((l) => ({ ...l, name: l.name.trim(), qty: l.qty || 1 }));

    // новые названия — в «мой набор», цены — обновляем
    for (const l of cleanLines) {
      let item = find('groceryItems', l.itemId) ?? data.groceryItems.find((i) => norm(i.name) === norm(l.name));
      if (!item) item = add('groceryItems', { id: uid(), name: l.name, category: 'other', unit: 'шт', inList: false });
      l.itemId = item.id;
      if (l.price) item.price = Math.round(l.price / (l.qty || 1));
    }

    const trip: GroceryTrip = existing ?? ({ id: uid() } as GroceryTrip);
    Object.assign(trip, { date, store: store.trim() || undefined, lines: cleanLines, total, accountId, note: note.trim() || undefined });
    trip.txId = syncLinkedTx(trip.txId, {
      amount: total,
      categoryId: systemCategoryId('groceries'),
      accountId,
      date,
      note: store.trim() ? `Покупки: ${store.trim()}` : 'Покупки для дома',
      module: 'groceries',
      refId: trip.id,
    });
    if (!existing) add('groceryTrips', trip);

    if (fromList) {
      for (const i of data.groceryItems) {
        if (i.inList && i.checked) {
          i.inList = false;
          i.checked = false;
        }
      }
    }
    data.settings.defaultAccountId = accountId;
    toast(`Покупка ${money(total)} сохранена и добавлена в расходы`);
    close();
  }

  async function del() {
    if (!existing) return;
    if (await ask('Удалить покупку? Расход тоже удалится.', { ok: 'Удалить', danger: true })) {
      if (existing.txId) remove('transactions', existing.txId);
      remove('groceryTrips', existing.id);
      close();
    }
  }
</script>

<SheetFrame title={existing ? 'Покупка' : fromList ? 'Оформить покупку' : 'Новая покупка'} {close}>
  <div class="grid2">
    <label class="field">
      <span class="label">Магазин</span>
      <input class="input" bind:value={store} list="stores" placeholder="Rimi, Maxima…" />
      <datalist id="stores">
        {#each stores as s (s)}<option value={s}></option>{/each}
      </datalist>
    </label>
    <div class="field">
      <span class="label">Итого</span>
      {#if lines.length}
        <div class="input tnum bold" style="display:flex;align-items:center">{money(linesTotal)}</div>
      {:else}
        <MoneyInput bind:value={manualTotal} />
      {/if}
    </div>
  </div>

  <div class="section">
    <div class="section-head"><h3>Товары {lines.length ? `(${lines.length})` : ''}</h3></div>
    {#if lines.length}
      <div class="lines">
        <span class="h">Товар</span><span class="h">Кол-во</span><span class="h">Сумма</span><span></span>
        {#each lines as l, i (i)}
          <input class="input sm" bind:value={l.name} />
          <NumInput bind:value={() => l.qty, (v) => (l.qty = v ?? 1)} />
          <NumInput bind:value={() => l.price / 100, (v) => (l.price = Math.round((v ?? 0) * 100))} placeholder="0" />
          <button class="icon-btn sm" aria-label="Убрать" onclick={() => lines.splice(i, 1)}><Icon name="x" size={16} /></button>
        {/each}
      </div>
    {:else}
      <p class="hint">Можно просто ввести итог чека или добавить товары по одному.</p>
    {/if}
    <div class="hstack">
      <input
        class="input grow"
        bind:value={newName}
        list="grocery-names"
        placeholder="Добавить товар"
        enterkeyhint="done"
        onkeydown={(e) => e.key === 'Enter' && addLine()}
      />
      <button class="btn" onclick={addLine} aria-label="Добавить строку"><Icon name="plus" size={18} /></button>
    </div>
    <datalist id="grocery-names">
      {#each data.groceryItems as it (it.id)}<option value={it.name}></option>{/each}
    </datalist>
  </div>

  <div class="field">
    <span class="label">Чем платил</span>
    <AccountPicker bind:value={accountId} />
  </div>

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
    <button class="btn primary" disabled={!total} onclick={save}>Сохранить · {money(total)}</button>
  {/snippet}
</SheetFrame>

<style>
  .lines {
    display: grid;
    grid-template-columns: 1fr 64px 84px 32px;
    gap: 6px;
    align-items: center;
  }
  .h {
    font-size: 11px;
    color: var(--muted);
    font-weight: 600;
    text-transform: uppercase;
  }
  .lines :global(.input.sm) {
    padding: 0 8px;
  }
</style>
