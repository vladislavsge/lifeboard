<script lang="ts">
  import { data, add, accountLabel } from '../../lib/store.svelte';
  import { openSheet, replaceRoute, toast } from '../../lib/nav.svelte';
  import { money, norm, uid, groupBy, sum, fmtDay, dayOf, periodRange, inPeriod, fmtNum } from '../../lib/utils';
  import { GROCERY_CATEGORIES, STARTER_GROCERIES, groceryCat } from '../../data/defaults';
  import TopBar from '../../components/TopBar.svelte';
  import Seg from '../../components/Seg.svelte';
  import Icon from '../../components/Icon.svelte';
  import Empty from '../../components/Empty.svelte';
  import ItemForm from './ItemForm.svelte';
  import TripForm from './TripForm.svelte';

  let { tab }: { tab: string } = $props();
  const C = '#3b82f6';

  let quick = $state('');
  let q = $state('');

  const catOrder = (id: string) => GROCERY_CATEGORIES.findIndex((c) => c.id === id);
  const sortByCat = <T extends { category: string; name: string }>(a: T, b: T) =>
    catOrder(a.category) - catOrder(b.category) || a.name.localeCompare(b.name, 'ru');

  const list = $derived(data.groceryItems.filter((i) => i.inList).sort(sortByCat));
  const listGroups = $derived([...groupBy(list, (i) => i.category)]);
  const checked = $derived(list.filter((i) => i.checked));
  const estimate = $derived(sum(list, (i) => (i.price ?? 0) * (i.qty || 1)));

  const catalog = $derived(
    data.groceryItems.filter((i) => !q || norm(i.name).includes(norm(q))).sort(sortByCat),
  );
  const catalogGroups = $derived([...groupBy(catalog, (i) => i.category)]);

  const trips = $derived([...data.groceryTrips].sort((a, b) => (a.date < b.date ? 1 : -1)));
  const month = periodRange('month');
  const monthTotal = $derived(sum(trips.filter((t) => inPeriod(t.date, month)), (t) => t.total));

  function quickAdd() {
    const n = quick.trim();
    if (!n) return;
    const item = data.groceryItems.find((i) => norm(i.name) === norm(n));
    if (item) {
      item.inList = true;
      item.checked = false;
    } else {
      add('groceryItems', { id: uid(), name: n, category: guessCategory(n), unit: 'шт', inList: true, qty: 1 });
    }
    quick = '';
  }

  // если такое название уже было в стартовом наборе — берём его категорию
  function guessCategory(n: string) {
    const s = STARTER_GROCERIES.find(([name]) => norm(n).includes(norm(name)) || norm(name).includes(norm(n)));
    return s?.[1] ?? 'other';
  }

  function addStarter() {
    let added = 0;
    for (const [name, category, unit] of STARTER_GROCERIES) {
      if (data.groceryItems.some((i) => norm(i.name) === norm(name))) continue;
      add('groceryItems', { id: uid(), name, category, unit, inList: false });
      added++;
    }
    toast(`Добавлено товаров: ${added}`);
  }

  function clearChecked() {
    for (const i of list) if (i.checked) {
      i.inList = false;
      i.checked = false;
    }
  }
</script>

<TopBar title="Покупки" back="/" />

