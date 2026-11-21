import {copyText} from './clipboard.js';import routes from './operations.json';import {ApiClient} from '../api-client.js';import {RealtimeController} from './realtime-controller.js';import {download} from './download';import type {GpClient} from '@gp-plane/gp-ui/api2';
/** Public operation adapter; shell alone supplies authentication/session lifetime. */
export function gpClient(api:ApiClient):GpClient{
 const capabilities={copy:(text:string)=>copyText(text),save:async(blob:Blob,name:string)=>download(blob,name),
 watchCurrentSearch:(...args:Parameters<GpClient['watchCurrentSearch']>)=>{
  const [receive,connected,fallback]=args;
  const realtime=new RealtimeController({api,url:()=>'/api/v2/search/events',onEvent:(event,data)=>{if(event==='search')receive(JSON.parse(data));},onConnection:connected,fallback,isActive:()=>true});
  realtime.start();return()=>realtime.dispose();
 }};
 return new Proxy(capabilities,{get(target,key){if(key in target)return(target as any)[key];const op=routes[String(key)];if(!op)return undefined;
  return async(input:any={},options:any={})=>{let path=op.path;for(const[k,v]of Object.entries(input.path||{}))path=path.replace('{'+k+'}',encodeURIComponent(String(v)));const q=new URLSearchParams();for(const[k,v]of Object.entries(input.query||{}))if(v!==undefined&&v!==null){if(Array.isArray(v))for(const item of v)q.append(k,String(item));else q.set(k,String(v));};const url='/api/v2'+path+(q.size?'?'+q:'');
   if(String(key).match(/^download(Strategy|Bundle|Backup)$/))return(await api.blob(url,options)).blob;
   if(key==='restoreBackupFile'){const response=await api.request(url,{...options,method:op.method,headers:{...options.headers,'Content-Type':'application/octet-stream'},body:input.body,keepSessionSignal:true});try{const data=await response.json();api.assertResponseCurrent(response);if(!response.ok)throw api.jsonError(response,data);return data;}finally{api.releaseResponse(response);}}
   return op.method==='GET'?api.getJson(url,options):api.sendJson(op.method,url,input.body,options);
  };
 }}) as unknown as GpClient;
}
