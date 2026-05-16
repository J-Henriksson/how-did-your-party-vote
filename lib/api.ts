import type { AggregatedVote, AllPartyBreakdown, VotePoint } from "./types";

const BASE = "https://data.riksdagen.se";

export function currentSession(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return month >= 10 ? `${year}/${String(year + 1).slice(2)}` : `${year - 1}/${String(year).slice(2)}`;
}

function monthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

function sessionStartDate(session: string): string {
  return `${session.split("/")[0]}-10-01`;
}

function sessionEndDate(session: string): string {
  const startYear = parseInt(session.split("/")[0]);
  const endYear = startYear + 1;
  // If the session's closing (July of end year) is in the future, it's the current session
  if (new Date() < new Date(`${endYear}-07-01`)) return monthsAgo(2);
  // Past session: cut off before end-of-session acklamation period
  return `${endYear}-04-30`;
}

interface Betankande {
  dok_id: string;
  titel: string;
  datum: string;
}

async function fetchBetankanden(session: string): Promise<Betankande[]> {
  const url = `${BASE}/dokumentlista/?doktyp=bet&rm=${session}&utformat=json&antal=100&from=${sessionStartDate(session)}&tom=${sessionEndDate(session)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`dokumentlista: ${res.status}`);
  const data = await res.json();
  const docs = data?.dokumentlista?.dokument ?? [];
  const arr = Array.isArray(docs) ? docs : [docs];
  return arr.map((d: Record<string, string>) => ({
    dok_id: d.dok_id,
    titel: d.titel ?? d.dok_id,
    datum: (d.datum ?? "").slice(0, 10),
  }));
}

async function fetchVotePoints(bet: Betankande): Promise<VotePoint[]> {
  const url = `${BASE}/utskottsforslag/${bet.dok_id}/json`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  const forslag = data?.utskottsforslag?.dokutskottsforslag?.utskottsforslag ?? [];
  const arr = Array.isArray(forslag) ? forslag : [forslag];
  return arr
    .filter((f: Record<string, string>) => f.votering_id?.trim())
    .map((f: Record<string, string>) => ({
      votering_id: f.votering_id.toUpperCase(),
      rubrik: f.rubrik ?? bet.titel,
      dok_id: bet.dok_id,
      titel: bet.titel,
      datum: bet.datum,
    }));
}

// Cache for full all-party vote breakdowns, keyed by votering_id
const detailCache = new Map<string, AllPartyBreakdown>();

export async function fetchAllPartyBreakdown(votering_id: string): Promise<AllPartyBreakdown> {
  if (detailCache.has(votering_id)) return detailCache.get(votering_id)!;

  const url = `${BASE}/votering/${votering_id}/json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`votering: ${res.status}`);
  const data = await res.json();
  const records = data?.votering?.dokvotering?.votering ?? [];
  const arr: Array<Record<string, string>> = Array.isArray(records) ? records : [records];

  const breakdown: AllPartyBreakdown = {};
  for (const r of arr.filter(r => r.avser === "sakfrågan")) {
    if (!breakdown[r.parti]) breakdown[r.parti] = { ja: 0, nej: 0, avstar: 0, franvarande: 0 };
    const b = breakdown[r.parti];
    if (r.rost === "Ja") b.ja++;
    else if (r.rost === "Nej") b.nej++;
    else if (r.rost === "Avstår") b.avstar++;
    else if (r.rost === "Frånvarande") b.franvarande++;
  }
  detailCache.set(votering_id, breakdown);
  return breakdown;
}

async function fetchVoteForParty(point: VotePoint, party: string): Promise<AggregatedVote | null> {
  const breakdown = await fetchAllPartyBreakdown(point.votering_id);
  const b = breakdown[party];
  if (!b) return null;

  return {
    votering_id: point.votering_id,
    beteckning: point.dok_id,
    rubrik: point.rubrik,
    titel: point.titel,
    datum: point.datum,
    ja: b.ja,
    nej: b.nej,
    avstar: b.avstar,
    franvarande: b.franvarande,
  };
}

// Caches keyed by session
const streamCache = new Map<string, AggregatedVote[]>();
const allVotesCache = new Map<string, AggregatedVote[]>();

export function streamAllVotes(
  session: string,
  onVote: (vote: AggregatedVote) => void,
  onDone: () => void,
  signal: AbortSignal
): void {
  if (allVotesCache.has(session)) {
    const cached = allVotesCache.get(session)!;
    setTimeout(() => {
      if (signal.aborted) return;
      for (const v of cached) onVote(v);
      onDone();
    }, 0);
    return;
  }

  (async () => {
    const collected: AggregatedVote[] = [];
    try {
      const betankanden = await fetchBetankanden(session);
      if (signal.aborted) return;
      const votePointArrays = await Promise.all(betankanden.map(fetchVotePoints));
      if (signal.aborted) return;
      const allPoints = votePointArrays.flat();
      if (allPoints.length === 0) { onDone(); return; }

      let remaining = allPoints.length;
      const finish = () => { if (--remaining === 0) { allVotesCache.set(session, collected); onDone(); } };

      for (const point of allPoints) {
        fetchAllPartyBreakdown(point.votering_id)
          .then(breakdown => {
            if (signal.aborted) { finish(); return; }
            let ja = 0, nej = 0, avstar = 0, franvarande = 0;
            for (const b of Object.values(breakdown)) {
              ja += b.ja; nej += b.nej; avstar += b.avstar; franvarande += b.franvarande;
            }
            const vote: AggregatedVote = {
              votering_id: point.votering_id,
              beteckning: point.dok_id,
              rubrik: point.rubrik,
              titel: point.titel,
              datum: point.datum,
              ja, nej, avstar, franvarande,
            };
            collected.push(vote);
            onVote(vote);
            finish();
          })
          .catch(finish);
      }
    } catch { onDone(); }
  })();
}

export function streamPartyVotes(
  party: string,
  session: string,
  onVote: (vote: AggregatedVote) => void,
  onDone: () => void,
  signal: AbortSignal
): void {
  const cacheKey = `${session}:${party}`;
  if (streamCache.has(cacheKey)) {
    const cached = streamCache.get(cacheKey)!;
    setTimeout(() => {
      if (signal.aborted) return;
      for (const v of cached) onVote(v);
      onDone();
    }, 0);
    return;
  }

  (async () => {
    const collected: AggregatedVote[] = [];
    try {
      const betankanden = await fetchBetankanden(session);
      if (signal.aborted) return;

      const votePointArrays = await Promise.all(betankanden.map(fetchVotePoints));
      if (signal.aborted) return;

      const allPoints = votePointArrays.flat();
      if (allPoints.length === 0) { onDone(); return; }

      let remaining = allPoints.length;
      const finish = () => {
        if (--remaining === 0) {
          streamCache.set(cacheKey, collected);
          onDone();
        }
      };

      for (const point of allPoints) {
        fetchVoteForParty(point, party)
          .then(vote => {
            if (!signal.aborted && vote) {
              collected.push(vote);
              onVote(vote);
            }
            finish();
          })
          .catch(finish);
      }
    } catch {
      onDone();
    }
  })();
}
