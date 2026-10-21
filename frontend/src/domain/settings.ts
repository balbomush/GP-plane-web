/** Exact v0.4.4 run-settings writable surface; service fields stay in Core. */
export const runSettingKeys=['curl_parallelism_default','curl_parallelism_max','curl_max_time','curl_max_time_quic','curl_max_time_doh','enable_ipv6','debug_stdout'] as const;
export function runSettings(source:any){return Object.fromEntries(runSettingKeys.filter(key=>Object.hasOwn(source||{},key)).map(key=>[key,source[key]]));}
/** v0.4.4 candidate version comparison is independent of JSON object ordering. */
export function candidateVersionKey(version:any){const value=version||{};return Object.keys(value).sort().map(key=>`${key}:${JSON.stringify(value[key])}`).join('|');}
