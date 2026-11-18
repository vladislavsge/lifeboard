<script lang="ts">
  // Покупка сигарет/стиков — сразу попадает в расходы (категория «Курение»).
  import { data, add, find, defaultAccountId, systemCategoryId } from '../../lib/store.svelte';
  import { openSheet, toast } from '../../lib/nav.svelte';
  import { nowLocal, uid, money } from '../../lib/utils';
  import { smokeTypeIcon } from '../../data/defaults';
  import SheetFrame from '../../components/SheetFrame.svelte';
  import MoneyInput from '../../components/MoneyInput.svelte';
  import AccountPicker from '../../components/AccountPicker.svelte';
  import DateTime from '../../components/DateTime.svelte';
  import Icon from '../../components/Icon.svelte';
  import ProductForm from './ProductForm.svelte';

  let { close }: { close: () => void } = $props();

  let productId = $state(data.settings.lastSmokeProductId ?? data.smokeProducts.find((p) => !p.archived)?.id ?? '');
  let packs = $state(1);
  let amount = $state<number | undefined>(undefined);
  let accountId = $state(defaultAccountId());
  let date = $state(nowLocal());
  let touched = $state(false);

  const product = $derived(find('smokeProducts', productId));
  const products = $derived(data.smokeProducts.filter((p) => !p.archived));

  // пока сумму не трогали руками — считаем из цены пачки
  $effect(() => {
    if (!touched && product?.packPrice) amount = product.packPrice * packs;
  });

  function save() {
    if (!amount) return;
    add('transactions', {
      id: uid(),
      type: 'expense',
      amount,
      categoryId: systemCategoryId('smoking'),
      accountId,
      date,
      note: product ? `${product.name}${packs > 1 ? ` × ${packs}` : ''}` : 'Сигареты',
      source: { module: 'smoking', refId: productId || undefined },
    });
    if (product && !product.packPrice && packs > 0) product.packPrice = Math.round(amount / packs);
    data.settings.defaultAccountId = accountId;
    toast(`Покупка ${money(amount)} записана в расходы`);
    close();
  }
</script>

<SheetFrame title="Купил" {close}>
  <div class="field">
    <span class="label">Что купил</span>
    <div class="chips wrap">
      {#each products as p (p.id)}
        <button class="chip" class:on={productId === p.id} onclick={() => { productId = p.id; touched = false; }}>
          {smokeTypeIcon(p.type)} {p.name}
        </button>
      {/each}
      <button class="chip" onclick={() => openSheet(ProductForm, { onsaved: (id: string) => (productId = id) })}>
        <Icon name="plus" size={16} /> Новое
      </button>
    </div>
  </div>

  <div class="hstack between">
    <span class="label">Пачек / упаковок</span>
    <div class="stepper">
      <button onclick={() => (packs = Math.max(1, packs - 1))} aria-label="Меньше">−</button>
      <span>{packs}</span>
      <button onclick={() => packs++} aria-label="Больше">+</button>
    </div>
  </div>

  <div class="field">
    <span class="label">Сумма</span>
    <div oninput={() => (touched = true)} role="presentation">
      <MoneyInput bind:value={amount} big />
    </div>
  </div>

  <div class="field">
    <span class="label">Чем платил</span>
    <AccountPicker bind:value={accountId} />
  </div>

  <div class="field">
    <span class="label">Когда</span>
    <DateTime bind:value={date} />
  </div>

  {#snippet footer()}
    <button class="btn primary" disabled={!amount} onclick={save}>Записать покупку</button>
  {/snippet}
</SheetFrame>
