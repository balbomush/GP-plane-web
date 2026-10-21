export const endpoints = Object.freeze({
  core: Object.freeze({
    status: '/api/core/status',
    startStrategyDiscoveryRun: '/api/core/strategy-discovery/start-run',
    stopCurrentStrategyDiscoveryRun: '/api/core/strategy-discovery/stop-current-run',
    backupsList: '/api/core/backups/list',
    backupsCreate: '/api/core/backups/create',
    backupsRestore: '/api/core/backups/restore',
    backupsDelete: '/api/core/backups/delete',
    backupsDownloadArchive: '/api/core/backups/download-archive',
    backupsUpload: '/api/core/backups/upload',
    runSettings: '/api/core/run-settings',
    saveRunSettings: '/api/core/run-settings/save',
    latestLog: '/api/core/runs/latest-log',
    v2flyCategories: '/api/core/presets/v2fly/categories',
    v2flyCategoryDomains: '/api/core/presets/v2fly/category-domains'
  }),
  service: Object.freeze({
    releasesAvailable: '/api/service/releases/available',
    v2flyLocalStorageStatus: '/api/service/v2fly/local-storage-status',
    v2flyUpdateLocalStorage: '/api/service/v2fly/update-local-storage'
  }),
  web: Object.freeze({
    status: '/api/web/status',
    runPreferences: '/api/web/run-preferences',
    runHistoryPage: '/api/web/runs/history-page',
    candidateDomainIndexPage: '/api/web/candidate-domain-index-page',
    strategyCandidatesPage: '/api/web/strategy-candidates-page',
    presets: '/api/web/presets',
    presetDomains: '/api/web/presets/domains',
    presetSave: '/api/web/presets/save',
    presetDeleteUserLists: '/api/web/presets/delete-user-lists',
    events: '/api/web/events',
    eventsStream: '/api/web/events/stream'
  })
});
export function url(path: string, params: Record<string, string|number|boolean|undefined> = {}) {
  const query = new URLSearchParams();
  for (const [key,value] of Object.entries(params)) if(value!==undefined && value!=='') query.set(key,String(value));
  return path+(query.size?'?'+query.toString():'');
}
