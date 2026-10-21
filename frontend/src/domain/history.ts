/** Public RunHistoryItem identity is run_id (Core v0.4.4 OpenAPI). */
export function latestById(rows:any[]){
  const byId=new Map();
  rows.forEach((row,index)=>byId.set(row.run_id||row.id||`row-${index}`,row));
  return Array.from(byId.values()).sort((a,b)=>String(a.timestamp||'').localeCompare(String(b.timestamp||'')));
}
