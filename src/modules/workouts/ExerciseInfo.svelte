<script lang="ts">
  // Карточка упражнения: история выполнения и личные рекорды.
  import { data, exercise } from '../../lib/store.svelte';
  import { replaceSheet, go } from '../../lib/nav.svelte';
  import { fmtDateShort, dayOf, fmtNum } from '../../lib/utils';
  import { KINDS } from '../../data/exercises';
  import SheetFrame from '../../components/SheetFrame.svelte';
  import Bars from '../../components/Bars.svelte';
  import ExerciseForm from './ExerciseForm.svelte';
  import { setsSummary } from './workouts';

  let { id, close }: { id: string; close: () => void } = $props();
  const ex = $derived(exercise(id));

  const history = $derived(
    data.workouts
      .filter((w) => w.status === 'done' && w.exercises.some((e) => e.exerciseId === id))
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((w) => ({ w, sets: w.exercises.filter((e) => e.exerciseId === id).flatMap((e) => e.sets) })),
  );

  const best = $derived.by(() => {
    let weight = 0;
    let reps = 0;
    let oneRm = 0;
    let duration = 0;
    let distance = 0;
    for (const h of history) {
      for (const s of h.sets) {
        if (!s.done) continue;
        weight = Math.max(weight, s.weight ?? 0);
        reps = Math.max(reps, s.reps ?? 0);
        duration = Math.max(duration, s.duration ?? 0);
        distance = Math.max(distance, s.distance ?? 0);
        if (s.weight && s.reps) oneRm = Math.max(oneRm, s.weight * (1 + s.reps / 30)); // формула Эпли
      }
    }
    return { weight, reps, oneRm, duration, distance };
  });

  // график: максимальный вес (или повторы/время) по последним 10 тренировкам
  const chart = $derived(
    history
      .slice(0, 10)
      .reverse()
      .map((h) => {
        const done = h.sets.filter((s) => s.done);
        const v =
          ex.kind === 'strength'
            ? Math.max(0, ...done.map((s) => s.weight ?? 0))
            : ex.kind === 'reps'
              ? Math.max(0, ...done.map((s) => s.reps ?? 0))
              : ex.kind === 'cardio'
                ? Math.round(done.reduce((a, s) => a + (s.duration ?? 0), 0) / 60)
                : Math.max(0, ...done.map((s) => s.duration ?? 0));
        return { label: h.w.date.slice(8, 10) + '.' + h.w.date.slice(5, 7), value: v };
      }),
  );
  const chartLabel = $derived(
    ex.kind === 'strength' ? 'Макс. вес, кг' : ex.kind === 'reps' ? 'Макс. повторов' : ex.kind === 'cardio' ? 'Минут' : 'Секунд',
  );
</script>

<SheetFrame title={ex.name} {close}>
  <div class="hstack wrap">
    <span class="badge">{ex.group}</span>
    <span class="badge">{ex.equipment}</span>
    <span class="badge">{KINDS.find((k) => k.id === ex.kind)?.name}</span>
    {#if ex.custom}<span class="badge c" style:--c="var(--accent)">своё</span>{/if}
  </div>

  {#if history.length}
    <div class="grid3">
      <div class="stat alt"><span class="k">Тренировок</span><span class="v">{history.length}</span></div>
      {#if ex.kind === 'strength'}
        <div class="stat alt"><span class="k">Макс. вес</span><span class="v">{fmtNum(best.weight)} кг</span></div>
        <div class="stat alt"><span class="k">1ПМ ≈</span><span class="v">{fmtNum(best.oneRm, 0)} кг</span></div>
      {:else if ex.kind === 'reps'}
        <div class="stat alt"><span class="k">Рекорд</span><span class="v">{best.reps}</span></div>
      {:else if ex.kind === 'cardio'}
        <div class="stat alt"><span class="k">Макс. км</span><span class="v">{fmtNum(best.distance, 2)}</span></div>
      {:else}
        <div class="stat alt"><span class="k">Рекорд</span><span class="v">{best.duration} с</span></div>
      {/if}
    </div>

    {#if chart.length > 1}
      <div class="card" style="background:var(--card-2)">
        <div class="label">{chartLabel}</div>
        <div class="mt8"><Bars items={chart} color="#f97316" showValues format={(v) => fmtNum(v)} /></div>
      </div>
    {/if}

    <div class="list plain" style="background:var(--card-2)">
      {#each history.slice(0, 15) as h (h.w.id)}
        <button class="row" onclick={() => go('/workouts/w/' + h.w.id)}>
          <div class="row-main">
            <div class="row-title">{setsSummary(ex.kind, h.sets.filter((s) => s.done).length ? h.sets.filter((s) => s.done) : h.sets)}</div>
            <div class="row-sub">{fmtDateShort(dayOf(h.w.date))} · {h.w.title}</div>
          </div>
        </button>
      {/each}
    </div>
  {:else}
    <p class="muted">Это упражнение вы ещё не делали. Добавьте его в тренировку или программу.</p>
  {/if}

  {#snippet footer()}
    {#if ex.custom}
      <button class="btn" onclick={() => replaceSheet(ExerciseForm, { id })}>Изменить</button>
    {/if}
    <button class="btn primary" onclick={close}>Готово</button>
  {/snippet}
</SheetFrame>
