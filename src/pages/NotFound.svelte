<script lang="ts">
  import TopBar from '../components/TopBar.svelte';
  import Empty from '../components/Empty.svelte';
</script>

<TopBar title="Не найдено" back="/" />
<div class="page">
  <Empty icon="🧭" title="Такой страницы нет">
    <a class="btn primary sm" href="#/">На главную</a>
  </Empty>
</div>
