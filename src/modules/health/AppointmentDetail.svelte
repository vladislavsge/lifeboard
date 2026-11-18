<script lang="ts">
  import { find, syncLinkedTx, systemCategoryId } from '../../lib/store.svelte';
  import { replaceSheet, toast } from '../../lib/nav.svelte';
  import { fmtDay, dayOf, timeOf, untilText, money, nowLocal } from '../../lib/utils';
  import { downloadIcs } from '../../lib/ics';
  import SheetFrame from '../../components/SheetFrame.svelte';
  import Icon from '../../components/Icon.svelte';
  import AppointmentForm from './AppointmentForm.svelte';

  let { id, close }: { id: string; close: () => void } = $props();
  const a = $derived(find('appointments', id));

  const STATUS = { planned: 'Запланировано', done: 'Состоялся', cancelled: 'Отменено' };

  function toCalendar() {
    if (!a) return;
    downloadIcs(`vrach-${dayOf(a.date)}.ics`, [
      {
        uid: a.id,
        start: a.date,
        minutes: 60,
        title: `🩺 ${a.specialty}${a.doctorName ? ' — ' + a.doctorName : ''}`,
        location: [a.clinic, a.address].filter(Boolean).join(', '),
        description: [a.reason, a.phone ? 'Тел.: ' + a.phone : ''].filter(Boolean).join('\n'),
        alarms: [24 * 60, 120],
      },
    ]);
    toast('Файл события создан — откройте его, чтобы добавить в календарь');
  }

  function cancel() {
    if (!a) return;
    a.status = 'cancelled';
    a.txId = syncLinkedTx(a.txId, { amount: 0, categoryId: systemCategoryId('health'), accountId: a.accountId ?? 'cash', date: a.date, module: 'health' });
    toast('Запись отменена');
    close();
  }
</script>

{#if a}
  <SheetFrame title={a.specialty} {close}>
    <div class="vstack gap4">
      {#if a.doctorName}<div class="bold" style="font-size:17px">{a.doctorName}</div>{/if}
      <div class="hstack wrap">
        <span class="badge c" style:--c={a.status === 'planned' ? 'var(--blue)' : a.status === 'done' ? 'var(--green)' : 'var(--muted)'}>{STATUS[a.status]}</span>
        {#if a.status === 'planned'}<span class="badge">{untilText(a.date)}</span>{/if}
      </div>
    </div>

    <div class="list plain" style="background:var(--card-2)">
      <div class="row">
        <div class="row-icon" style:--c="var(--red)"><Icon name="calendar" size={18} /></div>
        <div class="row-main">
          <div class="row-title">{fmtDay(dayOf(a.date))}, {timeOf(a.date)}</div>
        </div>
      </div>
      {#if a.clinic || a.address}
        <div class="row">
          <div class="row-icon" style:--c="var(--red)"><Icon name="pin" size={18} /></div>
          <div class="row-main">
            <div class="row-title">{a.clinic ?? a.address}</div>
            {#if a.clinic && a.address}<div class="row-sub">{a.address}</div>{/if}
          </div>
          {#if a.address}
            <a class="btn sm" href="https://maps.google.com/?q={encodeURIComponent(a.address)}" target="_blank" rel="noopener">Маршрут</a>
          {/if}
        </div>
      {/if}
      {#if a.phone}
        <div class="row">
          <div class="row-icon" style:--c="var(--red)"><Icon name="phone" size={18} /></div>
          <div class="row-main"><div class="row-title">{a.phone}</div></div>
          <a class="btn sm" href="tel:{a.phone.replace(/\s/g, '')}">Позвонить</a>
        </div>
      {/if}
      {#if a.cost}
        <div class="row">
          <div class="row-icon" style:--c="var(--red)">💶</div>
          <div class="row-main"><div class="row-title">{money(a.cost)}</div><div class="row-sub">{a.txId ? 'в расходах' : 'не учтено в расходах'}</div></div>
        </div>
      {/if}
    </div>

    {#if a.reason}
      <div class="field"><span class="label">Причина</span><p>{a.reason}</p></div>
    {/if}
    {#if a.result}
      <div class="field"><span class="label">Итог визита</span><p style="white-space:pre-line">{a.result}</p></div>
    {/if}

    {#if a.status === 'planned'}
      <div class="grid2">
        <button class="btn" onclick={toCalendar}><Icon name="bell" size={18} /> В календарь</button>
        <button class="btn" onclick={cancel}>Отменить</button>
      </div>
      {#if a.date <= nowLocal().slice(0, 10) + 'T23:59'}
        <button class="btn solid block" style:--c="var(--green)" onclick={() => replaceSheet(AppointmentForm, { id: a!.id, status: 'done' })}>
          <Icon name="check" size={18} /> Отметить, что был(а)
        </button>
      {/if}
    {/if}

    {#snippet footer()}
      <button class="btn" onclick={() => replaceSheet(AppointmentForm, { id: a!.id })}><Icon name="edit" size={18} /> Изменить</button>
      <button class="btn primary" onclick={close}>Готово</button>
    {/snippet}
  </SheetFrame>
{/if}
