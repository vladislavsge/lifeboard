<script lang="ts">
  import { data, app, find } from '../../lib/store.svelte';
  import { openSheet } from '../../lib/nav.svelte';
  import {
    money, todayKey, dateKey, addDays, lastDays, relTime, fmtDay, dayOf, timeOf, groupBy, fmtNum, sum,
    periodRange, inPeriod, WD_SHORT, isoWeekday, parseLocal, fmtMinutes,
  } from '../../lib/utils';
  import { smokeTypeIcon } from '../../data/defaults';
  import TopBar from '../../components/TopBar.svelte';
  import Icon from '../../components/Icon.svelte';
  import Bars from '../../components/Bars.svelte';
  import Empty from '../../components/Empty.svelte';
  import NumInput from '../../components/NumInput.svelte';
  import TxRow from '../finance/TxRow.svelte';
  import SmokeForm from './SmokeForm.svelte';
  import ProductForm from './ProductForm.svelte';
  import PurchaseForm from './PurchaseForm.svelte';
  import { logSmoke, countOn, lastSmoke, avgInterval, smokedCost, avgPerDay, byHour, longestBreak, limitStreak } from './smoking';

  const C = '#94a3b8';

  let productId = $state(data.settings.lastSmokeProductId ?? '');
  const products = $derived(data.smokeProducts.filter((p) => !p.archived));
  const today = $derived(countOn(todayKey()));
  const yesterday = $derived(countOn(dateKey(addDays(new Date(), -1))));
  const last = $derived(lastSmoke());
  const limit = $derived(data.settings.smokeLimit);
  const interval = $derived(avgInterval(todayKey()));

  const week = periodRange('week');
  const month = periodRange('month');
  const weekCount = $derived(sum(data.smokes.filter((s) => inPeriod(s.date, week)), (s) => s.count));
  const monthCount = $derived(sum(data.smokes.filter((s) => inPeriod(s.date, month)), (s) => s.count));

  const chart = $derived(
    lastDays(14).map((k) => ({
      label: k === todayKey() ? 'сег' : WD_SHORT[isoWeekday(parseLocal(k)) - 1].toLowerCase(),
      value: countOn(k),
    })),
  );

  const purchases = $derived(
    data.transactions
      .filter((t) => t.source?.module === 'smoking' || find('categories', t.categoryId)?.system === 'smoking')
      .sort((a, b) => (a.date < b.date ? 1 : -1)),
  );
  const monthSpent = $derived(sum(purchases.filter((t) => inPeriod(t.date, month)), (t) => t.amount));
  const monthKeys = $derived(new Set(data.smokes.filter((s) => inPeriod(s.date, month)).map((s) => dayOf(s.date))));
  const monthSmokedCost = $derived(smokedCost(monthKeys));

  const log = $derived([
    ...groupBy(
      data.smokes
        .filter((s) => s.date >= dateKey(addDays(new Date(), -6)))
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
      (s) => dayOf(s.date),
    ),
  ]);

  const sinceLast = $derived(last ? relTime(last.date, app.now) : '');
  const hours = $derived(byHour(30));
  const peak = $derived(hours.reduce((m, h) => (h.value > m.value ? h : m), hours[0]));
  const record = $derived(longestBreak(30, app.now));
  const streak = $derived(limitStreak());
  const overLimit = $derived(!!limit && today >= limit);
</script>

<TopBar title="Курение" back="/" />