<div class="page">
  <Seg
    value={tab}
    onchange={(v) => replaceRoute(v === 'list' ? '/groceries' : '/groceries/' + v)}
    options={[
      { value: 'list', label: `Список${list.length ? ' · ' + list.length : ''}` },
      { value: 'catalog', label: 'Мой набор' },
      { value: 'trips', label: 'Чеки' },
    ]}
  />

  {#if tab === 'list'}
    <div class="hstack">
      <input
        class="input grow"
        bind:value={quick}
        list="all-items"
        placeholder="Что купить? Например: молоко"
        enterkeyhint="done"
        onkeydown={(e) => e.key === 'Enter' && quickAdd()}
      />
      <button class="btn solid" style:--c={C} aria-label="Добавить" onclick={quickAdd}><Icon name="plus" size={20} /></button>
    </div>
    <datalist id="all-items">
      {#each data.groceryItems.filter((i) => !i.inList) as it (it.id)}<option value={it.name}></option>{/each}
    </datalist>

    {#if !list.length}
      <div class="card">
        <Empty icon="🛒" title="Список пуст" text="Добавьте товары сверху или отметьте нужное в своём наборе.">
          <button class="btn sm" onclick={() => replaceRoute('/groceries/catalog')}>Открыть мой набор</button>
        </Empty>
      </div>
    {:else}
      <div class="hstack between small muted" style="padding:0 4px">
        <span>В корзине {checked.length} из {list.length}</span>
        {#if estimate}<span>≈ {money(estimate)}</span>{/if}
      </div>
      {#each listGroups as [cat, items] (cat)}
        {@const c = groceryCat(cat)}
        <div class="section">
          <div class="day-head"><span>{c.icon} {c.name}</span></div>
          <div class="list">
            {#each items as it (it.id)}
              <div class="row" class:got={it.checked}>
                <button class="box" class:on={it.checked} aria-label="В корзине" onclick={() => (it.checked = !it.checked)}>
                  <Icon name="check" size={18} stroke={3} />
                </button>
                <button class="row-main" style="text-align:left" onclick={() => (it.checked = !it.checked)}>
                  <div class="row-title">{it.name}</div>
                  <div class="row-sub">
                    {fmtNum(it.qty || 1)} {it.unit}{it.price ? ` · ≈ ${money(Math.round(it.price * (it.qty || 1)))}` : ''}{it.note ? ` · ${it.note}` : ''}
                  </div>
                </button>
                <button class="icon-btn sm" aria-label="Изменить" onclick={() => openSheet(ItemForm, { id: it.id })}><Icon name="edit" size={16} /></button>
              </div>
            {/each}
          </div>
        </div>
      {/each}

      <div class="vstack">
        <button class="btn solid lg block" style:--c={C} disabled={!checked.length} onclick={() => openSheet(TripForm, { fromList: true })}>
          <Icon name="check" size={18} /> Оформить покупку{checked.length ? ` (${checked.length})` : ''}
        </button>
        {#if checked.length}
          <button class="link-btn" onclick={clearChecked}>Убрать отмеченное без записи расхода</button>
        {/if}
      </div>
    {/if}
  {:else if tab === 'catalog'}
    <p class="hint">Ваш постоянный набор для дома. Нажмите 🛒, чтобы отправить товар в список «что купить».</p>
    <div class="hstack">
      <div class="input-wrap grow">
        <span class="prefix-icon"><Icon name="search" size={18} /></span>
        <input class="input with-icon" bind:value={q} type="search" placeholder="Поиск" />
      </div>
      <button class="btn solid" style:--c={C} aria-label="Новый товар" onclick={() => openSheet(ItemForm, { name: q })}><Icon name="plus" size={20} /></button>
    </div>

    {#if !data.groceryItems.length}
      <div class="card">
        <Empty icon="🧺" title="Набор пуст" text="Добавьте свои товары или начните с базового набора — потом уберёте лишнее.">
          <button class="btn sm primary" onclick={addStarter}>Добавить базовый набор</button>
        </Empty>
      </div>
    {:else}
      {#each catalogGroups as [cat, items] (cat)}
        {@const c = groceryCat(cat)}
        <div class="section">
          <div class="day-head"><span>{c.icon} {c.name}</span><span>{items.length}</span></div>
          <div class="list">
            {#each items as it (it.id)}
              <div class="row">
                <button class="row-main" style="text-align:left" onclick={() => openSheet(ItemForm, { id: it.id })}>
                  <div class="row-title">{it.name}</div>
                  <div class="row-sub">{it.price ? `${money(it.price)} / ${it.unit}` : it.unit}</div>
                </button>
                <button
                  class="cart"
                  class:on={it.inList}
                  aria-label={it.inList ? 'Убрать из списка' : 'В список'}
                  onclick={() => {
                    it.inList = !it.inList;
                    it.checked = false;
                  }}
                >
                  {#if it.inList}<Icon name="check" size={18} stroke={3} />{:else}<Icon name="cart" size={18} />{/if}
                </button>
              </div>
            {/each}
          </div>
        </div>
      {/each}
      <button class="btn block" onclick={addStarter}><Icon name="plus" size={18} /> Дополнить базовым набором</button>
    {/if}
  {:else}
    <div class="card hstack between">
      <div>
        <div class="label">Продукты в этом месяце</div>
        <div class="big-num">{money(monthTotal)}</div>
      </div>
      <button class="btn solid" style:--c={C} onclick={() => openSheet(TripForm, {})}><Icon name="plus" size={18} /> Чек</button>
    </div>
    {#if !trips.length}
      <div class="card"><Empty icon="🧾" title="Покупок ещё нет" text="Оформите покупку из списка или добавьте чек вручную." /></div>
    {:else}
      <div class="list">
        {#each trips as t (t.id)}
          <button class="row" onclick={() => openSheet(TripForm, { id: t.id })}>
            <div class="row-icon" style:--c={C}>🧾</div>
            <div class="row-main">
              <div class="row-title">{t.store || 'Покупка'}</div>
              <div class="row-sub">{fmtDay(dayOf(t.date))} · {t.lines.length ? `${t.lines.length} тов. · ` : ''}{accountLabel(t.accountId)}</div>
            </div>
            <span class="bold tnum">{money(t.total)}</span>
          </button>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .box,
  .cart {
    width: 30px;
    height: 30px;
    flex: none;
    border-radius: 9px;
    border: 2px solid var(--card-3);
    display: grid;
    place-items: center;
    color: transparent;
  }
  .box.on {
    background: #3b82f6;
    border-color: #3b82f6;
    color: #fff;
  }
  .cart {
    width: 40px;
    height: 36px;
    border-radius: 11px;
    border: 0;
    background: var(--card-2);
    color: var(--muted);
  }
  .cart.on {
    background: #3b82f6;
    color: #fff;
  }
  .got .row-title {
    text-decoration: line-through;
    color: var(--muted);
  }
</style>
