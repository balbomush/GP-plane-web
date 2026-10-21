/** Runs from frontend after Vite; records reproducible inputs, never local paths. */
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const staticRoot=path.join(base,'src/gp_control_plane_web/static');
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const assets={};
for(const file of ['index.html',...readdirSync(path.join(staticRoot,'assets')).sort().map(name=>'assets/'+name)])assets[file]=hash(path.join(staticRoot,file));
const manifest={schema:1,app:JSON.parse(readFileSync(path.join(base,'frontend/package.json'),'utf8')).version,
  frontend_lock_sha256:hash(path.join(base,'frontend/package-lock.json')),
  gp_ui:{version:'0.1.0-s2a.1',sha256:hash(path.join(base,'frontend/vendor/gp-plane-gp-ui-0.1.0-s2a.1.tgz'))},assets};
if(manifest.gp_ui.sha256!=='a1ed233f5ae2fd9830c2158737ad080f1deacfb84090d0efe88ce365b3289498')throw new Error('S2A gp-ui identity changed');
writeFileSync(path.join(staticRoot,'asset-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
