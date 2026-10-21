import {defineConfig} from 'vite';
import {svelte} from '@sveltejs/vite-plugin-svelte';
import {readFileSync} from 'node:fs';
const version=/^version = "([^"]+)"/m.exec(readFileSync(new URL('../pyproject.toml',import.meta.url),'utf8'))?.[1];
if(!version)throw new Error('Web package version is missing');
export default defineConfig({plugins:[svelte()],define:{__WEB_PACKAGE_VERSION__:JSON.stringify(version)},build:{outDir:'../src/gp_control_plane_web/static',emptyOutDir:true}});
