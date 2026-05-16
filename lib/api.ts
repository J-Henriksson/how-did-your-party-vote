import type { AggregatedVote, AllPartyBreakdown } from "./types";

const BASE = "https://data.riksdagen.se";

function currentSession(): string {
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

function sessionStart(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const startYear = month >= 10 ? year : year - 1;
  return `${startYear}-10-01`;
}

interface Betankande {
  dok_id: string;
  titel: string;
  datum: string;
}

interface VotePoint {
  votering_id: string;
  rubrik: string;
  dok_id: string;
  titel: string;
  datum: string;
}

async function fetchBetankanden(): Promise<Betankande[]> {
  const rm = currentSession();
  const tom = monthsAgo(2);
  const from = sessionStart();
  const url = `${BASE}/dokumentlista/?doktyp=bet&rm=${rm}&utformat=json&antal=20&from=${from}&tom=${tom}`;
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

// Cache of streamed results per party — makes re-selection instant
const streamCache = new Map<string, AggregatedVote[]>();

export function streamPartyVotes(
  party: string,
  onVote: (vote: AggregatedVote) => void,
  onDone: () => void,
  signal: AbortSignal
): void {
  if (streamCache.has(party)) {
    const cached = streamCache.get(party)!;
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
      const betankanden = await fetchBetankanden();
      if (signal.aborted) return;

      const votePointArrays = await Promise.all(betankanden.map(fetchVotePoints));
      if (signal.aborted) return;

      const allPoints = votePointArrays.flat();
      if (allPoints.length === 0) { onDone(); return; }

      let remaining = allPoints.length;
      const finish = () => {
        if (--remaining === 0) {
          streamCache.set(party, collected);
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
