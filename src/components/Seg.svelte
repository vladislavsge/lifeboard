<script lang="ts" generics="T extends string | number">
  let {
    value = $bindable(),
    options,
    onchange,
  }: { value: T; options: { value: T; label: string }[]; onchange?: (v: T) => void } = $props();
</script>

<div class="seg" role="tablist">
  {#each options as o (o.value)}
    <button
      type="button"
      role="tab"
      aria-selected={value === o.value}
      class:on={value === o.value}
      onclick={() => {
        value = o.value;
        onchange?.(o.value);
      }}>{o.label}</button
    >
  {/each}
</div>
