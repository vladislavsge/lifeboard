import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
  compilerOptions: {
    // Формы в шторках намеренно берут начальные значения пропсов один раз (черновик редактирования).
    warningFilter: (w) => w.code !== 'state_referenced_locally',
  },
};
