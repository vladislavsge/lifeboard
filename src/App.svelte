<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { app, data } from './lib/store.svelte';
  import { router, ui, answerConfirm, hideToast } from './lib/nav.svelte';
  import { auth, refresh } from './lib/auth.svelte';
  import { start as startSync, stop as stopSync } from './lib/sync.svelte';
  import BottomNav from './components/BottomNav.svelte';
  import SheetHost from './components/SheetHost.svelte';

  import Home from './pages/Home.svelte';
  import Calendar from './pages/Calendar.svelte';
  import History from './pages/History.svelte';
  import Settings from './pages/Settings.svelte';
  import ModulesSettings from './pages/ModulesSettings.svelte';
  import Auth from './pages/Auth.svelte';
  import Account from './pages/Account.svelte';
  import NotFound from './pages/NotFound.svelte';

  import FinancePage from './modules/finance/FinancePage.svelte';
  import AccountsPage from './modules/finance/AccountsPage.svelte';
  import CategoriesPage from './modules/finance/CategoriesPage.svelte';
  import BudgetsPage from './modules/finance/BudgetsPage.svelte';
  import RecurringPage from './modules/finance/RecurringPage.svelte';
  import Stats from './pages/Stats.svelte';
  import WorkoutsPage from './modules/workouts/WorkoutsPage.svelte';
  import WorkoutSession from './modules/workouts/WorkoutSession.svelte';
  import ProgramsPage from './modules/workouts/ProgramsPage.svelte';
  import ProgramEditor from './modules/workouts/ProgramEditor.svelte';
  import ExercisesPage from './modules/workouts/ExercisesPage.svelte';
  import SmokingPage from './modules/smoking/SmokingPage.svelte';
  import GroceriesPage from './modules/groceries/GroceriesPage.svelte';
  import HealthPage from './modules/health/HealthPage.svelte';
  import TrackerPage from './modules/custom/TrackerPage.svelte';
  import TrackerBuilder from './modules/custom/TrackerBuilder.svelte';

  const parts = $derived(router.path.split('/').filter(Boolean));

  // есть ли на этом адресе сервер аккаунтов — спрашиваем один раз при запуске
  $effect(() => {
    if (auth.state === 'unknown') void refresh();
  });

  // синхронизацию включаем только когда данные уже загружены из IndexedDB,
  // иначе на сервер уедут пустые коллекции
  $effect(() => {
    if (app.ready && auth.state === 'in') void startSync();
    else if (auth.state !== 'in') stopSync();
  });
  const [p0, p1, p2] = $derived([parts[0], parts[1], parts[2]]);

  // тема: авто / светлая / тёмная
  $effect(() => {
    const t = data.settings.theme;
    const mq = matchMedia('(prefers-color-scheme: light)');
    const apply = () => {
      const v = t === 'auto' ? (mq.matches ? 'light' : 'dark') : t;
      document.documentElement.dataset.theme = v;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', v === 'light' ? '#f3f4f8' : '#0b0d12');
    };
    apply();
    try {
      localStorage.setItem('lb-theme', JSON.stringify(t));
    } catch {
      /* ignore */
    }
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  });
</script>

{#if app.ready}
  {#key data.settings.currency}
    {#if !p0}
      <Home />
    {:else if p0 === 'calendar'}
      <Calendar />
    {:else if p0 === 'history'}
      <History />
    {:else if p0 === 'settings' && !p1}
      <Settings />
    {:else if p0 === 'auth'}
      {#key p1}<Auth action={p1} token={p2} />{/key}
    {:else if p0 === 'account'}
      <Account />
    {:else if p0 === 'settings' && p1 === 'modules'}
      <ModulesSettings />
    {:else if p0 === 'settings' && p1 === 'tracker'}
      {#key p2}<TrackerBuilder id={p2 ?? 'new'} />{/key}
    {:else if p0 === 'finance' && !p1}
      <FinancePage />
    {:else if p0 === 'finance' && p1 === 'accounts'}
      <AccountsPage />
    {:else if p0 === 'finance' && p1 === 'categories'}
      <CategoriesPage />
    {:else if p0 === 'finance' && p1 === 'budgets'}
      <BudgetsPage />
    {:else if p0 === 'finance' && p1 === 'recurring'}
      <RecurringPage />
    {:else if p0 === 'stats'}
      <Stats />
    {:else if p0 === 'workouts' && !p1}
      <WorkoutsPage />
    {:else if p0 === 'workouts' && p1 === 'w' && p2}
      {#key p2}<WorkoutSession id={p2} />{/key}
    {:else if p0 === 'workouts' && p1 === 'programs'}
      <ProgramsPage />
    {:else if p0 === 'workouts' && p1 === 'p' && p2}
      {#key p2}<ProgramEditor id={p2} />{/key}
    {:else if p0 === 'workouts' && p1 === 'exercises'}
      <ExercisesPage />
    {:else if p0 === 'smoking'}
      <SmokingPage />
    {:else if p0 === 'groceries'}
      <GroceriesPage tab={p1 ?? 'list'} />
    {:else if p0 === 'health'}
      <HealthPage tab={p1 ?? 'upcoming'} />
    {:else if p0 === 't' && p1}
      {#key p1}<TrackerPage id={p1} />{/key}
    {:else}
      <NotFound />
    {/if}
  {/key}

  <BottomNav />
  <SheetHost />

  {#if ui.toast}
    {#key ui.toast.id}
      <div class="toast" role="status" in:fly={{ y: 20, duration: 180 }} out:fade={{ duration: 150 }}>
        <span>{ui.toast.text}</span>
        {#if ui.toast.action}
          <button
            onclick={() => {
              ui.toast?.action?.fn();
              hideToast();
            }}>{ui.toast.action.label}</button
          >
        {/if}
      </div>
    {/key}
  {/if}

  {#if ui.confirm}
    <div class="backdrop" style:z-index="69" transition:fade={{ duration: 150 }} onclick={() => answerConfirm(false)} role="presentation"></div>
    <div class="dialog" role="alertdialog" aria-modal="true" transition:fade={{ duration: 150 }}>
      {#if ui.confirm.title}<h3>{ui.confirm.title}</h3>{/if}
      <p>{ui.confirm.text}</p>
      <div class="grid2">
        <button class="btn" onclick={() => answerConfirm(false)}>Отмена</button>
        <button class="btn {ui.confirm.danger ? 'danger' : 'primary'}" onclick={() => answerConfirm(true)}>{ui.confirm.ok}</button>
      </div>
    </div>
  {/if}
{/if}
