// DJ rotation: requesters take turns, one song each per round. Whoever was served least
// recently goes first, so a new request never waits behind someone's whole list.

export interface QueuedRequest {
  id: number;
  playerId: string;
  requestedAt: string;
}

export function fairOrder<T extends QueuedRequest>(waiting: T[], lastServed: Map<string, string>, djRotation = true): T[] {
  const byTime = [...waiting].sort((a, b) => a.requestedAt.localeCompare(b.requestedAt) || a.id - b.id);
  if (!djRotation) return byTime;
  const buckets = new Map<string, T[]>();
  for (const r of byTime) buckets.set(r.playerId, [...(buckets.get(r.playerId) ?? []), r]);
  const turnOrder = [...buckets.keys()].sort((a, b) => {
    const servedA = lastServed.get(a) ?? '';
    const servedB = lastServed.get(b) ?? '';
    if (servedA !== servedB) return servedA.localeCompare(servedB);
    return buckets.get(a)![0]!.requestedAt.localeCompare(buckets.get(b)![0]!.requestedAt);
  });
  const result: T[] = [];
  for (let round = 0; result.length < byTime.length; round++) {
    for (const player of turnOrder) {
      const next = buckets.get(player)![round];
      if (next) result.push(next);
    }
  }
  return result;
}
