/** Payload semantics from v0.4.4 finder-controller, no DOM or new search logic. */
export const domains = (raw: string|string[]) => [...new Set((Array.isArray(raw)?raw.join('\n'):String(raw || '')).split(/[,\s]+/).map(s => s.trim()).filter(Boolean))];
export const initialPreferences = () => ({domains: [] as string[], domain_preset: 'system:required', discovery_profile: 'standard',
  run_mode: 'standard', curl_parallelism: 4, enable_http: false, enable_tls12: true, enable_tls13: false,
  debug_stdout:false,include_quic: true, enable_ipv6: false, scan_level: 'standard', repeats: 1, repeat_parallel: false,
  skip_dnscheck: true, skip_ipblock: true, curl_max_time: 2, curl_max_time_quic: 2, curl_max_time_doh: 2,
  limit_time_enabled: false, timeout_hours: 6});
export function normalizePreferences(p: ReturnType<typeof initialPreferences>, maximum=10){
  const bounded=(value:number,fallback:number,min:number,max:number)=>Math.max(min,Math.min(max,Math.round(Number.isFinite(value)?value:fallback)));
  return {...p,repeats:bounded(p.repeats||1,1,1,10),curl_parallelism:bounded(p.curl_parallelism||4,4,1,maximum),
    curl_max_time:bounded(p.curl_max_time||2,2,1,Number.MAX_SAFE_INTEGER),
    curl_max_time_quic:bounded(p.curl_max_time_quic||2,2,1,Number.MAX_SAFE_INTEGER),
    curl_max_time_doh:bounded(p.curl_max_time_doh||2,2,1,Number.MAX_SAFE_INTEGER),
    timeout_hours:Number.isFinite(p.timeout_hours)?p.timeout_hours:6};
}
export function discoveryPayload(p: ReturnType<typeof initialPreferences>, text: string) {
  const settings = Object.fromEntries(['enable_http','enable_tls12','enable_tls13','include_quic','enable_ipv6','scan_level',
    'repeats','repeat_parallel','skip_dnscheck','skip_ipblock','curl_max_time','curl_max_time_quic','curl_max_time_doh'].map(k=>[k,p[k as keyof typeof p]]));
  const protocols = [...(p.enable_http || p.enable_tls12 || p.enable_tls13 ? ['tcp'] : []), ...(p.include_quic ? ['quic'] : [])];
  if (!protocols.length) throw new Error('Выберите хотя бы один протокол для проверки');
  const selected = domains(text);
  if (!selected.length) throw new Error('Добавьте хотя бы один домен для подбора');
  return {mode: p.run_mode === 'multi' ? 'multi_domain' : 'standard', domains: selected, protocols, settings,
    ...(p.run_mode === 'multi' ? {curl_parallelism: p.curl_parallelism} : {}),
    ...(p.limit_time_enabled ? {timeout_seconds: Math.max(60, Math.round(p.timeout_hours * 3600))} : {})};
}
