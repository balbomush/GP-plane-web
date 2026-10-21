function trimTextLines(text, maxLines){
  const lines = String(text || '').split('\n');
  if (lines.length <= maxLines) return lines.join('\n');
  return lines.slice(lines.length - maxLines).join('\n');
}

function appendLogText(base, addition){
  const left = String(base || '');
  const right = String(addition || '');
  if (!left || !right || left.endsWith('\n') || right.startsWith('\n')) return left + right;
  return `${left}\n${right}`;
}

function mergeLogPayload(previous, next){
  if (!previous || !next) return next;
  if (next.progress) next.progress.received_at_ms = Date.now();
  const sameRun = previous.run_id && next.run_id && previous.run_id === next.run_id;
  const sameStdout = sameRun && previous.stdout_log && previous.stdout_log === next.stdout_log;
  const sameStderr = sameRun && previous.stderr_log && previous.stderr_log === next.stderr_log;
  if (sameStdout && next.stdout_append) {
    next.stdout_tail = trimTextLines(appendLogText(previous.stdout_tail, next.stdout_append), 200);
  }
  if (sameStderr && next.stderr_append) {
    next.stderr_tail = trimTextLines(appendLogText(previous.stderr_tail, next.stderr_append), 200);
  }
  if (sameStdout && !next.stdout_tail && !next.stdout_append) next.stdout_tail = previous.stdout_tail || '';
  if (sameStderr && !next.stderr_tail && !next.stderr_append) next.stderr_tail = previous.stderr_tail || '';
  // Snapshot reconciliation can provide an already reconstructed tail instead
  // of an append.  Apply the same established per-stream window used above so
  // a larger same-offset reply cannot bypass the 200-line live-tail bound.
  if (sameStdout && next.stdout_tail) next.stdout_tail = trimTextLines(next.stdout_tail, 200);
  if (sameStderr && next.stderr_tail) next.stderr_tail = trimTextLines(next.stderr_tail, 200);
  return next;
}


export {trimTextLines, appendLogText, mergeLogPayload};
