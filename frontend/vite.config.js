import {defineConfig} from 'vite';
import {svelte} from '@sveltejs/vite-plugin-svelte';
export default defineConfig({plugins:[svelte()],build:{outDir:'../src/gp_control_plane_web/static',emptyOutDir:true}});
