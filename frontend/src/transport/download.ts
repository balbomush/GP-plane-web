export function download(blob:Blob,filename:string) {
  const objectUrl=URL.createObjectURL(blob),link=document.createElement('a');
  try {link.href=objectUrl;link.download=filename;document.body.appendChild(link);link.click();}
  finally {link.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),0);}
}
