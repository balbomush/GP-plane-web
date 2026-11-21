export {api2} from './api2';
export function url(path:string,params:Record<string,string|number|boolean|undefined>={}){const q=new URLSearchParams();for(const [k,v] of Object.entries(params))if(v!==undefined&&v!=='')q.set(k,String(v));return path+(q.size?'?'+q:'');}
