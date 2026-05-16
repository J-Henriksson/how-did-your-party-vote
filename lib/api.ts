import type { AggregatedVote } from "./types";

const BASE = "https://data.riksdagen.se";

function currentSession(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  // Riksdag session runs Oct–Jun, e.g. "2025/26" starts Oct 2025
  return month >= 10 ? `${year}/${String(year + 1).slice(2)}` : `${year - 1}/${String(year).slice(2)}`;
}

function monthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
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

function sessionStart(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  // Riksdag session starts October — use Oct 1 of starting year
  const startYear = month >= 10 ? year : year - 1;
  return `${startYear}-10-01`;
}

async function fetchBetankanden(): Promise<Betankande[]> {
  const rm = currentSession();
  // Use tom = 60 days ago to skip end-of-session acklamation period
  // where no formal votes are held
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
  const forslag =
    data?.utskottsforslag?.dokutskottsforslag?.utskottsforslag ?? [];
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

async function fetchVoteForParty(
  point: VotePoint,
  party: string
): Promise<AggregatedVote | null> {
  const url = `${BASE}/votering/${point.votering_id}/json`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const records = data?.votering?.dokvotering?.votering ?? [];
  const arr: Array<Record<string, string>> = Array.isArray(records)
    ? records
    : [records];

  const partyVotes = arr.filter(
    r => r.parti === party && r.avser === "sakfrågan"
  );
  if (partyVotes.length === 0) return null;

  const agg: AggregatedVote = {
    votering_id: point.votering_id,
    beteckning: point.dok_id,
    rubrik: point.rubrik,
    titel: point.titel,
    datum: point.datum,
    ja: 0,
    nej: 0,
    avstar: 0,
    franvarande: 0,
  };
  for (const r of partyVotes) {
    if (r.rost === "Ja") agg.ja++;
    else if (r.rost === "Nej") agg.nej++;
    else if (r.rost === "Avstår") agg.avstar++;
    else if (r.rost === "Frånvarande") agg.franvarande++;
  }
  return agg;
}

export function streamPartyVotes(
  party: string,
  onVote: (vote: AggregatedVote) => void,
  onDone: () => void,
  signal: AbortSignal
): void {
  (async () => {
    try {
      const betankanden = await fetchBetankanden();
      if (signal.aborted) return;

      const votePointArrays = await Promise.all(betankanden.map(fetchVotePoints));
      if (signal.aborted) return;

      const allPoints = votePointArrays.flat();
      if (allPoints.length === 0) { onDone(); return; }

      let remaining = allPoints.length;
      const finish = () => { if (--remaining === 0) onDone(); };

      for (const point of allPoints) {
        fetchVoteForParty(point, party)
          .then(vote => {
            if (!signal.aborted && vote) onVote(vote);
            finish();
          })
          .catch(finish);
      }
    } catch {
      onDone();
    }
  })();
}
