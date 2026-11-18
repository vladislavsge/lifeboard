<script lang="ts">
  // Поле суммы: хранит значение в центах, принимает и «12,5», и «12.50».
  import { centsToInput, currencySymbol, parseMoney } from '../lib/utils';

  let {
    value = $bindable(),
    big = false,
    placeholder = '0',
    autofocus = false,
    id,
  }: { value: number | undefined; big?: boolean; placeholder?: string; autofocus?: boolean; id?: string } = $props();

  let text = $state(centsToInput(value));
  let last: number | undefined = value;

  // если значение поменяли снаружи (например, пересчитали итог) — обновить текст
  $effect(() => {
    const v = value;
    if (v !== last) {
      last = v;
      if (parseMoney(text) !== v) text = centsToInput(v);
    }
  });

  function oninput(e: Event) {
    text = (e.currentTarget as HTMLInputElement).value;
    const c = parseMoney(text);
    last = c ?? undefined;
    value = c ?? undefined;
  }

  function focusOnMount(node: HTMLInputElement) {
    if (autofocus) setTimeout(() => node.focus(), 250);
  }
</script>

<div class="input-wrap">
  <input
    {id}
    class="input tnum"
    class:big
    type="text"
    inputmode="decimal"
    enterkeyhint="done"
    autocomplete="off"
    {placeholder}
    value={text}
    {oninput}
    use:focusOnMount
    style:padding-right={big ? '44px' : '40px'}
    style:padding-left={big ? '44px' : undefined}
  />
  <span class="suffix">{currencySymbol()}</span>
</div>
