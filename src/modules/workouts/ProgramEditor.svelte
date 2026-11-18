<script lang="ts">
  // Редактор программы: дни недели, время, упражнения с целями. Всё сохраняется сразу.
  import type { ProgramDay } from '../../lib/types';
  import { find, remove, exercise } from '../../lib/store.svelte';
  import { go, openSheet, ask, toast } from '../../lib/nav.svelte';
  import { uid, WD_SHORT } from '../../lib/utils';
  import TopBar from '../../components/TopBar.svelte';
  import Icon from '../../components/Icon.svelte';
  import Empty from '../../components/Empty.svelte';
  import NumInput from '../../components/NumInput.svelte';
  import ExercisePicker from './ExercisePicker.svelte';
  import { startWorkout, targetSummary, programToIcs } from './workouts';

  let { id }: { id: string } = $props();
  const p = $derived(find('programs', id));
  let open = $state<string | null>(null);
  const C = '#f97316';

  function addDay() {
    if (!p) return;
    p.days.push({ id: uid(), name: `День ${p.days.length + 1}`, weekdays: [], time: '19:00', exercises: [] });
  }

  function toggleWd(d: ProgramDay, wd: number) {
    d.weekdays = d.weekdays.includes(wd) ? d.weekdays.filter((x) => x !== wd) : [...d.weekdays, wd].sort();
  }

  function addEx(d: ProgramDay) {
    openSheet(ExercisePicker, {
      title: 'Упражнения для дня',
      onpick: (ids: string[]) => {
        for (const exId of ids) {
          const k = exercise(exId).kind;
          d.exercises.push({
            uid: uid(),
            exerciseId: exId,
            sets: k === 'cardio' ? 1 : 3,
            reps: k === 'strength' || k === 'reps' ? 10 : undefined,
            duration: k === 'time' ? 60 : k === 'cardio' ? 1800 : undefined,
          });
        }
      },
    });
  }

  function moveEx(d: ProgramDay, i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= d.exercises.length) return;
    const [x] = d.exercises.splice(i, 1);
    d.exercises.splice(j, 0, x);
  }

  async function delDay(i: number) {
    if (!p) return;
    if (await ask(`Удалить «${p.days[i].name}»?`, { ok: 'Удалить', danger: true })) p.days.splice(i, 1);
  }

  function exportIcs() {
    if (!p) return;
    const n = programToIcs(p);
    toast(n ? 'Файл создан — откройте его, чтобы добавить тренировки в календарь (повтор каждую неделю, напоминание за 30 мин)' : 'Выберите дни недели хотя бы для одного дня программы');
  }

  async function delProgram() {
    if (!p) return;
    if (await ask(`Удалить программу «${p.name}»? Прошлые тренировки останутся.`, { ok: 'Удалить', danger: true })) {
      const pid = p.id;
      go('/workouts/programs');
      setTimeout(() => remove('programs', pid), 50);
      toast('Программа удалена');
    }
  }
</script>

