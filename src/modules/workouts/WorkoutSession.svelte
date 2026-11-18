<script lang="ts">
  // Экран тренировки: идущая (с таймером и отдыхом) или уже завершённая (редактирование).
  import type { WSet } from '../../lib/types';
  import { data, find, remove, exercise, lastSets } from '../../lib/store.svelte';
  import { openSheet, go, ask, toast } from '../../lib/nav.svelte';
  import { fmtClock, fmtDateShort, dayOf, vibrate, fmtNum, fmtMinutes } from '../../lib/utils';
  import { WORKOUT_TYPES } from '../../data/exercises';
  import TopBar from '../../components/TopBar.svelte';
  import Icon from '../../components/Icon.svelte';
  import Empty from '../../components/Empty.svelte';
  import NumInput from '../../components/NumInput.svelte';
  import DateTime from '../../components/DateTime.svelte';
  import ExercisePicker from './ExercisePicker.svelte';
  import { makeExercise, setsSummary, workoutStats, inferType } from './workouts';

  let { id }: { id: string } = $props();

  const w = $derived(find('workouts', id));
  const active = $derived(w?.status === 'active');
  const stats = $derived(w ? workoutStats(w) : null);

  let now = $state(Date.now());
  let restEnd = $state<number | null>(null);
  let menuFor = $state<string | null>(null);

  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(t);
  });

  // экран не гаснет, пока идёт тренировка
  $effect(() => {
    if (!active) return;
    let lock: { release: () => Promise<void> } | undefined;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => {});
    return () => {
      lock?.release().catch(() => {});
    };
  });

  const restLeft = $derived(restEnd ? Math.max(0, Math.ceil((restEnd - now) / 1000)) : 0);
  $effect(() => {
    if (restEnd && restLeft === 0) {
      restEnd = null;
      vibrate([200, 100, 200]);
      toast('Отдых окончен — следующий подход 💪');
    }
  });

  const RATING = ['😫', '😕', '😐', '🙂', '💪'];

  // «Записать прошедшую» создаёт черновик: если ушли, ничего не изменив, — не оставляем пустую тренировку
  const sig = (x: NonNullable<typeof w>) => JSON.stringify({ ...$state.snapshot(x), draft: undefined });
  const initialSig = w?.draft ? sig(w) : '';
  $effect(() => {
    if (w?.draft && sig(w) !== initialSig) w.draft = false;
  });
  $effect(() => () => {
    const cur = find('workouts', id);
    if (cur?.draft) remove('workouts', cur.id);
  });

  function toggleSet(s: WSet) {
    s.done = !s.done;
    if (s.done) {
      vibrate(12);
      if (active && data.settings.restSec > 0) restEnd = Date.now() + data.settings.restSec * 1000;
    }
  }

  function addSet(sets: WSet[]) {
    const prev = sets[sets.length - 1];
    sets.push({ reps: prev?.reps, weight: prev?.weight, duration: prev?.duration, distance: prev?.distance, done: !active });
  }

  function addExercises() {
    openSheet(ExercisePicker, {
      title: 'Добавить упражнения',
      onpick: (ids: string[]) => {
        if (!w) return;
        const wasEmpty = !w.exercises.length;
        for (const exId of ids) w.exercises.push(makeExercise(exId, !active));
        if (wasEmpty) w.type = inferType(w.exercises.map((e) => e.exerciseId));
      },
    });
  }

  function move(i: number, dir: -1 | 1) {
    if (!w) return;
    const j = i + dir;
    if (j < 0 || j >= w.exercises.length) return;
    const [x] = w.exercises.splice(i, 1);
    w.exercises.splice(j, 0, x);
    menuFor = null;
  }

  async function removeEx(i: number) {
    if (!w) return;
    menuFor = null;
    if (await ask(`Убрать «${exercise(w.exercises[i].exerciseId).name}» из тренировки?`, { ok: 'Убрать', danger: true })) {
      w.exercises.splice(i, 1);
    }
  }

  async function finish() {
    if (!w) return;
    if (!w.exercises.length && !(await ask('В тренировке нет упражнений. Всё равно завершить?', { ok: 'Завершить' }))) return;
    // неотмеченные подходы остаются в записи, но не идут в статистику
    w.duration = Math.max(1, Math.round((Date.now() - (w.startedAt ?? Date.now())) / 60000));
    w.status = 'done';
    w.startedAt = undefined;
    restEnd = null;
    toast(`Тренировка сохранена 💪 ${fmtMinutes(w.duration)}`);
    go('/workouts');
  }

  async function del() {
    if (!w) return;
    if (await ask('Удалить тренировку целиком?', { ok: 'Удалить', danger: true })) {
      const wid = w.id;
      go('/workouts');
      setTimeout(() => remove('workouts', wid), 50);
    }
  }
