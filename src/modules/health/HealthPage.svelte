<script lang="ts">
  import type { Appointment } from '../../lib/types';
  import { data } from '../../lib/store.svelte';
  import { openSheet, replaceRoute } from '../../lib/nav.svelte';
  import { nowLocal, fmtDay, dayOf, timeOf, untilText, money, sum, periodRange, inPeriod, MONTHS_GEN } from '../../lib/utils';
  import TopBar from '../../components/TopBar.svelte';
  import Seg from '../../components/Seg.svelte';
  import Icon from '../../components/Icon.svelte';
  import Empty from '../../components/Empty.svelte';
  import AppointmentForm from './AppointmentForm.svelte';
  import AppointmentDetail from './AppointmentDetail.svelte';
  import DoctorForm from './DoctorForm.svelte';

  let { tab }: { tab: string } = $props();
  const C = '#ef4444';

  const now = nowLocal();
  // «предстоящие» — запланированные (включая сегодняшние и просроченные, которые не отметили)
  const upcoming = $derived(data.appointments.filter((a) => a.status === 'planned').sort((a, b) => (a.date < b.date ? -1 : 1)));
  const past = $derived(data.appointments.filter((a) => a.status !== 'planned').sort((a, b) => (a.date < b.date ? 1 : -1)));
  const year = periodRange('year');
  const yearCost = $derived(sum(data.appointments.filter((a) => a.status !== 'cancelled' && inPeriod(a.date, year)), (a) => a.cost ?? 0));
  const visitsYear = $derived(data.appointments.filter((a) => a.status === 'done' && inPeriod(a.date, year)).length);

  const lastVisit = (doctorId: string) =>
    data.appointments.filter((a) => a.doctorId === doctorId && a.status === 'done').sort((a, b) => (a.date < b.date ? 1 : -1))[0];

  const icon = (a: Appointment) => (a.status === 'done' ? '✅' : a.status === 'cancelled' ? '✖️' : '🩺');
</script>

<TopBar title="Врачи" back="/" />

<div class="page">
  <Seg
    value={tab}
    onchange={(v) => replaceRoute(v === 'upcoming' ? '/health' : '/health/' + v)}
    options={[
      { value: 'upcoming', label: `Предстоящие${upcoming.length ? ' · ' + upcoming.length : ''}` },
      { value: 'past', label: 'Прошедшие' },
      { value: 'doctors', label: 'Мои врачи' },
    ]}
  />

  {#if tab === 'upcoming'}
    {#if !upcoming.length}
      <div class="card"><Empty icon="🩺" title="Записей нет" text="Добавьте визит — напомню и выгружу событие в календарь телефона." /></div>
    {:else}
      <div class="vstack">
        {#each upcoming as a (a.id)}
          {@const overdue = a.date < now.slice(0, 10)}
          <button class="card tight appt" onclick={() => openSheet(AppointmentDetail, { id: a.id })}>
            <div class="date" style:--c={overdue ? 'var(--muted)' : C}>
              <span class="d">{Number(a.date.slice(8, 10))}</span>
              <span class="m">{MONTHS_GEN[Number(a.date.slice(5, 7)) - 1].slice(0, 3)}</span>
            </div>
            <div class="grow" style="text-align:left;min-width:0">
              <div class="bold ellipsis">{a.specialty}{a.doctorName ? ' — ' + a.doctorName : ''}</div>
              <div class="small muted ellipsis">{timeOf(a.date)}{a.clinic ? ' · ' + a.clinic : ''}{a.reason ? ' · ' + a.reason : ''}</div>
              <div class="small" style:color={overdue ? 'var(--orange)' : C}>
                {overdue ? 'прошло — отметьте, был(а) ли' : untilText(a.date)}
              </div>
            </div>
            <Icon name="right" size={18} />
          </button>
        {/each}
      </div>
    {/if}
    <button class="btn solid lg block" style:--c={C} onclick={() => openSheet(AppointmentForm, {})}><Icon name="plus" size={18} /> Записаться к врачу</button>
  {:else if tab === 'past'}
    <div class="grid2">
      <div class="stat"><span class="k">Визитов в этом году</span><span class="v">{visitsYear}</span></div>
      <div class="stat"><span class="k">Потрачено за год</span><span class="v">{money(yearCost)}</span></div>
    </div>
    {#if !past.length}
      <div class="card"><Empty icon="📁" title="Пока пусто" text="Здесь будут прошедшие и отменённые визиты с итогами." /></div>
    {:else}
      <div class="list">
        {#each past as a (a.id)}
          <button class="row" onclick={() => openSheet(AppointmentDetail, { id: a.id })}>
            <div class="row-icon" style:--c={a.status === 'done' ? 'var(--green)' : 'var(--muted)'}>{icon(a)}</div>
            <div class="row-main">
              <div class="row-title">{a.specialty}{a.doctorName ? ' — ' + a.doctorName : ''}</div>
              <div class="row-sub">{fmtDay(dayOf(a.date))}{a.result ? ' · ' + a.result : a.reason ? ' · ' + a.reason : ''}</div>
            </div>
            {#if a.cost}<span class="tnum small">{money(a.cost)}</span>{/if}
          </button>
        {/each}
      </div>
    {/if}
  {:else}
    {#if !data.doctors.length}
      <div class="card"><Empty icon="👩‍⚕️" title="Список врачей пуст" text="Сохраните своих врачей — потом запись в пару нажатий." /></div>
    {:else}
      <div class="list">
        {#each data.doctors as d (d.id)}
          {@const lv = lastVisit(d.id)}
          <div class="row">
            <button class="row-main" style="text-align:left" onclick={() => openSheet(DoctorForm, { id: d.id })}>
              <div class="row-title">{d.name}</div>
              <div class="row-sub">{d.specialty}{d.clinic ? ' · ' + d.clinic : ''}{lv ? ' · был(а): ' + fmtDay(dayOf(lv.date)) : ''}</div>
            </button>
            {#if d.phone}
              <a class="icon-btn filled sm" href="tel:{d.phone.replace(/\s/g, '')}" aria-label="Позвонить"><Icon name="phone" size={16} /></a>
            {/if}
            <button class="btn sm" onclick={() => openSheet(AppointmentForm, {})}>Записаться</button>
          </div>
        {/each}
      </div>
    {/if}
    <button class="btn block" onclick={() => openSheet(DoctorForm, {})}><Icon name="plus" size={18} /> Добавить врача</button>
  {/if}
</div>

<style>
  .appt {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .appt:active {
    transform: scale(0.99);
  }
  .date {
    width: 52px;
    height: 56px;
    border-radius: 14px;
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--c) 15%, transparent);
    color: var(--c);
  }
  .date .d {
    font-size: 22px;
    font-weight: 800;
    line-height: 1;
  }
  .date .m {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
  }
</style>
