function longestOverlap(left: string, right: string): number {
  const limit = Math.min(left.length, right.length);
  for (let size = limit; size > 0; size -= 1) {
    if (left.endsWith(right.slice(0, size))) return size;
  }
  return 0;
}

export function mergeStreamingTranscript(previous: string, incoming: string): string {
  if (!incoming) return previous;
  if (!previous) return incoming.trimStart();
  if (incoming.startsWith(previous)) return incoming;
  if (previous.endsWith(incoming)) return previous;
  const overlap = longestOverlap(previous, incoming);
  if (overlap > 0) return previous + incoming.slice(overlap);
  const needsSpace = !/\s$/.test(previous) && !/^\s|^[,.!?…:;~)\]}가-힣]/.test(incoming);
  return previous + (needsSpace ? " " : "") + incoming;
}
