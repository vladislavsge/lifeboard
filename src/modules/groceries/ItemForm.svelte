<script lang="ts">
  import type { GroceryItem } from '../../lib/types';
  import { data, add, find, remove } from '../../lib/store.svelte';
  import { ask, toast } from '../../lib/nav.svelte';
  import { uid, norm, sum, parseLocal, money, fmtDateShort, dayOf } from '../../lib/utils';
  import { GROCERY_CATEGORIES, UNITS } from '../../data/defaults';
  import SheetFrame from '../../components/SheetFrame.svelte';
  import MoneyInput from '../../components/MoneyInput.svelte';
  import NumInput from '../../components/NumInput.svelte';
  import Icon from '../../components/Icon.svelte';

  let { id, name: n0 = '', inList: l0 = false, close }: { id?: string; name?: string; inList?: boolean; close: () => void } = $props();
  const existing = id ? find('groceryItems', id) : undefined;

  let name = $state(existing?.name ?? n0);
  let category = $state(existing?.category ?? 'other');
  let unit = $state(existing?.unit ?? 'шт');
  let price = $state<number | undefined>(existing?.price);
  let qty = $state<number | undefined>(existing?.qty ?? 1);
  let inList = $state(existing?.inList ?? l0);
  let note = $state(existing?.note ?? '');

  // история цен из чеков
  const history = $derived.by(() => {
    if (!existing) return [];
    const n = norm(existing.name);
    return data.groceryTrips
      .flatMap((t) =>
        t.lines
          .filter((l) => l.itemId === existing.id || norm(l.name) === n)
          .map((l) => ({ date: t.date, store: t.store, unit: Math.round(l.price / (l.qty || 1)) })),
      )
      .filter((h) => h.unit > 0)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  });
  const minH = $derived(history.length ? history.reduce((m, h) => (h.unit < m.unit ? h : m), history[0]) : null);
  const avg = $derived(history.length ? Math.round(sum(history, (h) => h.unit) / history.length) : 0);
  const everyDays = $derived.by(() => {
    if (history.length < 3) return 0;
    const first = parseLocal(history[history.length - 1].date).getTime();
    const last = parseLocal(history[0].date).getTime();
    return Math.round((last - first) / 86400000 / (history.length - 1));
  });

  function save() {
    if (!name.trim()) return;
    const fields = { name: name.trim(), category, unit, price, qty: qty || 1, inList, note: note.trim() || undefined };
    if (existing) Object.assign(existing, fields);
    else add('groceryItems', { id: uid(), ...fields } as GroceryItem);
    toast('Сохранено');
    close();
  }

  async function del() {
    if (existing && (await ask(`Удалить «${existing.name}» из набора?`, { ok: 'Удалить', danger: true }))) {
      remove('groceryItems', existing.id);
      close();
    }
  }
</script>

<SheetFrame title={existing ? existing.name : 'Новый товар'} {close}>
  <label class="field">
    <span class="label">Название</span>
    <input class="input" bind:value={name} placeholder="Например: Молоко 2,5%" />
  </label>

  <div class="field">
    <span class="label">Категория</span>
    <div class="chips wrap">
      {#each GROCERY_CATEGORIES as c (c.id)}
        <button class="chip sm" class:on={category === c.id} onclick={() => (category = c.id)}>{c.icon} {c.name}</button>
      {/each}
    </div>
  </div>

  <div class="field">
    <span class="label">Единица</span>
    <div class="chips wrap">
      {#each UNITS as u (u)}
        <button class="chip sm" class:on={unit === u} onclick={() => (unit = u)}>{u}</button>
      {/each}
    </div>
  </div>

  <div class="grid2">
    <div class="field">
      <span class="label">Цена за {unit}</span>
      <MoneyInput bind:value={price} />
    </div>
    <div class="field">
      <span class="label">Сколько купить</span>
      <NumInput bind:value={qty} cls="input" placeholder="1" />
    </div>
  </div>

  <label class="hstack between card tight" style="background:var(--card-2)">
    <span class="bold">🛒 Нужно купить</span>
    <span class="switch"><input type="checkbox" bind:checked={inList} /><span></span></span>
  </label>

  <label class="field">
    <span class="label">Заметка</span>
    <input class="input" bind:value={note} placeholder="Марка, где дешевле…" />
  </label>

  {#if history.length}
    <div class="section">
      <div class="section-head"><h3>История цен</h3></div>
      <div class="grid2">
        <div class="stat alt">
          <span class="k">Дешевле всего</span>
          <span class="v">{money(minH!.unit)}</span>
          <span class="tiny muted">{minH!.store ?? '—'} · {fmtDateShort(dayOf(minH!.date))}</span>
        </div>
        <div class="stat alt">
          <span class="k">В среднем</span>
          <span class="v">{money(avg)}</span>
          {#if everyDays}<span class="tiny muted">покупаете раз в ~{everyDays} дн.</span>{/if}
        </div>
      </div>
      <div class="list plain" style="background:var(--card-2)">
        {#each history.slice(0, 6) as h, i (i)}
          <div class="row" style="min-height:40px">
            <span class="grow small">{fmtDateShort(dayOf(h.date))}{h.store ? ' · ' + h.store : ''}</span>
            <span class="tnum bold small">{money(h.unit)} / {unit}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  {#snippet footer()}
    {#if existing}
      <button class="btn danger icon-only" aria-label="Удалить" onclick={del}><Icon name="trash" size={20} /></button>
    {/if}
    <button class="btn primary" disabled={!name.trim()} onclick={save}>Сохранить</button>
  {/snippet}
</SheetFrame>
