<script lang="ts">
  // Дата + время для строки "YYYY-MM-DDTHH:mm". Нативные пикеры удобнее всего на телефоне.
  let { value = $bindable(), withTime = true }: { value: string; withTime?: boolean } = $props();

  const date = $derived(value.slice(0, 10));
  const time = $derived(value.slice(11, 16) || '12:00');
</script>

<div class="grid2" style:grid-template-columns={withTime ? '1.4fr 1fr' : '1fr'}>
  <input
    class="input"
    type="date"
    value={date}
    onchange={(e) => {
      const v = (e.currentTarget as HTMLInputElement).value;
      if (v) value = `${v}T${time}`;
    }}
  />
  {#if withTime}
    <input
      class="input"
      type="time"
      value={time}
      onchange={(e) => {
        const v = (e.currentTarget as HTMLInputElement).value;
        if (v) value = `${date}T${v}`;
      }}
    />
  {/if}
</div>
