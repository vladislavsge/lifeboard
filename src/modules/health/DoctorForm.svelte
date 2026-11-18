<script lang="ts">
  import type { Doctor } from '../../lib/types';
  import { add, find, remove } from '../../lib/store.svelte';
  import { ask, toast } from '../../lib/nav.svelte';
  import { uid } from '../../lib/utils';
  import { SPECIALTIES } from '../../data/defaults';
  import SheetFrame from '../../components/SheetFrame.svelte';
  import Icon from '../../components/Icon.svelte';

  let { id, onsaved, close }: { id?: string; onsaved?: (id: string) => void; close: () => void } = $props();
  const existing = id ? find('doctors', id) : undefined;

  let name = $state(existing?.name ?? '');
  let specialty = $state(existing?.specialty ?? SPECIALTIES[0]);
  let clinic = $state(existing?.clinic ?? '');
  let phone = $state(existing?.phone ?? '');
  let address = $state(existing?.address ?? '');
  let note = $state(existing?.note ?? '');

  function save() {
    if (!name.trim()) return;
    const f = {
      name: name.trim(),
      specialty: specialty.trim() || 'Другое',
      clinic: clinic.trim() || undefined,
      phone: phone.trim() || undefined,
      address: address.trim() || undefined,
      note: note.trim() || undefined,
    };
    let savedId = existing?.id;
    if (existing) Object.assign(existing, f);
    else savedId = add('doctors', { id: uid(), ...f } as Doctor).id;
    toast('Врач сохранён');
    onsaved?.(savedId!);
    close();
  }

  async function del() {
    if (existing && (await ask(`Удалить «${existing.name}» из списка врачей? Записи останутся.`, { ok: 'Удалить', danger: true }))) {
      remove('doctors', existing.id);
      close();
    }
  }
</script>

<SheetFrame title={existing ? 'Врач' : 'Новый врач'} {close}>
  <label class="field">
    <span class="label">Имя</span>
    <input class="input" bind:value={name} placeholder="Др. Иванова Анна" />
  </label>
  <label class="field">
    <span class="label">Специальность</span>
    <input class="input" bind:value={specialty} list="specs" />
    <datalist id="specs">{#each SPECIALTIES as s (s)}<option value={s}></option>{/each}</datalist>
  </label>
  <label class="field">
    <span class="label">Клиника</span>
    <input class="input" bind:value={clinic} placeholder="Название клиники" />
  </label>
  <div class="grid2">
    <label class="field">
      <span class="label">Телефон</span>
      <input class="input" type="tel" bind:value={phone} placeholder="+371…" />
    </label>
    <label class="field">
      <span class="label">Адрес</span>
      <input class="input" bind:value={address} placeholder="Улица, дом" />
    </label>
  </div>
  <label class="field">
    <span class="label">Заметка</span>
    <input class="input" bind:value={note} placeholder="Кабинет, как записаться…" />
  </label>

  {#snippet footer()}
    {#if existing}
      <button class="btn danger icon-only" aria-label="Удалить" onclick={del}><Icon name="trash" size={20} /></button>
    {/if}
    <button class="btn primary" disabled={!name.trim()} onclick={save}>Сохранить</button>
  {/snippet}
</SheetFrame>
