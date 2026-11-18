<script lang="ts">
  // Простая столбчатая диаграмма на flex — легче любой библиотеки.
  let {
    items,
    color,
    format = (v: number) => String(v),
    showValues = false,
    height = 110,
  }: {
    items: { label: string; value: number; dim?: boolean }[];
    color?: string;
    format?: (v: number) => string;
    showValues?: boolean;
    height?: number;
  } = $props();

  const max = $derived(Math.max(1, ...items.map((i) => i.value)));
  const room = $derived(height - (showValues ? 34 : 20));
</script>

<div class="bars" style:--c={color} style:height="{height}px">
  {#each items as it, i (i)}
    <div class="b" title="{it.label}: {format(it.value)}">
      {#if showValues && it.value > 0}<span class="val">{format(it.value)}</span>{/if}
      <div
        class="fill"
        class:zero={it.value === 0}
        class:dim={it.dim}
        style:height="{it.value === 0 ? 3 : Math.max(4, (it.value / max) * room)}px"
      ></div>
      <small>{it.label}</small>
    </div>
  {/each}
</div>
