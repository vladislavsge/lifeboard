<script lang="ts">
  import { data, exportJSON, importJSON, resetAll, enabledModules } from '../lib/store.svelte';
  import { go, ask, toast } from '../lib/nav.svelte';
  import { download, nowLocal, setCurrency, fmtDateTime, todayKey } from '../lib/utils';
  import { pwa, install, isIOS } from '../lib/pwa.svelte';
  import { CURRENCIES } from '../data/defaults';
  import { exportCsv } from '../modules/finance/finance';
  import TopBar from '../components/TopBar.svelte';
  import Seg from '../components/Seg.svelte';
  import Icon from '../components/Icon.svelte';

  let fileInput: HTMLInputElement | undefined = $state();

  const counts = $derived(
    data.transactions.length + data.workouts.length + data.smokes.length + data.groceryTrips.length + data.appointments.length + data.entries.length,
  );

  function backup() {
    download(`tracker-backup-${todayKey()}.json`, exportJSON());
    data.settings.lastBackupAt = nowLocal();
    toast('Файл резервной копии сохранён');
  }

  async function restore(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const text = await file.text();
    if (!(await ask('Заменить все текущие данные данными из файла?', { title: 'Восстановление', ok: 'Заменить', danger: true }))) return;
    try {
      importJSON(text);
      toast('Данные восстановлены');
    } catch (err) {
      toast('Не получилось: ' + (err instanceof Error ? err.message : 'неверный файл'));
    }
  }

  async function wipe() {
    if (!(await ask('Удалить ВСЕ данные на этом устройстве? Сначала лучше сохранить резервную копию.', { title: 'Удаление данных', ok: 'Дальше', danger: true }))) return;
    if (!(await ask('Точно? Это нельзя отменить.', { ok: 'Удалить всё', danger: true }))) return;
    await resetAll();
    toast('Все данные удалены');
    go('/');
  }

  function onCurrency(e: Event) {
    const v = (e.currentTarget as HTMLSelectElement).value;
    setCurrency(v);
    data.settings.currency = v;
  }
</script>

<TopBar title="Настройки" />

