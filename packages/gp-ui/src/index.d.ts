import type {Component} from 'svelte';
import type {Candidate} from './format.js';
export type {Candidate};
declare const Results: Component<{candidates: Candidate[]; loading?: boolean; error?: string;
  onCopy: (text: string) => Promise<void>; onCopyResult?: (ok: boolean, message: string) => void}>;
export default Results;
