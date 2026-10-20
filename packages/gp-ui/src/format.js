// v0.4.4 candidate-selection semantics: outer trim only; argument order untouched.
import {createCandidateSelectionModel} from './selection.js';
const selection = createCandidateSelectionModel({uniqueDomains: items => [...new Set(items)]});
export function candidateDomains(row) { return selection.candidateAllDomains(row); }
export function strategyText(row) { return String(row.args || '').trim(); }
export function strategiesText(rows) { return rows.map(strategyText).filter(Boolean).join('\n'); }

export function validCandidates(value) {
  return Array.isArray(value) && value.every(row => row && typeof row === 'object' &&
    typeof row.id === 'string' && typeof row.args === 'string' && typeof row.protocol === 'string' &&
    (row.seen === undefined || (Array.isArray(row.seen) && row.seen.every(s => s && typeof s.domain === 'string'))) &&
    (row.common_seen === undefined || (Array.isArray(row.common_seen) && row.common_seen.every(s => s && Array.isArray(s.domains) && s.domains.every(d => typeof d === 'string')))));
}
