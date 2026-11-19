<script lang="ts">
  import TopBar from '../components/TopBar.svelte';
  import Icon from '../components/Icon.svelte';
  import { go, toast } from '../lib/nav.svelte';
  import { gql, ApiError } from '../lib/api';
  import { auth, login, loginWithPasskey, register, refresh, useRecoveryCode, verifyTotp } from '../lib/auth.svelte';
  import { passkeysSupported } from '../lib/webauthn';

  let { action, token }: { action?: string; token?: string } = $props();

  type Mode = 'login' | 'register' | 'mfa' | 'forgot' | 'reset' | 'verify';

  let mode = $state<Mode>(
    action === 'reset' ? 'reset' : action === 'verify' ? 'verify' : auth.state === 'mfa' ? 'mfa' : 'login',
  );
  let email = $state('');
  let password = $state('');
  let invite = $state('');
  let code = $state('');
  let recovery = $state(false);
  let busy = $state(false);
  let error = $state('');
  let okText = $state('');

  const titles: Record<Mode, string> = {
    login: 'Вход',
    register: 'Новый аккаунт',
    mfa: 'Подтверждение входа',
    forgot: 'Восстановление пароля',
    reset: 'Новый пароль',
    verify: 'Подтверждение почты',
  };

  async function run(fn: () => Promise<void>) {
    if (busy) return;
    busy = true;
    error = '';
    try {
      await fn();
    } catch (e) {
      error = e instanceof ApiError || e instanceof Error ? e.message : 'Что-то пошло не так';
    } finally {
      busy = false;
    }
  }

  const finish = (state: string) => {
    if (state === 'mfa') {
      mode = 'mfa';
      code = '';
    } else {
      toast('С возвращением!');
      go('/account');
    }
  };

  const doLogin = () => run(async () => finish(await login(email, password)));
  const doRegister = () => run(async () => finish(await register(email, password, invite)));
  const doMfa = () =>
    run(async () => finish(recovery ? await useRecoveryCode(code) : await verifyTotp(code)));
  const doPasskey = () => run(async () => finish(await loginWithPasskey(email || undefined)));

  const doForgot = () =>
    run(async () => {
      await gql('mutation($e:String!){ requestPasswordReset(email:$e) }', { e: email });
      okText = 'Если такой аккаунт есть, письмо со ссылкой уже отправлено. Ссылка действует час.';
    });

  const doReset = () =>
    run(async () => {
      await gql('mutation($t:String!,$p:String!){ resetPassword(token:$t,newPassword:$p) }', {
        t: token,
        p: password,
      });
      okText = 'Пароль изменён. Войдите с новым паролем.';
      mode = 'login';
      password = '';
    });

  const doVerify = () =>
    run(async () => {
      await gql('mutation($t:String!){ verifyEmail(token:$t) }', { t: token });
      await refresh();
      okText = 'Почта подтверждена.';
    });

  // подтверждение почты не требует действий человека — делаем сразу
  $effect(() => {
    if (mode === 'verify' && token && !okText && !error && !busy) void doVerify();
  });
</script>

<TopBar title={titles[mode]} back="/settings" />

