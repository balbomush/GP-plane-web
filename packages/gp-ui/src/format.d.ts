export interface Candidate {
  id: string; args: string; protocol: string;
  status?: string; fragmentation_reason?: string;
  seen?: {domain: string}[];
  common_seen?: {domains: string[]}[];
}
export function candidateDomains(row: Candidate): string[];
export function strategyText(row: Candidate): string;
export function strategiesText(rows: Candidate[]): string;
export function validCandidates(value: unknown): value is Candidate[];
