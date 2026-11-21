import {unzipSync,strFromU8} from 'fflate';
import {sha256} from '@noble/hashes/sha2.js';
/** Inspect a bounded ZIP in memory; never execute args or extract to a filesystem. */
export async function inspectArchive(blob:Blob){
 if(blob.size>64*1024*1024)throw new Error('Архив слишком большой');let total=0;
 const files=unzipSync(new Uint8Array(await blob.arrayBuffer()),{filter:entry=>{total+=entry.originalSize;if(total>64*1024*1024)throw new Error('Распакованный архив слишком большой');return true;}});
 const manifest=JSON.parse(strFromU8(files['manifest.json']||new Uint8Array()));
 if(manifest.schema_version!==1||!['strategy','bundle'].includes(manifest.kind)||!Array.isArray(manifest.files))throw new Error('Архив неполон: неверный manifest');
 const paths:string[]=[];
 for(const file of manifest.files){if(typeof file.path!=='string'||file.path.startsWith('/')||file.path.split('/').some(x=>x==='..'||x==='')||file.path.includes('\\')||paths.includes(file.path)||!files[file.path])throw new Error('Архив неполон: неверный состав');
  const digest=globalThis.crypto?.subtle?new Uint8Array(await crypto.subtle.digest('SHA-256',files[file.path].slice().buffer)):sha256(files[file.path]);
  const hash=Array.from(digest).map(x=>x.toString(16).padStart(2,'0')).join('');if(hash!==file.sha256)throw new Error('Архив неполон: контрольная сумма');paths.push(file.path);
 }
 if(!paths.includes(manifest.entrypoint)||manifest.target!=='nfqws2')throw new Error('Архив неполон: точка входа');return paths;
}
