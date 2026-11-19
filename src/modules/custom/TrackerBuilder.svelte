<script lang="ts">
  // Конструктор своего трекера: название, иконка, цвет и любые поля.
  import type { FieldType, Tracker, TrackerField } from '../../lib/types';
  import { data, add, find, removeTracker, categoriesOf } from '../../lib/store.svelte';
  import { go, ask, toast, replaceRoute } from '../../lib/nav.svelte';
  import { uid, SWATCHES, nowLocal, clone, fmtMinutes, money } from '../../lib/utils';
  import { FIELD_TYPES, TRACKER_PRESET_GROUPS, EMOJI_SUGGEST, type TrackerPreset } from '../../data/defaults';
  import TopBar from '../../components/TopBar.svelte';
  import Icon from '../../components/Icon.svelte';
  import Seg from '../../components/Seg.svelte';
  import NumInput from '../../components/NumInput.svelte';
  import MoneyInput from '../../components/MoneyInput.svelte';

  let { id }: { id: string } = $props();
  const existing = id !== 'new' ? find('trackers', id) : undefined;

  let step = $state<'preset' | 'edit'>(existing ? 'edit' : 'preset');
  let name = $state(existing?.name ?? '');
  let icon = $state(existing?.icon ?? '✨');
  let color = $state(existing?.color ?? SWATCHES[0]);
  let fields = $state<TrackerField[]>(existing ? clone($state.snapshot(existing.fields) as TrackerField[]) : []);
  let categoryId = $state(existing?.categoryId ?? '');
  let goalOn = $state(!!existing?.goal);
  let goal = $state<number | undefined>(existing?.goal);
  let goalMode = $state<'min' | 'max'>(existing?.goalMode ?? 'min');

  const hasMoney = $derived(fields.some((f) => f.type === 'money'));
  const gf = $derived(fields.find((f) => f.type === 'number' || f.type === 'money' || f.type === 'duration'));
  const goalUnit = $derived(!gf ? 'записей' : gf.type === 'duration' ? 'минут' : gf.type === 'money' ? '' : gf.unit || '');
  const valid = $derived(name.trim().length > 0 && fields.length > 0 && fields.every((f) => f.label.trim()));
  const entriesCount = $derived(existing ? data.entries.filter((e) => e.trackerId === existing.id).length : 0);

  /** «цель 2 л», «не больше 2 ч» — чтобы заготовка с целью была видна сразу */
  function goalHint(p: TrackerPreset): string {
    if (!p.goal) return '';
    const f = p.fields.find((x) => x.type === 'number' || x.type === 'money' || x.type === 'duration');
    const prefix = p.goalMode === 'max' ? 'не больше ' : 'цель ';
    if (!f) return prefix + p.goal + ' раз в день';
    if (f.type === 'duration') return prefix + fmtMinutes(p.goal);
    if (f.type === 'money') return prefix + money(p.goal);
    return prefix + p.goal + (f.unit ? ' ' + f.unit : '');
  }

  function applyPreset(p: TrackerPreset) {
    name = p.name === 'Свой трекер' ? '' : p.name;
    icon = p.icon;
    color = p.color;
    fields = p.fields.map((f) => ({ id: uid(), ...clone(f) }));
    categoryId = p.fields.some((f) => f.type === 'money') ? (categoriesOf('expense').find((c) => c.id === 'c-other')?.id ?? '') : '';
    goalOn = !!p.goal;
    goal = p.goal;
    goalMode = p.goalMode ?? 'min';
    step = 'edit';
  }

  function addField() {
    fields.push({ id: uid(), label: '', type: 'number' });
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= fields.length) return;
    const [x] = fields.splice(i, 1);
    fields.splice(j, 0, x);
  }

  function save() {
    if (!valid) return;
    const clean = fields.map((f) => ({
      id: f.id,
      label: f.label.trim(),
      type: f.type,
      unit: f.type === 'number' ? f.unit?.trim() || undefined : undefined,
      options: f.type === 'select' ? (f.options ?? []).map((o) => o.trim()).filter(Boolean) : undefined,
    }));
    const patch = {
      name: name.trim(),
      icon: icon || '✨',
      color,
      fields: clean,
      categoryId: hasMoney && categoryId ? categoryId : undefined,
      goal: goalOn && goal ? goal : undefined,
      goalMode: goalOn && goal ? goalMode : undefined,
    };
    if (existing) {
      Object.assign(existing, patch);
      toast('Трекер обновлён');
      go('/t/' + existing.id);
    } else {
      const t = add('trackers', { id: uid(), createdAt: nowLocal(), ...patch } as Tracker);
      data.settings.modules.push({ id: 'tracker:' + t.id, enabled: true });
      toast('Трекер создан и добавлен на главную');
      replaceRoute('/t/' + t.id);
    }
  }

  async function del() {
    if (!existing) return;
    const msg = entriesCount
      ? `Удалить трекер «${existing.name}» и все его записи (${entriesCount})? Это нельзя отменить.`
      : `Удалить трекер «${existing.name}»?`;
    if (await ask(msg, { ok: 'Удалить', danger: true })) {
      const tid = existing.id;
      go('/settings/modules');
      setTimeout(() => removeTracker(tid), 50);
      toast('Трекер удалён');
    }
  }

  const optionsText = (f: TrackerField) => (f.options ?? []).join(', ');
