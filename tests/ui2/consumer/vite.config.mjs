import {defineConfig} from '../../../frontend/node_modules/vite/dist/node/index.js';
import {svelte} from '../../../frontend/node_modules/@sveltejs/vite-plugin-svelte/src/index.js';
export default defineConfig({base:'/consumer/',plugins:[svelte()],build:{outDir:'dist',emptyOutDir:true}});
