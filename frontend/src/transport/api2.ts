/** Wire DTOs come from the accepted Core OpenAPI, never from UI view shapes. */
import type {components,paths} from './core-api';
import {ApiClient} from '../api-client.js';
export type Schemas=components['schemas'];
export const api2='/api/v2';
export const backupUploadMedia:keyof paths['/backup/restore-file']['post']['requestBody']['content']='application/octet-stream';
export const id=(value:string|number)=>encodeURIComponent(String(value));
export class CoreApi extends ApiClient {
  releases(channel:'stable'|'prerelease',options?:any):Promise<Schemas['ReleaseList']>{return this.getJson(api2+'/service/releases?channel='+channel,options);}
  current(options?:any):Promise<Schemas['CurrentSearch']>{return this.getJson(api2+'/search/current',options);}
  service(options?:any):Promise<Schemas['CoreStatus']>{return this.getJson(api2+'/service/status',options);}
  runs(offset=0,options?:any):Promise<Schemas['RunPage']>{return this.getJson(api2+`/data/runs?limit=50&offset=${offset}`,options);}
  run(runId:string,options?:any):Promise<Schemas['RunDetail']>{return this.getJson(api2+'/data/runs/'+id(runId),options);}
  domainLists(offset=0,options?:any):Promise<Schemas['DomainListPage']>{return this.getJson(api2+`/data/domain-lists?limit=200&offset=${offset}`,options);}
}
/** Only presentation aliases; payloads remain public API2. */
export function runView(row:Schemas['RunDetail']) {
  return {...row,run_id:row.id,timestamp:row.started_at,kind:row.engine?.code||'legacy',discovery_options:row.parameters};
}
