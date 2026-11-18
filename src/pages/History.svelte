<script lang="ts">
  // Общая лента всех записей из всех разделов.
  import { data, find, category, accountLabel, isEnabled } from '../lib/store.svelte';
  import { go, openSheet } from '../lib/nav.svelte';
  import { fmtDay, dayOf, timeOf, money, groupBy, fmtMinutes, norm, sum } from '../lib/utils';
  import Icon from '../components/Icon.svelte';
  import { smokeTypeIcon } from '../data/defaults';
  import { workoutTypeIcon } from '../data/exercises';
  import TopBar from '../components/TopBar.svelte';
  import Empty from '../components/Empty.svelte';
  import TxForm from '../modules/finance/TxForm.svelte';
  import SmokeForm from '../modules/smoking/SmokeForm.svelte';
  import TripForm from '../modules/groceries/TripForm.svelte';
  import AppointmentDetail from '../modules/health/AppointmentDetail.svelte';
  import EntryForm from '../modules/custom/EntryForm.svelte';
  import { entrySummary } from '../modules/custom/tracker';

  interface Item {
    id: string;
    kind: string;
    date: string;
    icon: string;
    color: string;
    title: string;
    sub: string;
    end?: string;
    plus?: boolean;
    cents?: number;
    open: () => void;
  }

  let filter = $state('all');
  let limit = $state(150);

  const FILTERS = [
    { id: 'all', label: 'Все' },
    { id: 'finance', label: '💶 Финансы' },
    { id: 'workouts', label: '🏋️ Тренировки' },
    { id: 'smoking', label: '🚬 Курение' },
    { id: 'groceries', label: '🛒 Покупки' },
    { id: 'health', label: '🩺 Врачи' },
    { id: 'trackers', label: '✨ Трекеры' },
  ];

  const items = $derived.by(() => {
    const out: Item[] = [];
    const want = (k: string) => filter === 'all' || filter === k;
    if (want('finance') && isEnabled('finance'))
      for (const t of data.transactions) {
        // чек из «Покупок» уже есть в ленте — не дублируем его расход
        if (filter === 'all' && t.source?.module === 'groceries' && isEnabled('groceries')) continue;
        const c = category(t.categoryId);
        out.push({
          id: t.id, kind: 'finance', date: t.date, icon: c?.icon ?? '💶', color: t.type === 'income' ? 'var(--green)' : 'var(--muted)',
          title: t.note || c?.name || 'Операция', sub: `${t.note && c ? c.name + ' · ' : ''}${accountLabel(t.accountId)}`,
          end: (t.type === 'income' ? '+' : '−') + money(t.amount), plus: t.type === 'income', cents: t.amount,
          open: () => openSheet(TxForm, { id: t.id }),
        });
      }
    if (want('workouts') && isEnabled('workouts'))
      for (const w of data.workouts)
        out.push({
          id: w.id, kind: 'workouts', date: w.date, icon: workoutTypeIcon(w.type), color: '#f97316', title: w.title,
          sub: w.status === 'active' ? 'идёт сейчас' : `${fmtMinutes(w.duration)} · ${w.exercises.length} упр.`,
          open: () => go('/workouts/w/' + w.id),
        });
    if (want('smoking') && isEnabled('smoking'))
      for (const s of data.smokes) {
        const p = find('smokeProducts', s.productId);
        out.push({
          id: s.id, kind: 'smoking', date: s.date, icon: smokeTypeIcon(p?.type), color: '#94a3b8',
          title: `Покурил${s.count > 1 ? ` × ${s.count}` : ''}`, sub: p?.name ?? 'не указано',
          open: () => openSheet(SmokeForm, { id: s.id }),
        });
      }
    if (want('groceries') && isEnabled('groceries'))
      for (const t of data.groceryTrips)
        out.push({
          id: t.id, kind: 'groceries', date: t.date, icon: '🧾', color: '#3b82f6', title: t.store || 'Покупка продуктов',
          sub: `${t.lines.length} тов.${t.lines.length ? ': ' + t.lines.map((l) => l.name).join(', ') : ''}`, end: '−' + money(t.total),
          cents: t.total, open: () => openSheet(TripForm, { id: t.id }),
        });
    if (want('health') && isEnabled('health'))
      for (const a of data.appointments)
        out.push({
          id: a.id, kind: 'health', date: a.date, icon: '🩺', color: '#ef4444', title: a.specialty,
          sub: a.status === 'planned' ? 'запланировано' : a.status === 'done' ? 'состоялся' : 'отменено',
          open: () => openSheet(AppointmentDetail, { id: a.id }),
        });
    if (want('trackers'))
      for (const e of data.entries) {
        const t = find('trackers', e.trackerId);
        if (!t || !isEnabled('tracker:' + t.id)) continue;
        out.push({
          id: e.id, kind: 'trackers', date: e.date, icon: t.icon, color: t.color, title: entrySummary(t, e), sub: t.name,
          open: () => openSheet(EntryForm, { trackerId: t.id, id: e.id }),
        });
      }
    return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  });

  let q = $state('');
  const found = $derived.by(() => {
    const nq = norm(q);
    if (!nq) return items;
    return items.filter((i) => norm(`${i.title} ${i.sub} ${i.end ?? ''} ${fmtDay(dayOf(i.date))}`).includes(nq));
  });
  const foundSum = $derived(q ? sum(found, (i) => (i.kind === 'finance' || i.kind === 'groceries' ? (i.plus ? 1 : -1) * (i.cents ?? 0) : 0)) : 0);
  const days = $derived([...groupBy(found.slice(0, limit), (i) => dayOf(i.date))]);
</script>

<TopBar title="История" sub="{items.length} записей" />

<div class="page">
  <div class="input-wrap">
    <span class="prefix-icon"><Icon name="search" size={18} /></span>
    <input class="input with-icon" type="search" bind:value={q} placeholder="Поиск: кафе, Rimi, жим, 500 мл…" />
  </div>
  {#if q}
    <div class="hstack between small muted" style="padding:0 4px">
      <span>Найдено: {found.length}</span>
      {#if foundSum}<span class="tnum">итого {money(foundSum, { sign: true })}</span>{/if}
    </div>
  {/if}

  <div class="chips">
    {#each FILTERS as f (f.id)}
      <button class="chip sm" class:on={filter === f.id} onclick={() => { filter = f.id; limit = 150; }}>{f.label}</button>
    {/each}
  </div>

  {#if !items.length}
    <div class="card"><Empty icon="🗂️" title="Здесь пока пусто" text="Все записи из всех разделов появятся в этой ленте." /></div>
  {:else}
    {#each days as [day, list] (day)}
      <div class="day-head"><span>{fmtDay(day)}</span></div>
      <div class="list">
        {#each list as it (it.kind + it.id)}
          <button class="row" onclick={it.open}>
            <div class="row-icon" style:--c={it.color}>{it.icon}</div>
            <div class="row-main">
              <div class="row-title">{it.title}</div>
              <div class="row-sub">{timeOf(it.date)} · {it.sub}</div>
            </div>
            {#if it.end}<span class="bold tnum" class:plus={it.plus}>{it.end}</span>{/if}
          </button>
        {/each}
      </div>
    {/each}
    {#if q && !found.length}
      <div class="card muted center small">Ничего не найдено по «{q}»</div>
    {/if}
    {#if found.length > limit}
      <button class="btn block" onclick={() => (limit += 150)}>Показать ещё</button>
    {/if}
  {/if}
</div>
