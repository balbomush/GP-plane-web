/** Legacy HTTP copy needs a user gesture; never bypass an explicit permission refusal. */
export async function copyText(text) {
  if (typeof navigator.clipboard?.writeText === 'function') return navigator.clipboard.writeText(text);
  const previous=document.activeElement;const selection=document.getSelection();
  const ranges=selection?Array.from({length:selection.rangeCount},(_,i)=>selection.getRangeAt(i).cloneRange()):[];
  const field=document.createElement('textarea');field.value=text;field.readOnly=true;
  field.setAttribute('aria-hidden','true');field.style.cssText='position:fixed;left:-10000px;top:0;opacity:0';
  document.body.appendChild(field);
  try {field.select();if(!document.execCommand('copy'))throw new Error('Браузер не разрешил копирование');}
  finally {field.remove();previous?.focus?.();if(selection){selection.removeAllRanges();for(const range of ranges)selection.addRange(range);}}
}
