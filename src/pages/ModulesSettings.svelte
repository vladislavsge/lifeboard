<script lang="ts">
  import { data, moduleInfo } from '../lib/store.svelte';
  import { go } from '../lib/nav.svelte';
  import TopBar from '../components/TopBar.svelte';
  import Icon from '../components/Icon.svelte';

  function move(i: number, dir: -1 | 1) {
    const arr = data.settings.modules;
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    const [x] = arr.splice(i, 1);
    arr.splice(j, 0, x);
  }
</script>

<TopBar title="Разделы" back="/settings" />

<div class="page">
  <p class="hint">Включите то, что отслеживаете. Порядок здесь = порядок карточек на главной.</p>

  <div class="list">
    {#each data.settings.modules as m, i (m.id)}
      {@const info = moduleInfo(m.id)}
      {#if info}
        <div class="row">
          <div class="row-icon" style:--c={info.color}>{info.icon}</div>
          <div class="row-main">
            <div class="row-title">{info.name}</div>
            <div class="row-sub">{info.description}</div>
          </div>
          {#if info.tracker}
            <button class="icon-btn sm" aria-label="Настроить" onclick={() => go('/settings/tracker/' + info.tracker!.id)}><Icon name="edit" size={16} /></button>
          {/if}
          <div class="vstack" style="gap:0">
            <button class="icon-btn sm" style="height:24px" aria-label="Выше" disabled={i === 0} onclick={() => move(i, -1)}><Icon name="up" size={16} /></button>
            <button class="icon-btn sm" style="height:24px" aria-label="Ниже" disabled={i === data.settings.modules.length - 1} onclick={() => move(i, 1)}><Icon name="down" size={16} /></button>
          </div>
          <label class="switch" aria-label="Включён">
            <input type="checkbox" bind:checked={m.enabled} />
            <span></span>
          </label>
        </div>
      {/if}
    {/each}
  </div>

  <button class="btn primary block lg" onclick={() => go('/settings/tracker/new')}><Icon name="plus" size={18} /> Создать свой трекер</button>
  <p class="hint">
    Свой трекер — для всего остального: вес, сон, вода, лекарства, расходы на авто, привычки. Вы сами задаёте поля: числа, суммы,
    оценки, списки, галочки.
  </p>
</div>