<div class="page">
  {#if !auth.serverReachable}
    <div class="card vstack">
      <div class="row-title">Сервер недоступен</div>
      <p class="small">
        Приложение работает и без аккаунта — все записи лежат на этом устройстве. Аккаунт нужен только для
        синхронизации между телефоном и компьютером.
      </p>
      <button class="btn" onclick={() => void refresh()}>Проверить ещё раз</button>
    </div>
  {:else}
    {#if okText}
      <div class="card vstack"><p class="small">{okText}</p></div>
    {/if}

    {#if mode === 'mfa'}
      <div class="card vstack">
        <p class="small">
          {recovery
            ? 'Введите один из кодов восстановления, которые вы сохранили при включении двухфакторной проверки.'
            : 'Откройте приложение-аутентификатор и введите код для «Lifeboard».'}
        </p>
        <div class="field">
          <span class="label">{recovery ? 'Код восстановления' : 'Код из приложения'}</span>
          <input
            class="input big"
            bind:value={code}
            inputmode={recovery ? 'text' : 'numeric'}
            autocomplete="one-time-code"
            placeholder={recovery ? 'ABCDE-FGHJK' : '000000'}
            onkeydown={(e) => e.key === 'Enter' && doMfa()}
          />
        </div>
        <button class="btn primary" disabled={busy || !code} onclick={doMfa}>Подтвердить</button>
        <button class="link-btn" onclick={() => ((recovery = !recovery), (code = ''))}>
          {recovery ? 'Ввести код из приложения' : 'Использовать код восстановления'}
        </button>
      </div>
    {:else if mode === 'verify'}
      <div class="card vstack">
        <p class="small">{busy ? 'Проверяю ссылку…' : okText || 'Ссылку не удалось проверить.'}</p>
        <button class="btn" onclick={() => go('/account')}>В аккаунт</button>
      </div>
    {:else}
      <div class="card vstack">
        {#if mode !== 'reset'}
          <div class="field">
            <span class="label">Почта</span>
            <input
              class="input"
              type="email"
              bind:value={email}
              autocomplete="email"
              inputmode="email"
              placeholder="you@example.com"
            />
          </div>
        {/if}

        {#if mode !== 'forgot'}
          <div class="field">
            <span class="label">{mode === 'login' ? 'Пароль' : 'Пароль (от 12 символов)'}</span>
            <input
              class="input"
              type="password"
              bind:value={password}
              autocomplete={mode === 'login' ? 'current-password' : 'new-password'}
              onkeydown={(e) => e.key === 'Enter' && (mode === 'login' ? doLogin() : mode === 'reset' ? doReset() : doRegister())}
            />
          </div>
        {/if}

        {#if mode === 'register' && !auth.openRegistration}
          <div class="field">
            <span class="label">Код приглашения</span>
            <input class="input" bind:value={invite} placeholder="ABCD-EFGH-JKLM" autocapitalize="characters" />
          </div>
        {/if}

        {#if mode === 'login'}
          <button class="btn primary" disabled={busy || !email || !password} onclick={doLogin}>Войти</button>
          {#if passkeysSupported()}
            <button class="btn" disabled={busy} onclick={doPasskey}>
              <Icon name="check" size={18} /> Войти по ключу устройства
            </button>
          {/if}
          <div class="hstack between">
            <button class="link-btn" onclick={() => ((mode = 'register'), (error = ''))}>Создать аккаунт</button>
            {#if auth.mailEnabled}
              <button class="link-btn" onclick={() => ((mode = 'forgot'), (error = ''))}>Забыли пароль?</button>
            {/if}
          </div>
        {:else if mode === 'register'}
          <button
            class="btn primary"
            disabled={busy || !email || !password || (!auth.openRegistration && !invite)}
            onclick={doRegister}>Создать аккаунт</button
          >
          <button class="link-btn" onclick={() => ((mode = 'login'), (error = ''))}>У меня уже есть аккаунт</button>
        {:else if mode === 'forgot'}
          <button class="btn primary" disabled={busy || !email} onclick={doForgot}>Прислать ссылку</button>
          <button class="link-btn" onclick={() => ((mode = 'login'), (error = ''))}>Назад ко входу</button>
        {:else if mode === 'reset'}
          <button class="btn primary" disabled={busy || !password} onclick={doReset}>Задать пароль</button>
        {/if}
      </div>
    {/if}

    {#if error}
      <p class="hint danger-text">{error}</p>
    {/if}

    {#if mode === 'register' && !auth.openRegistration}
      <p class="hint">Регистрация только по приглашению — код выдаёт владелец сервера.</p>
    {/if}

    <p class="hint">
      Аккаунт нужен только для синхронизации между устройствами. Без него трекер работает как обычно, данные
      остаются в этом браузере.
    </p>
  {/if}
</div>
