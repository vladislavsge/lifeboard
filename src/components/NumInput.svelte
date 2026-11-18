<script lang="ts">
  // Числовое поле, удобное на телефоне: принимает запятую, не прыгает курсор.
  // scale — во сколько раз хранимое значение больше показываемого (например, секунды ↔ минуты = 60).
  import { parseNum } from '../lib/utils';

  let {
    value = $bindable(),
    placeholder = '',
    scale = 1,
    decimals = 2,
    cls = 'input sm',
    inputmode = 'decimal',
    ariaLabel,
    autofocus = false,
  }: {
    value: number | undefined;
    placeholder?: string | number;
    scale?: number;
    decimals?: number;
    cls?: string;
    inputmode?: 'decimal' | 'numeric';
    ariaLabel?: string;
    autofocus?: boolean;
  } = $props();

  function focusOnMount(node: HTMLInputElement) {
    if (autofocus) setTimeout(() => node.focus(), 250);
  }

  const toText = (v: number | undefined) => {
    if (v === undefined || v === null || Number.isNaN(v)) return '';
    const k = 10 ** decimals;
    return String(Math.round((v / scale) * k) / k).replace('.', ',');
  };
  const parse = (t: string) => {
    const n = parseNum(t);
    if (n === undefined) return undefined;
    return scale === 1 ? n : Math.round(n * scale);
  };

  let text = $state(toText(value));
  let last: number | undefined = value;

  $effect(() => {
    const v = value;
    if (v !== last) {
      last = v;
      if (parse(text) !== v) text = toText(v);
    }
  });

  function oninput(e: Event) {
    text = (e.currentTarget as HTMLInputElement).value;
    const v = parse(text);
    last = v;
    value = v;
  }
</script>

<input
  class="{cls} tnum"
  type="text"
  {inputmode}
  placeholder={placeholder === undefined ? '' : String(placeholder)}
  value={text}
  {oninput}
  autocomplete="off"
  enterkeyhint="next"
  aria-label={ariaLabel}
  use:focusOnMount
  onfocus={(e) => (e.currentTarget as HTMLInputElement).select()}
/>
