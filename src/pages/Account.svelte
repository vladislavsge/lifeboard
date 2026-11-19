<script lang="ts">
  import TopBar from '../components/TopBar.svelte';
  import Icon from '../components/Icon.svelte';
  import { go, ask, toast } from '../lib/nav.svelte';
  import { ApiError, gql } from '../lib/api';
  import { auth, addPasskey, logout, refresh } from '../lib/auth.svelte';
  import { passkeysSupported } from '../lib/webauthn';
  import { chooseFirstSync, forgetSyncState, resolveConflict, sync, syncNow } from '../lib/sync.svelte';
  import { disablePush, enablePush, push, refreshPush, sendTest, uploadPlan } from '../lib/push.svelte';
  import { isIOS } from '../lib/pwa.svelte';
  import { data } from '../lib/store.svelte';

  interface SessionInfo {
    id: string;
    deviceLabel: string | null;
    ip: string | null;
    createdAt: string;
    lastSeenAt: string;
    current: boolean;
  }
  interface PasskeyInfo {
    id: string;
    label: string | null;
    deviceType: string | null;
    createdAt: string;
    lastUsedAt: string | null;
  }

  let sessions = $state<SessionInfo[]>([]);
  let passkeys = $state<PasskeyInfo[]>([]);
  let usage = $state<{ bytes: number; collections: number } | null>(null);
  let busy = $state('');
  let error = $state('');

  // смена пароля
  let showPassword = $state(false);
  let currentPassword = $state('');
  let newPassword = $state('');

  // подключение 2FA
  let enroll = $state<{ secret: string; otpauthUrl: string } | null>(null);
  let enrollCode = $state('');
  let recoveryCodes = $state<string[]>([]);
  let totpPassword = $state('');
  let showDisableTotp = $state(false);

  let inviteCode = $state('');

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const kb = (bytes: number) => (bytes < 1024 ? bytes + ' Б' : Math.round(bytes / 1024) + ' КБ');

  const statusText = $derived(
    !sync.on
      ? 'выключена'
      : sync.status === 'syncing'
        ? 'обмен данными…'
        : sync.status === 'offline'
          ? 'нет связи, продолжу позже'
          : sync.conflicts.length
            ? 'нужно решить, чьи данные оставить'
            : sync.status === 'error'
              ? sync.error || 'ошибка'
              : sync.lastSyncAt
                ? 'последний обмен: ' + sync.lastSyncAt.replace('T', ' ')
                : 'готово',
  );

  async function run(key: string, fn: () => Promise<void>) {
    if (busy) return;
    busy = key;
    error = '';
    try {
      await fn();
    } catch (e) {
      error = e instanceof ApiError || e instanceof Error ? e.message : 'Не получилось';
    } finally {
      busy = '';
    }
  }

  async function load() {
    const d = await gql<{ sessions: SessionInfo[]; passkeys: PasskeyInfo[]; syncUsage: typeof usage }>(
      '{ sessions { id deviceLabel ip createdAt lastSeenAt current } passkeys { id label deviceType createdAt lastUsedAt } syncUsage { bytes collections } }',
    );
    sessions = d.sessions;
    passkeys = d.passkeys;
    usage = d.syncUsage;
  }

  $effect(() => {
    if (auth.state === 'in') {
      void run('load', load);
      void refreshPush();
    }
  });

  const notify = $derived(data.settings.notify);

  type NotifyKey = 'goals' | 'recurring' | 'budgets' | 'events';
  const NOTIFY_ROWS: { key: NotifyKey; title: string; sub: string }[] = [
    { key: 'goals', title: 'Цели и лимиты за день', sub: 'вечером, если цель не закрыта или лимит превышен' },
    { key: 'recurring', title: 'Регулярные платежи', sub: 'утром в день списания' },
    { key: 'budgets', title: 'Бюджеты', sub: 'когда потрачено 80% и больше' },
    { key: 'events', title: 'Тренировки и визиты', sub: 'за час до тренировки, накануне приёма' },
  ];

  function setNotify(key: NotifyKey, value: boolean) {
    if (!notify) return;
    notify[key] = value;
    void uploadPlan(true);
  }

  function setGoalAt(value: string) {
    if (!notify || !value) return;
    notify.goalAt = value;
    void uploadPlan(true);
  }

  const togglePush = () =>
    run('push', async () => {
      if (push.subscribed) await disablePush();
      else await enablePush();
    });

  const testPush = () =>
    run('test', async () => {
      const n = await sendTest();
      toast(n ? `Отправлено на устройств: ${n}` : 'Нет подписанных устройств');
    });

  const revoke = (id: string) =>
    run('revoke', async () => {
      await gql('mutation($id:ID!){ revokeSession(id:$id) }', { id });
      await load();
      toast('Вход закрыт');
    });

  const logoutEverywhere = () =>
    run('logoutAll', async () => {
      if (!(await ask('Закрыть входы на всех других устройствах?', { title: 'Выход везде', ok: 'Закрыть' }))) return;
      const d = await gql<{ logoutEverywhere: number }>('mutation{ logoutEverywhere }');
      await load();
      toast(`Закрыто входов: ${d.logoutEverywhere}`);
    });

  const changePassword = () =>
    run('password', async () => {
      await gql('mutation($c:String!,$n:String!){ changePassword(currentPassword:$c,newPassword:$n) }', {
        c: currentPassword,
        n: newPassword,
      });
      currentPassword = newPassword = '';
      showPassword = false;
      await load();
      toast('Пароль изменён, другие входы закрыты');
    });

  const startEnroll = () =>
    run('enroll', async () => {
      const d = await gql<{ startTotpEnroll: { secret: string; otpauthUrl: string } }>(
        'mutation{ startTotpEnroll{ secret otpauthUrl } }',
      );
      enroll = d.startTotpEnroll;
      enrollCode = '';
    });

  const confirmEnroll = () =>
    run('confirm', async () => {
      const d = await gql<{ confirmTotpEnroll: string[] }>('mutation($c:String!){ confirmTotpEnroll(code:$c) }', {
        c: enrollCode,
      });
      recoveryCodes = d.confirmTotpEnroll;
      enroll = null;
      await refresh();
      toast('Двухфакторная проверка включена');
    });

  const disableTotp = () =>
    run('disable', async () => {
      await gql('mutation($p:String!){ disableTotp(password:$p) }', { p: totpPassword });
      totpPassword = '';
      showDisableTotp = false;
      recoveryCodes = [];
      await refresh();
      toast('Двухфакторная проверка отключена');
    });

  const newPasskey = () =>
    run('passkey', async () => {
      await addPasskey(navigator.platform || 'Это устройство');
      await load();
      toast('Ключ добавлен');
    });

  const deletePasskey = (id: string) =>
    run('passkey', async () => {
      if (!(await ask('Удалить этот ключ?', { title: 'Ключ устройства', ok: 'Удалить', danger: true }))) return;
      await gql('mutation($id:ID!){ deletePasskey(id:$id) }', { id });
      await load();
      await refresh();
    });

  const makeInvite = () =>
    run('invite', async () => {
      const d = await gql<{ createInvite: string }>('mutation{ createInvite(maxUses:1, days:7) }');
      inviteCode = d.createInvite;
    });

  const signOut = () =>
    run('logout', async () => {
      if (!(await ask('Выйти из аккаунта на этом устройстве? Записи останутся здесь.', { title: 'Выход', ok: 'Выйти' })))
        return;
      await logout();
      await forgetSyncState();
      go('/settings');
      toast('Вы вышли из аккаунта');
    });

  async function copy(text: string) {
    try {
      if (window.isSecureContext && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        toast('Скопировано');
        return;
      }
    } catch {
      /* попробуем запасной способ */
    }
    // по http буфер обмена браузеру недоступен — старый приём с временным полем
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(area);
      toast(ok ? 'Скопировано' : 'Выделите и скопируйте вручную');
    } catch {
      toast('Выделите и скопируйте вручную');
    }
  }
