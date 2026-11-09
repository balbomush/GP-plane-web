import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const frontend=path.join(root,'frontend');
const target=path.join(frontend,'src/transport/core-api.verify.d.ts');
try{
  const r=spawnSync(process.execPath,[path.join(frontend,'node_modules/openapi-typescript/bin/cli.js'),
    path.join(root,'src/gp_control_plane_web/openapi.json'),'-o',target],{stdio:'inherit'});
  if(r.status!==0)throw new Error('OpenAPI type generation failed');
  if(!fs.readFileSync(target).equals(fs.readFileSync(path.join(frontend,'src/transport/core-api.d.ts'))))
    throw new Error('Generated API types differ: run npm run api:types');
  console.log('Generated API2 types are current');
}finally{if(fs.existsSync(target))fs.unlinkSync(target);}
