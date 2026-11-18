<script lang="ts">
  import { add } from '../../lib/store.svelte';
  import { go, toast } from '../../lib/nav.svelte';
  import { WD_SHORT } from '../../lib/utils';
  import { PROGRAM_TEMPLATES } from '../../data/exercises';
  import SheetFrame from '../../components/SheetFrame.svelte';
  import { programFromTemplate } from './workouts';

  let { close }: { close: () => void } = $props();

  function pick(i: number) {
    const p = add('programs', programFromTemplate(i));
    toast('Программа создана — поправьте под себя');
    go('/workouts/p/' + p.id);
  }
</script>

<SheetFrame title="Шаблоны программ" {close}>
  <div class="vstack">
    {#each PROGRAM_TEMPLATES as t, i (t.name)}
      <button class="card tight vstack gap4" style="text-align:left;background:var(--card-2)" onclick={() => pick(i)}>
        <span class="bold">{t.name}</span>
        <span class="small muted">{t.note}</span>
        <span class="small">
          {#each t.days as d, j (j)}
            <span class="badge" style="margin:4px 4px 0 0">{d.name}: {d.weekdays.map((w) => WD_SHORT[w - 1]).join('/')}</span>
          {/each}
        </span>
      </button>
    {/each}
  </div>
</SheetFrame>