<div class="page">
  <div class="card vstack gap12 hero">
    <div class="hstack between" style="align-items:flex-end">
      <div>
        <div class="label">Сегодня</div>
        <div class="count tnum" class:over={overLimit}>
          {today}{#if limit}<span class="of"> / {limit}</span>{/if}
        </div>
      </div>
      <div class="vstack gap4" style="text-align:right">
        <span class="label">Последняя</span>
        <span class="bold">{last ? sinceLast : '—'}</span>
        {#if interval}<span class="small muted">интервал ≈ {fmtMinutes(interval)}</span>{/if}
      </div>
    </div>
    {#if limit}
      <div class="progress" style:--c={overLimit ? 'var(--red)' : 'var(--green)'}>
        <div style:width="{Math.min(100, (today / limit) * 100)}%"></div>
      </div>
    {/if}

    {#if products.length}
      <div class="chips">
        {#each products as p (p.id)}
          <button class="chip sm" class:on={productId === p.id} onclick={() => (productId = p.id)}>{smokeTypeIcon(p.type)} {p.name}</button>
        {/each}
        <button class="chip sm" onclick={() => openSheet(ProductForm, { onsaved: (id: string) => (productId = id) })}><Icon name="plus" size={14} /></button>
      </div>
    {:else}
      <button class="btn sm" style="align-self:flex-start" onclick={() => openSheet(ProductForm, { onsaved: (id: string) => (productId = id) })}>
        <Icon name="plus" size={16} /> Указать, что курю
      </button>
    {/if}

    <button class="btn lg block solid smoke-btn" onclick={() => logSmoke(productId || undefined)}>🚬 Покурил</button>
    <button class="link-btn" onclick={() => openSheet(SmokeForm, {})}>Записать с другим временем или количеством</button>
  </div>

  <div class="grid2">
    <div class="stat"><span class="k">Вчера</span><span class="v">{yesterday}</span></div>
    <div class="stat"><span class="k">В среднем за день (7 дн)</span><span class="v">{fmtNum(avgPerDay(7))}</span></div>
    <div class="stat"><span class="k">За неделю</span><span class="v">{weekCount}</span></div>
    <div class="stat"><span class="k">За месяц</span><span class="v">{monthCount}</span></div>
  </div>

  <div class="card">
    <div class="label">Последние 14 дней</div>
    <div class="mt8"><Bars items={chart} color={C} showValues /></div>
  </div>

  {#if record || streak}
    <div class="grid2">
      {#if record}
        <div class="stat">
          <span class="k">Рекорд перерыва (30 дн)</span>
          <span class="v">{fmtMinutes(record.minutes)}</span>
          {#if last && record.from === last.date}<span class="tiny" style="color:var(--green)">идёт прямо сейчас 💪</span>{/if}
        </div>
      {/if}
      {#if limit}
        <div class="stat">
          <span class="k">В пределах лимита</span>
          <span class="v">{streak} дн. {streak >= 3 ? '🔥' : ''}</span>
        </div>
      {/if}
    </div>
  {/if}

  {#if peak && peak.value > 0}
    <div class="card">
      <div class="hstack between">
        <span class="label">По времени суток (30 дн)</span>
        <span class="small muted">чаще всего {peak.label}:00–{Number(peak.label) + 2}:00</span>
      </div>
      <div class="mt8"><Bars items={hours} color="#f59e0b" height={90} /></div>
      <p class="hint" style="padding:6px 0 0">Пики показывают привычные триггеры — кофе, обед, дорога. С ними проще работать, если знать их время.</p>
    </div>
  {/if}

  <div class="section">
    <div class="section-head">
      <h3>Расходы на курение</h3>
      <button onclick={() => openSheet(PurchaseForm, {})}>+ Купил</button>
    </div>
    <div class="card vstack gap12">
      <div class="grid2">
        <div>
          <div class="label">Потрачено в этом месяце</div>
          <div class="bold" style="font-size:22px">{money(monthSpent)}</div>
        </div>
        <div>
          <div class="label">Выкурено примерно на</div>
          <div class="bold" style="font-size:22px">{monthSmokedCost ? money(monthSmokedCost) : '—'}</div>
        </div>
      </div>
      {#if !monthSmokedCost && products.length}
        <p class="hint" style="padding:0">Укажите цену пачки и количество штук у продукта — посчитаю стоимость выкуренного.</p>
      {/if}
      <button class="btn block tinted" style:--c="var(--accent)" onclick={() => openSheet(PurchaseForm, {})}><Icon name="cart" size={18} /> Купил пачку</button>
    </div>
    {#if purchases.length}
      <div class="list">
        {#each purchases.slice(0, 5) as tx (tx.id)}
          <TxRow {tx} showDate />
        {/each}
      </div>
    {/if}
  </div>

  <div class="section">
    <div class="section-head"><h3>Журнал за неделю</h3></div>
    {#if !log.length}
      <div class="card"><Empty icon="🌿" title="Записей нет" text="Нажимайте «Покурил» каждый раз — так видно реальную картину." /></div>
    {:else}
      {#each log as [day, items] (day)}
        <div class="day-head"><span>{fmtDay(day)}</span><span>{sum(items, (s) => s.count)} шт</span></div>
        <div class="list">
          {#each items as s (s.id)}
            {@const p = find('smokeProducts', s.productId)}
            <button class="row" style="min-height:48px" onclick={() => openSheet(SmokeForm, { id: s.id })}>
              <div class="row-icon" style:--c={C}>{smokeTypeIcon(p?.type)}</div>
              <div class="row-main">
                <div class="row-title">{p?.name ?? 'Не указано'}{s.count > 1 ? ` × ${s.count}` : ''}</div>
                {#if s.note}<div class="row-sub">{s.note}</div>{/if}
              </div>
              <span class="tnum muted">{timeOf(s.date)}</span>
            </button>
          {/each}
        </div>
      {/each}
    {/if}
  </div>

  <div class="section">
    <div class="section-head"><h3>Настройки</h3></div>
    <div class="list">
      <div class="row">
        <div class="row-icon" style:--c="var(--green)">🎯</div>
        <div class="row-main">
          <div class="row-title">Дневной лимит</div>
          <div class="row-sub">пусто — без лимита</div>
        </div>
        <div style="width:90px"><NumInput bind:value={data.settings.smokeLimit} inputmode="numeric" placeholder="—" /></div>
      </div>
      {#each data.smokeProducts as p (p.id)}
        <button class="row" onclick={() => openSheet(ProductForm, { id: p.id })}>
          <div class="row-icon" style:--c={C}>{smokeTypeIcon(p.type)}</div>
          <div class="row-main">
            <div class="row-title">{p.name}{p.archived ? ' (скрыт)' : ''}</div>
            <div class="row-sub">
              {p.packPrice ? money(p.packPrice) : 'цена не указана'}{p.unitsPerPack ? ` · ${p.unitsPerPack} шт` : ''}
            </div>
          </div>
          <Icon name="right" size={18} />
        </button>
      {/each}
      <button class="row" onclick={() => openSheet(ProductForm, {})}>
        <div class="row-icon"><Icon name="plus" size={18} /></div>
        <div class="row-main"><div class="row-title" style="color:var(--accent)">Добавить, что курю</div></div>
      </button>
    </div>
  </div>
</div>

<style>
  .count {
    font-size: 56px;
    font-weight: 800;
    letter-spacing: -0.03em;
    line-height: 1;
  }
  .count.over {
    color: var(--red);
  }
  .of {
    font-size: 24px;
    color: var(--muted);
    font-weight: 700;
  }
  .smoke-btn {
    --c: #475569;
    font-size: 18px;
    height: 60px;
  }
</style>
