<script lang="ts">
  import { data } from '../../lib/store.svelte';
  import { openSheet } from '../../lib/nav.svelte';
  import { money, periodRange, inPeriod, sum } from '../../lib/utils';
  import TopBar from '../../components/TopBar.svelte';
  import Icon from '../../components/Icon.svelte';
  import AccountForm from './AccountForm.svelte';

  const month = periodRange('month');
  const spent = (id: string) =>
    sum(
      data.transactions.filter((t) => t.accountId === id && t.type === 'expense' && inPeriod(t.date, month)),
      (t) => t.amount,
    );

  const active = $derived(data.accounts.filter((a) => !a.archived));
  const archived = $derived(data.accounts.filter((a) => a.archived));
</script>

<TopBar title="Карты и счета" back="/finance" />

<div class="page">
  <div class="cards">
    {#each active as a (a.id)}
      <button class="pcard" style:--c={a.color} onclick={() => openSheet(AccountForm, { id: a.id })}>
        <div class="hstack between">
          <span class="bold">{a.bank || (a.kind === 'cash' ? 'Наличные' : a.kind === 'card' ? 'Карта' : 'Счёт')}</span>
          <span class="small">{a.kind === 'cash' ? '💵' : a.cardType === 'credit' ? 'Кредитная' : a.kind === 'card' ? 'Дебетовая' : ''}</span>
        </div>
        {#if a.last4}<div class="num tnum">•••• {a.last4}</div>{/if}
        <div class="hstack between">
          <span class="bold">{a.name}</span>
          <span class="small">в этом месяце −{money(spent(a.id))}</span>
        </div>
        {#if data.settings.defaultAccountId === a.id}<span class="def">по умолчанию</span>{/if}
      </button>
    {/each}
  </div>

  <button class="btn primary block" onclick={() => openSheet(AccountForm, {})}><Icon name="plus" size={18} /> Добавить карту или счёт</button>

  <div class="section">
    <div class="section-head"><h3>Оплата по умолчанию</h3></div>
    <select class="input" bind:value={data.settings.defaultAccountId}>
      <option value={undefined}>Последняя использованная</option>
      {#each active as a (a.id)}
        <option value={a.id}>{a.name}{a.last4 ? ` ·${a.last4}` : ''}</option>
      {/each}
    </select>
    <p class="hint">Подставляется в новые расходы. После сохранения запоминается последний выбор.</p>
  </div>

  {#if archived.length}
    <div class="section">
      <div class="section-head"><h3>Скрытые</h3></div>
      <div class="list">
        {#each archived as a (a.id)}
          <div class="row">
            <div class="row-icon" style:--c={a.color}>💳</div>
            <div class="row-main"><div class="row-title">{a.name}</div></div>
            <button class="btn sm" onclick={() => (a.archived = false)}>Вернуть</button>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .cards {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .pcard {
    position: relative;
    text-align: left;
    border-radius: 20px;
    padding: 16px 18px;
    min-height: 120px;
    color: #fff;
    background: linear-gradient(135deg, var(--c), color-mix(in srgb, var(--c) 50%, #000));
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 10px;
  }
  .pcard:active {
    transform: scale(0.98);
  }
  .num {
    font-size: 19px;
    letter-spacing: 0.12em;
    opacity: 0.9;
  }
  .def {
    position: absolute;
    top: -8px;
    right: 14px;
    background: var(--bg-elev);
    color: var(--text);
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 99px;
  }
</style>