<TopBar title="Программа" back="/workouts/programs">
  {#snippet actions()}
    {#if p}<button class="icon-btn" aria-label="Удалить" onclick={delProgram}><Icon name="trash" size={20} /></button>{/if}
  {/snippet}
</TopBar>

{#if !p}
  <div class="page"><Empty icon="🤷" title="Программа не найдена" /></div>
{:else}
  <div class="page">
    <div class="card vstack gap12">
      <input class="input" style="font-weight:700;font-size:18px" bind:value={p.name} placeholder="Название программы" />
      <textarea class="input" style="min-height:60px" bind:value={p.note} placeholder="Описание или цель (необязательно)"></textarea>
      <label class="hstack between">
        <span>Активна — показывать в календаре</span>
        <span class="switch"><input type="checkbox" bind:checked={p.active} /><span></span></span>
      </label>
      <button class="btn block" onclick={exportIcs}><Icon name="bell" size={18} /> Напоминания в календарь телефона</button>
    </div>

    {#each p.days as d, di (d.id)}
      <div class="card vstack gap12">
        <div class="hstack">
          <input class="input grow" style="font-weight:650" bind:value={d.name} placeholder="Название дня" />
          <button class="icon-btn" aria-label="Удалить день" onclick={() => delDay(di)}><Icon name="trash" size={18} /></button>
        </div>
        <div class="wds">
          {#each WD_SHORT as w, i (i)}
            <button class="wd" class:on={d.weekdays.includes(i + 1)} onclick={() => toggleWd(d, i + 1)}>{w}</button>
          {/each}
        </div>
        <label class="hstack">
          <span class="label grow">Время начала</span>
          <input class="input sm" style="width:120px" type="time" bind:value={d.time} />
        </label>

        {#if d.exercises.length}
          <div class="list plain" style="background:var(--card-2)">
            {#each d.exercises as pe, i (pe.uid)}
              {@const ex = exercise(pe.exerciseId)}
              <div class="row" style="flex-direction:column;align-items:stretch;gap:8px">
                <button class="hstack" style="text-align:left" onclick={() => (open = open === pe.uid ? null : pe.uid)}>
                  <span class="small muted tnum" style="width:18px">{i + 1}</span>
                  <span class="grow">
                    <span class="row-title" style="display:block">{ex.name}</span>
                    <span class="row-sub">{targetSummary(pe)}</span>
                  </span>
                  <Icon name={open === pe.uid ? 'up' : 'down'} size={18} />
                </button>
                {#if open === pe.uid}
                  <div class="grid3">
                    {#if ex.kind !== 'cardio'}
                      <label class="field"><span class="label">Подходы</span><NumInput bind:value={() => pe.sets, (v) => (pe.sets = Math.max(1, Math.round(v ?? 1)))} inputmode="numeric" /></label>
                    {/if}
                    {#if ex.kind === 'strength' || ex.kind === 'reps'}
                      <label class="field"><span class="label">Повторы</span><NumInput bind:value={pe.reps} inputmode="numeric" /></label>
                    {/if}
                    {#if ex.kind === 'strength'}
                      <label class="field"><span class="label">Вес, кг</span><NumInput bind:value={pe.weight} placeholder="авто" /></label>
                    {/if}
                    {#if ex.kind === 'time'}
                      <label class="field"><span class="label">Секунды</span><NumInput bind:value={pe.duration} inputmode="numeric" /></label>
                    {/if}
                    {#if ex.kind === 'cardio'}
                      <label class="field"><span class="label">Минуты</span><NumInput bind:value={pe.duration} scale={60} decimals={0} inputmode="numeric" /></label>
                      <label class="field"><span class="label">Км</span><NumInput bind:value={pe.distance} /></label>
                    {/if}
                  </div>
                  <input class="input sm" bind:value={pe.note} placeholder="Заметка: техника, темп…" />
                  <div class="hstack">
                    <button class="btn sm" disabled={i === 0} onclick={() => moveEx(d, i, -1)}><Icon name="up" size={16} /></button>
                    <button class="btn sm" disabled={i === d.exercises.length - 1} onclick={() => moveEx(d, i, 1)}><Icon name="down" size={16} /></button>
                    <span class="grow"></span>
                    <button class="btn sm danger" onclick={() => d.exercises.splice(i, 1)}><Icon name="trash" size={16} /> Убрать</button>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
          <p class="hint">Вес можно не указывать — подставится результат прошлой тренировки.</p>
        {/if}

        <div class="grid2">
          <button class="btn tinted" style:--c={C} onclick={() => addEx(d)}><Icon name="plus" size={18} /> Упражнение</button>
          <button class="btn" disabled={!d.exercises.length} onclick={() => go('/workouts/w/' + startWorkout({ programId: p!.id, dayId: d.id }))}>
            <Icon name="play" size={16} /> Начать
          </button>
        </div>
      </div>
    {/each}

    <button class="btn block" onclick={addDay}><Icon name="plus" size={18} /> Добавить день</button>
  </div>
{/if}

<style>
  .wds {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 6px;
  }
  .wd {
    height: 40px;
    border-radius: 11px;
    background: var(--card-2);
    font-weight: 650;
    font-size: 13px;
    color: var(--muted);
  }
  .wd.on {
    background: #f97316;
    color: #fff;
  }
</style>