</script>

<TopBar
  title={active ? 'Тренировка идёт' : 'Тренировка'}
  sub={w ? (active ? fmtClock((now - (w.startedAt ?? now)) / 1000) : fmtDateShort(dayOf(w.date))) : ''}
  back="/workouts"
>
  {#snippet actions()}
    {#if w}<button class="icon-btn" aria-label="Удалить" onclick={del}><Icon name="trash" size={20} /></button>{/if}
  {/snippet}
</TopBar>

{#if !w}
  <div class="page"><Empty icon="🤷" title="Тренировка не найдена" /></div>
{:else}
  <div class="page">
    <div class="card vstack gap12">
      <input class="title-input" bind:value={w.title} placeholder="Название тренировки" />
      <div class="chips">
        {#each WORKOUT_TYPES as t (t.id)}
          <button class="chip sm" class:on={w.type === t.id} onclick={() => w && (w.type = t.id)}>{t.icon} {t.name}</button>
        {/each}
      </div>

      {#if active}
        <div class="hstack between">
          <div>
            <div class="label">Идёт</div>
            <div class="big-num">{fmtClock((now - (w.startedAt ?? now)) / 1000)}</div>
          </div>
          <button class="btn solid" style:--c="var(--green)" onclick={finish}><Icon name="check" size={18} /> Завершить</button>
        </div>
      {:else}
        <div class="field">
          <span class="label">Когда</span>
          <DateTime bind:value={w.date} />
        </div>
        <div class="grid2">
          <div class="field">
            <span class="label">Длительность, мин</span>
            <NumInput bind:value={w.duration} cls="input" inputmode="numeric" placeholder="60" />
          </div>
          <div class="field">
            <span class="label">Калории</span>
            <NumInput bind:value={w.calories} cls="input" inputmode="numeric" placeholder="—" />
          </div>
        </div>
      {/if}

      {#if stats && stats.exercises}
        <div class="grid3">
          <div class="stat alt"><span class="k">Упражнений</span><span class="v">{stats.exercises}</span></div>
          <div class="stat alt"><span class="k">Подходов</span><span class="v">{stats.sets}</span></div>
          <div class="stat alt"><span class="k">Объём, кг</span><span class="v">{fmtNum(stats.volume, 0)}</span></div>
        </div>
      {/if}
    </div>

    {#each w.exercises as we, i (we.uid)}
      {@const ex = exercise(we.exerciseId)}
      {@const last = lastSets(we.exerciseId, w.id)}
      {@const wide = ex.kind === 'strength' || ex.kind === 'cardio'}
      <div class="card tight vstack">
        <div class="hstack" style="align-items:flex-start">
          <div class="grow">
            <div class="bold">{ex.name}</div>
            <div class="small muted">
              {#if last}Прошлый раз: {setsSummary(ex.kind, last.sets)} · {fmtDateShort(dayOf(last.date))}{:else}{ex.group} · {ex.equipment}{/if}
            </div>
          </div>
          <button class="icon-btn sm" aria-label="Действия" onclick={() => (menuFor = menuFor === we.uid ? null : we.uid)}>
            <Icon name="more" size={20} />
          </button>
        </div>

        {#if menuFor === we.uid}
          <div class="hstack wrap">
            <button class="btn sm" disabled={i === 0} onclick={() => move(i, -1)}><Icon name="up" size={16} /> Выше</button>
            <button class="btn sm" disabled={i === w.exercises.length - 1} onclick={() => move(i, 1)}><Icon name="down" size={16} /> Ниже</button>
            <button class="btn sm danger" onclick={() => removeEx(i)}><Icon name="trash" size={16} /> Убрать</button>
          </div>
        {/if}

        <div class="sets" class:wide>
          <span class="h">#</span>
          {#if ex.kind === 'strength'}
            <span class="h">кг</span><span class="h">повт.</span>
          {:else if ex.kind === 'reps'}
            <span class="h">повторы</span>
          {:else if ex.kind === 'time'}
            <span class="h">секунды</span>
          {:else}
            <span class="h">минуты</span><span class="h">км</span>
          {/if}
          <span class="h"></span>

          {#each we.sets as s, j (j)}
            {@const prev = last?.sets[j]}
            <span class="n" class:done={s.done}>{j + 1}</span>
            {#if ex.kind === 'strength'}
              <NumInput bind:value={s.weight} placeholder={prev?.weight ?? 'кг'} ariaLabel="Вес" />
              <NumInput bind:value={s.reps} inputmode="numeric" placeholder={prev?.reps ?? 'повт'} ariaLabel="Повторы" />
            {:else if ex.kind === 'reps'}
              <NumInput bind:value={s.reps} inputmode="numeric" placeholder={prev?.reps ?? 'повт'} ariaLabel="Повторы" />
            {:else if ex.kind === 'time'}
              <NumInput bind:value={s.duration} inputmode="numeric" placeholder={prev?.duration ?? 'сек'} ariaLabel="Секунды" />
            {:else}
              <NumInput bind:value={s.duration} scale={60} decimals={1} placeholder="мин" ariaLabel="Минуты" />
              <NumInput bind:value={s.distance} placeholder="км" ariaLabel="Километры" />
            {/if}
            <button class="tick" class:on={s.done} aria-label="Подход выполнен" onclick={() => toggleSet(s)}>
              <Icon name="check" size={18} stroke={3} />
            </button>
          {/each}
        </div>

        <div class="hstack">
          <button class="btn sm grow" onclick={() => addSet(we.sets)}><Icon name="plus" size={16} /> Подход</button>
          {#if we.sets.length > 1}
            <button class="btn sm" aria-label="Убрать подход" onclick={() => we.sets.pop()}><Icon name="minus" size={16} /></button>
          {/if}
        </div>
      </div>
    {/each}

    <button class="btn block tinted lg" style:--c="#f97316" onclick={addExercises}>
      <Icon name="plus" size={20} /> Добавить упражнение
    </button>

    <div class="card vstack gap12">
      <div class="field">
        <span class="label">Самочувствие</span>
        <div class="hstack between">
          {#each RATING as r, i (i)}
            <button class="emoji-btn" class:on={w.rating === i + 1} style="width:52px;height:48px" onclick={() => w && (w.rating = w.rating === i + 1 ? undefined : i + 1)}>{r}</button>
          {/each}
        </div>
      </div>
      <label class="field">
        <span class="label">Заметка</span>
        <textarea class="input" bind:value={w.note} placeholder="Как прошло, что поменять в следующий раз…"></textarea>
      </label>
    </div>

    {#if active}
      <button class="btn primary lg block" onclick={finish}><Icon name="check" size={20} /> Завершить тренировку</button>
    {/if}
  </div>

  {#if restEnd}
    <div class="rest">
      <Icon name="timer" size={20} />
      <span class="grow bold">Отдых <span class="tnum">{fmtClock(restLeft)}</span></span>
      <button class="btn sm" onclick={() => restEnd && (restEnd += 15000)}>+15 с</button>
      <button class="btn sm" onclick={() => (restEnd = null)}>Пропустить</button>
    </div>
  {/if}
{/if}

<style>
  .title-input {
    background: none;
    border: 0;
    outline: none;
    font-size: 22px;
    font-weight: 750;
    letter-spacing: -0.01em;
    width: 100%;
    padding: 0;
  }
  .sets {
    display: grid;
    grid-template-columns: 26px 1fr 44px;
    gap: 6px 8px;
    align-items: center;
  }
  .sets.wide {
    grid-template-columns: 26px 1fr 1fr 44px;
  }
  .h {
    font-size: 11px;
    color: var(--muted);
    font-weight: 600;
    text-transform: uppercase;
    text-align: center;
  }
  .n {
    text-align: center;
    font-weight: 700;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .n.done {
    color: var(--green);
  }
  .sets :global(.input) {
    text-align: center;
    font-weight: 650;
  }
  .tick {
    width: 44px;
    height: 40px;
    border-radius: 10px;
    background: var(--card-2);
    color: var(--faint);
    display: grid;
    place-items: center;
  }
  .tick.on {
    background: var(--green);
    color: #fff;
  }
  .rest {
    position: fixed;
    left: 12px;
    right: 12px;
    max-width: 576px;
    margin: 0 auto;
    bottom: calc(var(--nav-h) + var(--safe-b) + 12px);
    z-index: 26;
    background: var(--accent);
    color: #fff;
    border-radius: 16px;
    padding: 8px 8px 8px 14px;
    display: flex;
    align-items: center;
    gap: 8px;
    box-shadow: var(--shadow);
  }
  .rest :global(.btn) {
    background: rgba(255, 255, 255, 0.2);
    color: #fff;
  }
</style>