</script>

<TopBar title="Аккаунт" sub={auth.me?.email} back="/settings" />

<div class="page">
  {#if auth.state !== 'in'}
    <div class="card vstack">
      <p class="small">Вы не вошли в аккаунт. Записи хранятся только на этом устройстве.</p>
      <button class="btn primary" onclick={() => go('/auth')}>Войти или создать аккаунт</button>
    </div>
  {:else}
    <!-- ───── Синхронизация ───── -->
    <div class="section">
      <div class="section-head"><h3>Синхронизация</h3></div>

      {#if sync.firstSync}
        <div class="card vstack">
          <div class="row-title">Чьи данные оставить?</div>
          <p class="small">
            В аккаунте уже есть записи ({sync.firstSync.serverItems}), и на этом устройстве тоже
            ({sync.firstSync.localItems}). Склеивать их автоматически нельзя — выберите, что считать главным.
          </p>
          <button class="btn primary" onclick={() => void chooseFirstSync('server')}>
            Взять данные из аккаунта
          </button>
          <button class="btn" onclick={() => void chooseFirstSync('mine')}>
            Отправить данные этого устройства
          </button>
          <p class="tiny faint">Прежняя версия на сервере сохранится в журнале — её можно вернуть.</p>
        </div>
      {/if}

      {#each sync.conflicts as c (c.name)}
        <div class="card vstack">
          <div class="row-title">Расхождение: {c.name}</div>
          <p class="small">
            На сервере {c.serverItems} записей (изменено {fmt(c.serverUpdatedAt)}), здесь — {c.localItems}.
            Данные менялись на двух устройствах без связи.
          </p>
          <button class="btn" onclick={() => void resolveConflict(c.name, 'server')}>Оставить серверные</button>
          <button class="btn" onclick={() => void resolveConflict(c.name, 'mine')}>Оставить мои</button>
        </div>
      {/each}

      <div class="list">
        <button class="row" onclick={() => void syncNow()}>
          <div class="row-icon" style:--c="var(--blue)"><Icon name="repeat" size={18} /></div>
          <div class="row-main">
            <div class="row-title">Синхронизировать сейчас</div>
            <div class="row-sub">{statusText}</div>
          </div>
        </button>
      </div>
      {#if usage}
        <p class="hint">В аккаунте: {usage.collections} коллекций, {kb(usage.bytes)}.</p>
      {/if}
    </div>

    <!-- ───── Уведомления ───── -->
    <div class="section">
      <div class="section-head"><h3>Уведомления</h3></div>

      {#if !push.supported}
        <div class="card vstack">
          <p class="small">
            {#if isIOS()}
              На iPhone уведомления работают только для приложения, добавленного на экран «Домой»:
              Safari → «Поделиться» → «На экран „Домой“». И только по https.
            {:else}
              Уведомления требуют https и установленного service worker — на собранной версии
              приложения они появятся.
            {/if}
          </p>
        </div>
      {:else if !push.serverReady}
        <div class="card vstack">
          <p class="small">
            На сервере не заданы ключи уведомлений. Получите их командой <b>npm run cli -- vapid</b>,
            впишите в <b>.env</b> и перезапустите сервер.
          </p>
        </div>
      {:else}
        <div class="list">
          <div class="row">
            <div class="row-icon" style:--c={push.subscribed ? 'var(--green)' : 'var(--muted)'}>
              <Icon name="bell" size={18} />
            </div>
            <div class="row-main">
              <div class="row-title">{push.subscribed ? 'Включены на этом устройстве' : 'Выключены'}</div>
              <div class="row-sub">
                {#if push.subscribed}
                  устройств: {push.devices} · запланировано: {push.planned}{push.nextAt
                    ? ' · ближайшее ' + fmt(push.nextAt)
                    : ''}
                {:else}
                  напомним про цели, платежи, бюджеты и тренировки
                {/if}
              </div>
            </div>
            <label class="switch" aria-label="Уведомления">
              <input type="checkbox" checked={push.subscribed} disabled={push.busy} onchange={togglePush} />
              <span></span>
            </label>
          </div>
        </div>

        {#if push.subscribed && notify}
          <div class="list mt8">
            {#each NOTIFY_ROWS as row (row.key)}
              <div class="row">
                <div class="row-main">
                  <div class="row-title">{row.title}</div>
                  <div class="row-sub">{row.sub}</div>
                </div>
                <label class="switch" aria-label={row.title}>
                  <input
                    type="checkbox"
                    checked={notify[row.key]}
                    onchange={(e) => setNotify(row.key, e.currentTarget.checked)}
                  />
                  <span></span>
                </label>
              </div>
            {/each}
            <div class="row">
              <div class="row-main">
                <div class="row-title">Время вечернего напоминания</div>
                <div class="row-sub">для незакрытых целей и лимитов</div>
              </div>
              <input
                class="input sm"
                type="time"
                style="width:112px;flex:none"
                value={notify.goalAt}
                onchange={(e) => setGoalAt(e.currentTarget.value)}
              />
            </div>
          </div>
          <button class="btn mt8" disabled={!!busy} onclick={testPush}>Прислать проверочное</button>
          <p class="hint">
            Настройки типов общие для всех ваших устройств, а подписку нужно включить на каждом отдельно.
          </p>
        {/if}

        {#if push.permission === 'denied'}
          <p class="hint">
            Уведомления запрещены для этого сайта в настройках браузера — сначала разрешите их там.
          </p>
        {/if}
      {/if}

      {#if push.error}<p class="hint danger-text">{push.error}</p>{/if}
    </div>

    <!-- ───── Устройства ───── -->
    <div class="section">
      <div class="section-head"><h3>Устройства</h3></div>
      <div class="list">
        {#each sessions as s (s.id)}
          <div class="row">
            <div class="row-icon" style:--c={s.current ? 'var(--green)' : 'var(--muted)'}>
              <Icon name="phone" size={18} />
            </div>
            <div class="row-main">
              <div class="row-title">{s.deviceLabel ?? 'Устройство'}{s.current ? ' · это устройство' : ''}</div>
              <div class="row-sub">{s.ip ?? ''} · активность {fmt(s.lastSeenAt)}</div>
            </div>
            {#if !s.current}
              <button class="icon-btn" aria-label="Закрыть вход" onclick={() => revoke(s.id)}>
                <Icon name="x" size={20} />
              </button>
            {/if}
          </div>
        {/each}
      </div>
      {#if sessions.length > 1}
        <button class="btn mt8" onclick={logoutEverywhere}>Выйти на всех других устройствах</button>
      {/if}
    </div>

    <!-- ───── Двухфакторная проверка ───── -->
    <div class="section">
      <div class="section-head"><h3>Двухфакторная проверка</h3></div>

      {#if recoveryCodes.length}
        <div class="card vstack">
          <div class="row-title">Коды восстановления</div>
          <p class="small">Сохраните их сейчас — больше они не покажутся. Каждый код срабатывает один раз.</p>
          <pre class="tnum small">{recoveryCodes.join('\n')}</pre>
          <button class="btn" onclick={() => copy(recoveryCodes.join('\n'))}>
            <Icon name="copy" size={18} /> Скопировать
          </button>
          <button class="btn primary" onclick={() => (recoveryCodes = [])}>Я сохранил</button>
        </div>
      {:else if enroll}
        <div class="card vstack">
          <p class="small">
            Откройте ссылку на телефоне — аутентификатор подхватит аккаунт сам. Или введите ключ вручную.
          </p>
          <a class="btn" href={enroll.otpauthUrl}>Открыть в приложении-аутентификаторе</a>
          <button class="btn" onclick={() => copy(enroll?.secret ?? '')}>
            <Icon name="copy" size={18} /> Ключ: {enroll.secret}
          </button>
          <div class="field">
            <span class="label">Код из приложения</span>
            <input class="input big" bind:value={enrollCode} inputmode="numeric" placeholder="000000" />
          </div>
          <button class="btn primary" disabled={!enrollCode || !!busy} onclick={confirmEnroll}>Включить</button>
          <button class="link-btn" onclick={() => (enroll = null)}>Отмена</button>
        </div>
      {:else if auth.me?.totpEnabled}
        <div class="list">
          <div class="row">
            <div class="row-icon" style:--c="var(--green)"><Icon name="check" size={18} /></div>
            <div class="row-main">
              <div class="row-title">Включена</div>
              <div class="row-sub">при входе спрашивается код из приложения</div>
            </div>
          </div>
        </div>
        {#if showDisableTotp}
          <div class="card vstack mt8">
            <div class="field">
              <span class="label">Пароль для подтверждения</span>
              <input class="input" type="password" bind:value={totpPassword} autocomplete="current-password" />
            </div>
            <button class="btn danger" disabled={!totpPassword || !!busy} onclick={disableTotp}>Отключить</button>
            <button class="link-btn" onclick={() => (showDisableTotp = false)}>Отмена</button>
          </div>
        {:else}
          <button class="link-btn mt8" onclick={() => (showDisableTotp = true)}>Отключить</button>
        {/if}
      {:else}
        <div class="card vstack">
          <p class="small">
            Второй фактор защищает аккаунт, даже если пароль утёк: при входе понадобится код из приложения
            на телефоне.
          </p>
          <button class="btn primary" disabled={!!busy} onclick={startEnroll}>Включить</button>
        </div>
      {/if}
    </div>

    <!-- ───── Ключи устройств ───── -->
    {#if passkeysSupported()}
      <div class="section">
        <div class="section-head"><h3>Вход по Face ID и отпечатку</h3></div>
        <div class="list">
          {#each passkeys as p (p.id)}
            <div class="row">
              <div class="row-icon" style:--c="var(--blue)"><Icon name="check" size={18} /></div>
              <div class="row-main">
                <div class="row-title">{p.label || 'Ключ устройства'}</div>
                <div class="row-sub">
                  добавлен {fmt(p.createdAt)}{p.lastUsedAt ? ' · вход ' + fmt(p.lastUsedAt) : ''}
                </div>
              </div>
              <button class="icon-btn" aria-label="Удалить ключ" onclick={() => deletePasskey(p.id)}>
                <Icon name="trash" size={20} />
              </button>
            </div>
          {/each}
        </div>
        <button class="btn mt8" disabled={!!busy} onclick={newPasskey}>Добавить ключ этого устройства</button>
      </div>
    {/if}

    <!-- ───── Аккаунт ───── -->
    <div class="section">
      <div class="section-head"><h3>Аккаунт</h3></div>
      {#if auth.me && !auth.me.emailVerified && auth.mailEnabled}
        <p class="hint">Почта не подтверждена — без этого не получится восстановить пароль.</p>
      {/if}
      {#if showPassword}
        <div class="card vstack">
          <div class="field">
            <span class="label">Текущий пароль</span>
            <input class="input" type="password" bind:value={currentPassword} autocomplete="current-password" />
          </div>
          <div class="field">
            <span class="label">Новый пароль (от 12 символов)</span>
            <input class="input" type="password" bind:value={newPassword} autocomplete="new-password" />
          </div>
          <button class="btn primary" disabled={!currentPassword || !newPassword || !!busy} onclick={changePassword}>
            Сменить пароль
          </button>
          <button class="link-btn" onclick={() => (showPassword = false)}>Отмена</button>
        </div>
      {:else}
        <div class="list">
          <button class="row" onclick={() => (showPassword = true)}>
            <div class="row-icon" style:--c="var(--muted)"><Icon name="edit" size={18} /></div>
            <div class="row-main"><div class="row-title">Сменить пароль</div></div>
          </button>
          <button class="row" onclick={signOut}>
            <div class="row-icon" style:--c="var(--red)"><Icon name="x" size={18} /></div>
            <div class="row-main">
              <div class="row-title danger-text">Выйти из аккаунта</div>
              <div class="row-sub">записи останутся на этом устройстве</div>
            </div>
          </button>
        </div>
      {/if}
    </div>

    <!-- ───── Приглашения (администратор) ───── -->
    {#if auth.me?.role === 'admin'}
      <div class="section">
        <div class="section-head"><h3>Приглашения</h3></div>
        <div class="card vstack">
          {#if inviteCode}
            <div class="row-title tnum">{inviteCode}</div>
            <p class="small">Одно использование, 7 дней. Код показывается только сейчас.</p>
            <button class="btn" onclick={() => copy(inviteCode)}><Icon name="copy" size={18} /> Скопировать</button>
          {:else}
            <p class="small">Код для регистрации нового человека.</p>
          {/if}
          <button class="btn primary" disabled={!!busy} onclick={makeInvite}>Создать код</button>
        </div>
      </div>
    {/if}
  {/if}

  {#if error}<p class="hint danger-text">{error}</p>{/if}
</div>