<div class="page">
  <div class="section">
    <div class="section-head"><h3>Под себя</h3></div>
    <div class="list">
      <button class="row" onclick={() => go('/settings/modules')}>
        <div class="row-icon">🧩</div>
        <div class="row-main">
          <div class="row-title">Разделы на главной</div>
          <div class="row-sub">включено {enabledModules().length} из {data.settings.modules.length}</div>
        </div>
        <Icon name="right" size={18} />
      </button>
      {#each data.trackers as t (t.id)}
        <button class="row" onclick={() => go('/settings/tracker/' + t.id)}>
          <div class="row-icon" style:--c={t.color}>{t.icon}</div>
          <div class="row-main">
            <div class="row-title">{t.name}</div>
            <div class="row-sub">{t.fields.map((f) => f.label).join(', ')}</div>
          </div>
          <Icon name="right" size={18} />
        </button>
      {/each}
      <button class="row" onclick={() => go('/settings/tracker/new')}>
        <div class="row-icon"><Icon name="plus" size={18} /></div>
        <div class="row-main"><div class="row-title" style="color:var(--accent)">Создать свой трекер</div></div>
      </button>
    </div>
  </div>

  <div class="section">
    <div class="section-head"><h3>Финансы</h3></div>
    <div class="list">
      <div class="row">
        <div class="row-icon" style:--c="var(--green)">💱</div>
        <div class="row-main"><div class="row-title">Валюта</div></div>
        <select class="input sm" style="width:150px" value={data.settings.currency} onchange={onCurrency}>
          {#each CURRENCIES as c (c.code)}<option value={c.code}>{c.name}</option>{/each}
        </select>
      </div>
      <button class="row" onclick={() => go('/finance/accounts')}>
        <div class="row-icon" style:--c="var(--green)">💳</div>
        <div class="row-main">
          <div class="row-title">Карты и счета</div>
          <div class="row-sub">{data.accounts.filter((a) => !a.archived).length} шт.</div>
        </div>
        <Icon name="right" size={18} />
      </button>
      <button class="row" onclick={() => go('/finance/categories')}>
        <div class="row-icon" style:--c="var(--green)">🗂️</div>
        <div class="row-main"><div class="row-title">Категории расходов и доходов</div></div>
        <Icon name="right" size={18} />
      </button>
      <button class="row" onclick={() => go('/finance/budgets')}>
        <div class="row-icon" style:--c="var(--green)">🎯</div>
        <div class="row-main"><div class="row-title">Бюджеты на месяц</div><div class="row-sub">{data.budgets.length || 'не заданы'}</div></div>
        <Icon name="right" size={18} />
      </button>
      <button class="row" onclick={() => go('/finance/recurring')}>
        <div class="row-icon" style:--c="var(--green)">🔁</div>
        <div class="row-main"><div class="row-title">Регулярные платежи и подписки</div><div class="row-sub">{data.recurring.length || 'нет'}</div></div>
        <Icon name="right" size={18} />
      </button>
    </div>
  </div>

  <div class="section">
    <div class="section-head"><h3>Тренировки</h3></div>
    <div class="list">
      <div class="row">
        <div class="row-icon" style:--c="#f97316">⏱️</div>
        <div class="row-main">
          <div class="row-title">Отдых между подходами</div>
          <div class="row-sub">таймер после отметки подхода</div>
        </div>
        <select class="input sm" style="width:110px" bind:value={data.settings.restSec}>
          <option value={0}>Выкл.</option>
          <option value={45}>45 сек</option>
          <option value={60}>1 мин</option>
          <option value={90}>1,5 мин</option>
          <option value={120}>2 мин</option>
          <option value={180}>3 мин</option>
        </select>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-head"><h3>Оформление</h3></div>
    <Seg
      bind:value={data.settings.theme}
      options={[
        { value: 'auto', label: 'Как в системе' },
        { value: 'light', label: 'Светлая' },
        { value: 'dark', label: 'Тёмная' },
      ]}
    />
  </div>

  {#if !pwa.installed}
    <div class="section">
      <div class="section-head"><h3>На телефон</h3></div>
      <div class="card vstack">
        {#if pwa.prompt}
          <p class="small">Установите трекер как приложение — откроется с иконки, без браузерной строки, работает офлайн.</p>
          <button class="btn primary" onclick={install}><Icon name="download" size={18} /> Установить приложение</button>
        {:else if isIOS()}
          <p class="small">В Safari нажмите <b>«Поделиться»</b> <span style="font-size:16px">⎋</span> → <b>«На экран «Домой»</b>. Трекер откроется как приложение и будет работать офлайн.</p>
        {:else}
          <p class="small">В меню браузера выберите <b>«Установить приложение»</b> или <b>«Добавить на главный экран»</b>.</p>
        {/if}
      </div>
    </div>
  {/if}

  <div class="section">
    <div class="section-head"><h3>Данные</h3></div>
    <div class="list">
      <button class="row" onclick={backup}>
        <div class="row-icon" style:--c="var(--blue)"><Icon name="download" size={18} /></div>
        <div class="row-main">
          <div class="row-title">Сохранить резервную копию</div>
          <div class="row-sub">{data.settings.lastBackupAt ? 'последняя: ' + fmtDateTime(data.settings.lastBackupAt) : 'ещё ни разу'} · {counts} записей</div>
        </div>
      </button>
      <button class="row" onclick={() => exportCsv(data.transactions, `operacii-vse-${todayKey()}.csv`)} disabled={!data.transactions.length}>
        <div class="row-icon" style:--c="var(--green)">📊</div>
        <div class="row-main">
          <div class="row-title">Операции в Excel (CSV)</div>
          <div class="row-sub">все доходы и расходы · {data.transactions.length} шт.</div>
        </div>
      </button>
      <button class="row" onclick={() => fileInput?.click()}>
        <div class="row-icon" style:--c="var(--blue)"><Icon name="upload" size={18} /></div>
        <div class="row-main">
          <div class="row-title">Восстановить из файла</div>
          <div class="row-sub">или перенести на другое устройство</div>
        </div>
      </button>
      <button class="row" onclick={wipe}>
        <div class="row-icon" style:--c="var(--red)"><Icon name="trash" size={18} /></div>
        <div class="row-main"><div class="row-title danger-text">Удалить все данные</div></div>
      </button>
    </div>
    <input bind:this={fileInput} type="file" accept="application/json,.json" style="display:none" onchange={restore} />
    <p class="hint">
      Все записи хранятся только в этом браузере на этом устройстве — никуда не отправляются. Периодически сохраняйте копию (например, в iCloud
      / Google Drive), чтобы не потерять данные при очистке браузера.
    </p>
  </div>

  <p class="center tiny faint">Мой трекер · версия 0.1</p>
</div>