</script>

<TopBar title={existing ? 'Настройка трекера' : 'Новый трекер'} back={existing ? '/t/' + existing.id : '/settings/modules'}>
  {#snippet actions()}
    {#if existing}<button class="icon-btn" aria-label="Удалить" onclick={del}><Icon name="trash" size={20} /></button>{/if}
  {/snippet}
</TopBar>

<div class="page">
  {#if step === 'preset'}
    <p class="hint">Выберите заготовку — потом всё можно поменять. Или начните с пустого.</p>
    {#each TRACKER_PRESET_GROUPS as g (g.name)}
      <div class="section">
        <div class="section-head"><h3>{g.name}</h3></div>
        <div class="grid2">
          {#each g.items as p (p.name)}
            <button class="card tight preset" style:--c={p.color} onclick={() => applyPreset(p)}>
              <span class="pi">{p.icon}</span>
              <span class="bold">{p.name}</span>
              <span class="small muted">{p.fields.map((f) => f.label).join(', ')}</span>
              {#if p.goal}<span class="tiny faint">{goalHint(p)}</span>{/if}
            </button>
          {/each}
        </div>
      </div>
    {/each}
  {:else}
    <div class="card vstack gap12">
      <div class="hstack">
        <div class="emoji-btn on" style="width:52px;height:52px;font-size:26px;flex:none" style:background="color-mix(in srgb, {color} 20%, transparent)">{icon}</div>
        <input class="input grow" style="font-weight:650" bind:value={name} placeholder="Название, например «Вода»" />
      </div>
      <div class="chips" style="gap:6px">
        <input class="input sm" style="width:64px;flex:none;text-align:center" maxlength="4" placeholder="свой" oninput={(e) => (icon = (e.currentTarget as HTMLInputElement).value || icon)} />
        {#each EMOJI_SUGGEST as e (e)}
          <button class="emoji-btn" style="flex:none" class:on={icon === e} onclick={() => (icon = e)}>{e}</button>
        {/each}
      </div>
      <div class="swatches">
        {#each SWATCHES as c (c)}
          <button class="swatch" class:on={color === c} style:background={c} aria-label={c} onclick={() => (color = c)}></button>
        {/each}
      </div>
    </div>

    <div class="section">
      <div class="section-head"><h3>Поля записи</h3></div>
      {#each fields as f, i (f.id)}
        <div class="card tight vstack">
          <div class="hstack">
            <input class="input sm grow" bind:value={f.label} placeholder="Название поля" />
            <button class="icon-btn sm" aria-label="Выше" disabled={i === 0} onclick={() => move(i, -1)}><Icon name="up" size={16} /></button>
            <button class="icon-btn sm" aria-label="Ниже" disabled={i === fields.length - 1} onclick={() => move(i, 1)}><Icon name="down" size={16} /></button>
            <button class="icon-btn sm" aria-label="Удалить поле" onclick={() => fields.splice(i, 1)}><Icon name="x" size={16} /></button>
          </div>
          <div class="chips">
            {#each FIELD_TYPES as ft (ft.id)}
              <button class="chip sm" class:on={f.type === ft.id} onclick={() => (f.type = ft.id as FieldType)}>{ft.name}</button>
            {/each}
          </div>
          <span class="tiny muted">{FIELD_TYPES.find((x) => x.id === f.type)?.hint}</span>
          {#if f.type === 'number'}
            <input class="input sm" bind:value={f.unit} placeholder="Единица: кг, мл, шт, км…" />
          {:else if f.type === 'select'}
            <input
              class="input sm"
              value={optionsText(f)}
              placeholder="Варианты через запятую: Пиво, Вино, Крепкое"
              oninput={(e) => (f.options = (e.currentTarget as HTMLInputElement).value.split(','))}
            />
          {/if}
        </div>
      {/each}
      <button class="btn block" onclick={addField}><Icon name="plus" size={18} /> Добавить поле</button>
      {#if !fields.length}<p class="hint">Нужно хотя бы одно поле. Для простого счётчика («было/не было») добавьте поле «Да / нет» или «Число».</p>{/if}
    </div>

    {#if hasMoney}
      <div class="section">
        <div class="section-head"><h3>Связь с финансами</h3></div>
        <select class="input" bind:value={categoryId}>
          <option value="">Не добавлять в расходы</option>
          {#each categoriesOf('expense') as c (c.id)}
            <option value={c.id}>{c.icon} {c.name}</option>
          {/each}
        </select>
        <p class="hint">Сумма из поля «Деньги» автоматически станет расходом в выбранной категории.</p>
      </div>
    {/if}

    <div class="section">
      <div class="section-head"><h3>Цель на день</h3></div>
      <div class="card vstack gap12">
        <label class="hstack between">
          <span>
            <span class="bold" style="display:block">Поставить цель</span>
            <span class="small muted">прогресс на главной и серия дней 🔥</span>
          </span>
          <span class="switch"><input type="checkbox" bind:checked={goalOn} /><span></span></span>
        </label>
        {#if goalOn}
          <Seg
            bind:value={goalMode}
            options={[
              { value: 'min', label: 'Не меньше' },
              { value: 'max', label: 'Не больше' },
            ]}
          />
          <div class="hstack">
            {#if gf?.type === 'money'}
              <div class="grow"><MoneyInput bind:value={goal} /></div>
            {:else}
              <div class="grow"><NumInput bind:value={goal} cls="input" placeholder={goalMode === 'min' ? '2000' : '3'} /></div>
            {/if}
            {#if goalUnit}<span class="muted">{goalUnit}</span>{/if}
          </div>
          <p class="hint" style="padding:0">
            {gf ? `Считается по полю «${gf.label || 'без названия'}» за день.` : 'Нет числового поля — считается количество записей за день.'}
            {goalMode === 'min' ? 'Например, вода: не меньше 2000 мл.' : 'Например, кофе: не больше 3 в день.'}
          </p>
        {/if}
      </div>
    </div>

    <button class="btn primary lg block" disabled={!valid} onclick={save}>{existing ? 'Сохранить' : 'Создать трекер'}</button>
    {#if !existing}
      <button class="link-btn" onclick={() => (step = 'preset')}>← Выбрать другую заготовку</button>
    {/if}
  {/if}
</div>

<style>
  .preset {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    text-align: left;
    min-height: 120px;
  }
  .preset:active {
    transform: scale(0.98);
  }
  .pi {
    font-size: 26px;
    width: 46px;
    height: 46px;
    border-radius: 14px;
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--c) 18%, transparent);
    margin-bottom: 4px;
  }
</style>
