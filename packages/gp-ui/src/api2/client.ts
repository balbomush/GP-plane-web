import type {operations,components} from './core-api';
export type Dto=components['schemas'];
type Op=Exclude<keyof operations,'watchCurrentSearch'>;
type Params<T>=T extends {parameters:infer P}?P:{};
type Body<T>=T extends {requestBody:{content:infer C}}?C[keyof C]:never;
type Reply<T>=T extends {responses:infer R}?{[K in keyof R]:K extends 200|201|202?R[K] extends {content:infer C}?C extends {'application/json':infer J}?J:Blob:void:K extends 204?void:never}[keyof R]:never;
export type Input<K extends Op>={path?:Params<operations[K]> extends {path?:infer P}?P:never;query?:Params<operations[K]> extends {query?:infer P}?P:never;body?:Body<operations[K]>};
export type GpClient={ [K in Op]:(input?:Input<K>,options?:{signal?:AbortSignal})=>Promise<Reply<operations[K]>> } & {
 watchCurrentSearch:(receive:(value:Dto['CurrentSearch'])=>void,connected:(value:boolean)=>void,fallback?:()=>void)=>()=>void;
 copy:(text:string)=>Promise<void>;
 save:(blob:Blob,filename:string)=>Promise<void>;
};
/** Cancellation and completion ownership scoped to one view, independent of login. */
export class Requests {
 private pending=new Map<string,AbortController>();
 async run<T>(key:string,request:(signal:AbortSignal)=>Promise<T>,apply:(value:T)=>void,fail:(error:Error)=>void){
  this.pending.get(key)?.abort();const controller=new AbortController();this.pending.set(key,controller);
  try{const value=await request(controller.signal);if(this.pending.get(key)===controller&&!controller.signal.aborted)apply(value);}
  catch(e){if(this.pending.get(key)===controller&&!controller.signal.aborted)fail(e instanceof Error?e:new Error(String(e)));}
  finally{if(this.pending.get(key)===controller)this.pending.delete(key);}
 }
 cancel(key:string){const c=this.pending.get(key);this.pending.delete(key);c?.abort();}
 dispose(){for(const c of this.pending.values())c.abort();this.pending.clear();}
}
export async function allPages<T>(read:(offset:number)=>Promise<{items:T[];total:number}>){
 const items:T[]=[];for(let offset=0;;){const p=await read(offset);items.push(...p.items);offset+=p.items.length;if(offset>=p.total)return items;if(!p.items.length)throw new Error('Неполная страница данных');}
}
export const normalizeDomains=(raw:string|string[])=>[...new Set((Array.isArray(raw)?raw.join('\n'):raw).split(/[,\s]+/).map(s=>s.trim().toLowerCase().replace(/\.$/,'')).filter(Boolean))];
export const sameDomains=(a:string[],b:string[])=>{const x=normalizeDomains(a).sort(),y=normalizeDomains(b).sort();return x.length===y.length&&x.every((v,i)=>v===y[i]);};
export const statusName=(status:string)=>({starting:'Подготовка',running:'Поиск идёт',stopping:'Остановка',stopped:'Остановлен',completed:'Завершён',failed:'Ошибка поиска'}[status]||status);
export const time=(value:string|null|undefined)=>value?new Intl.DateTimeFormat('ru',{dateStyle:'medium',timeStyle:'medium'}).format(new Date(value)):'Не сохранено';
