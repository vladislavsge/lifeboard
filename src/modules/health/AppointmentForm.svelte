<script lang="ts">
  import type { Appointment } from '../../lib/types';
  import { data, add, find, remove, defaultAccountId, systemCategoryId, syncLinkedTx } from '../../lib/store.svelte';
  import { ask, toast } from '../../lib/nav.svelte';
  import { uid, nowLocal, todayKey, money } from '../../lib/utils';
  import { SPECIALTIES } from '../../data/defaults';
  import SheetFrame from '../../components/SheetFrame.svelte';
  import Seg from '../../components/Seg.svelte';
  import MoneyInput from '../../components/MoneyInput.svelte';
  import AccountPicker from '../../components/AccountPicker.svelte';
  import DateTime from '../../components/DateTime.svelte';
  import Icon from '../../components/Icon.svelte';

  let {
    id,
    date: d0,
    status: s0,
    close,
  }: { id?: string; date?: string; status?: Appointment['status']; close: () => void } = $props();
  const existing = id ? find('appointments', id) : undefined;

  let doctorId = $state(existing?.doctorId ?? '');
  let specialty = $state(existing?.specialty ?? '');
  let doctorName = $state(existing?.doctorName ?? '');
  let clinic = $state(existing?.clinic ?? '');
  let address = $state(existing?.address ?? '');
  let phone = $state(existing?.phone ?? '');
  let date = $state(existing?.date ?? (d0 ? (d0.length === 10 ? d0 + 'T10:00' : d0) : todayKey() + 'T10:00'));
  let reason = $state(existing?.reason ?? '');
  let status = $state<Appointment['status']>(s0 ?? existing?.status ?? 'planned');
  let result = $state(existing?.result ?? '');
  let cost = $state<number | undefined>(existing?.cost);
  let accountId = $state(existing?.accountId ?? defaultAccountId());
  let saveDoctor = $state(true);

  function pickDoctor(docId: string) {
    const d = find('doctors', docId);
    if (!d) return;
    if (doctorId === docId) {
      doctorId = '';
      return;
    }
    doctorId = d.id;
    specialty = d.specialty;
    doctorName = d.name;
    clinic = d.clinic ?? '';
    address = d.address ?? '';
    phone = d.phone ?? '';
  }

  const valid = $derived(!!(specialty.trim() || doctorName.trim()) && !!date);

  function save() {
    if (!valid) return;
    let docId = doctorId || undefined;
    if (!docId && saveDoctor && doctorName.trim()) {
      docId = add('doctors', {
        id: uid(),
        name: doctorName.trim(),
        specialty: specialty.trim() || 'Другое',
        clinic: clinic.trim() || undefined,
        address: address.trim() || undefined,
        phone: phone.trim() || undefined,
      }).id;
    }
    const a: Appointment = existing ?? ({ id: uid() } as Appointment);
    Object.assign(a, {
      doctorId: docId,
      specialty: specialty.trim() || 'Врач',
      doctorName: doctorName.trim() || undefined,
      clinic: clinic.trim() || undefined,
      address: address.trim() || undefined,
      phone: phone.trim() || undefined,
      date,
      reason: reason.trim() || undefined,
      status,
      result: result.trim() || undefined,
      cost,
      accountId,
    });
    a.txId = syncLinkedTx(a.txId, {
      amount: status === 'cancelled' ? 0 : cost,
      categoryId: systemCategoryId('health'),
      accountId,
      date,
      note: `${a.specialty}${a.doctorName ? ' — ' + a.doctorName : ''}`,
      module: 'health',
      refId: a.id,
    });
    if (!existing) add('appointments', a);
    toast(cost && status !== 'cancelled' ? `Сохранено · ${money(cost)} в расходах` : 'Запись сохранена');
    close();
  }

  async function del() {
    if (!existing) return;
    if (await ask('Удалить запись к врачу?', { ok: 'Удалить', danger: true })) {
      if (existing.txId) remove('transactions', existing.txId);
      remove('appointments', existing.id);
      close();
    }
  }
</script>

<SheetFrame title={existing ? 'Запись к врачу' : 'Новая запись к врачу'} {close}>
  {#if data.doctors.length}
    <div class="field">
      <span class="label">Мои врачи</span>
      <div class="chips">
        {#each data.doctors as d (d.id)}
          <button class="chip" class:on={doctorId === d.id} onclick={() => pickDoctor(d.id)}>{d.name} <span class="muted small">{d.specialty}</span></button>
        {/each}
      </div>
    </div>
  {/if}

  <div class="grid2">
    <label class="field">
      <span class="label">Специальность</span>
      <input class="input" bind:value={specialty} list="spec-list" placeholder="Стоматолог" />
      <datalist id="spec-list">{#each SPECIALTIES as s (s)}<option value={s}></option>{/each}</datalist>
    </label>
    <label class="field">
      <span class="label">Врач</span>
      <input class="input" bind:value={doctorName} placeholder="Имя (необяз.)" oninput={() => (doctorId = '')} />
    </label>
  </div>

  <div class="field">
    <span class="label">Когда</span>
    <DateTime bind:value={date} />
  </div>

  <label class="field">
    <span class="label">Причина / что сделать</span>
    <input class="input" bind:value={reason} placeholder="Плановый осмотр, анализы, справка…" />
  </label>

  <div class="grid2">
    <label class="field">
      <span class="label">Клиника</span>
      <input class="input" bind:value={clinic} placeholder="Необязательно" />
    </label>
    <label class="field">
      <span class="label">Телефон</span>
      <input class="input" type="tel" bind:value={phone} placeholder="+371…" />
    </label>
  </div>
  <label class="field">
    <span class="label">Адрес</span>
    <input class="input" bind:value={address} placeholder="Улица, дом, кабинет" />
  </label>

  {#if !doctorId && doctorName.trim()}
    <label class="check">
      <input type="checkbox" bind:checked={saveDoctor} />
      <span>Сохранить врача в «Мои врачи»</span>
    </label>
  {/if}

  {#if existing || date < nowLocal()}
    <div class="field">
      <span class="label">Статус</span>
      <Seg
        bind:value={status}
        options={[
          { value: 'planned', label: 'Запланировано' },
          { value: 'done', label: 'Был(а)' },
          { value: 'cancelled', label: 'Отменено' },
        ]}
      />
    </div>
  {/if}

  {#if status === 'done'}
    <label class="field">
      <span class="label">Итог визита</span>
      <textarea class="input" bind:value={result} placeholder="Диагноз, назначения, когда прийти снова…"></textarea>
    </label>
  {/if}

  <div class="field">
    <span class="label">Стоимость (попадёт в расходы → «Здоровье»)</span>
    <MoneyInput bind:value={cost} placeholder="Бесплатно" />
  </div>
  {#if cost}
    <div class="field">
      <span class="label">Чем платил</span>
      <AccountPicker bind:value={accountId} />
    </div>
  {/if}

  {#snippet footer()}
    {#if existing}
      <button class="btn danger icon-only" aria-label="Удалить" onclick={del}><Icon name="trash" size={20} /></button>
    {/if}
    <button class="btn primary" disabled={!valid} onclick={save}>Сохранить</button>
  {/snippet}
</SheetFrame>
