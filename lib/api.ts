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

const summaryCache = new Map<string, string>();
const docHtmlCache = new Map<string, Promise<string>>();

function fetchDocHtml(dok_id: string): Promise<string> {
  if (!docHtmlCache.has(dok_id)) {
    const p = fetch(`${BASE}/dokument/${dok_id}/json`)
      .then(res => res.ok ? res.json() : null)
      .then(data => (data?.dokumentstatus?.dokument?.html as string) ?? "")
      .catch(() => "");
    docHtmlCache.set(dok_id, p);
  }
  return docHtmlCache.get(dok_id)!;
}

export async function fetchDocumentSummary(dok_id: string, rubrik: string): Promise<string> {
  const cacheKey = `${dok_id}:${rubrik}`;
  if (summaryCache.has(cacheKey)) return summaryCache.get(cacheKey)!;

  const html = await fetchDocHtml(dok_id);
  const doc = new DOMParser().parseFromString(html, "text/html");
  const text = extractSectionSummary(doc, rubrik);

  summaryCache.set(cacheKey, text);
  return text;
}

function truncateSentences(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen);
  const last = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return last > 60 ? cut.slice(0, last + 1) : cut.slice(0, cut.lastIndexOf(" ")) + "…";
}

function normalize(s: string): string {
  return s.replace(/­/g, "").trim().toLowerCase();
}



// Within a section's elements, find a R3/R4 subsection heading by name and return its content
function extractSubsection(section: Element[], subheading: string): string {
  for (let i = 0; i < section.length; i++) {
    const el = section[i];
    const headingEl =
      (el.matches?.(".R3,.R4") && normalize(el.textContent ?? "") === subheading ? el : null) ??
      el.querySelector?.(".R3,.R4");
    if (!headingEl || normalize(headingEl.textContent ?? "") !== subheading) continue;

    // Grab first content paragraph, truncated to ~2 sentences
    for (let j = i + 1; j < section.length; j++) {
      const next = section[j];
      if (next.matches?.(".R3,.R4") || next.querySelector?.(".R3,.R4")) break;
      const candidates = next.matches?.(".NormalIndent,p")
        ? [next]
        : Array.from(next.querySelectorAll(".NormalIndent, p"));
      for (const p of candidates) {
        const t = p.textContent?.trim();
        if (t && t.length > 20) return truncateSentences(t, 280);
      }
    }
  }
  return "";
}

function extractSectionSummary(doc: Document, rubrik: string): string {
  const target = normalize(rubrik);

  const headings = Array.from(doc.querySelectorAll("h2"));
  const heading =
    headings.find(h => normalize(h.textContent ?? "") === target) ??
    headings.find(h => normalize(h.textContent ?? "").includes(target)) ??
    headings.find(h => target.includes(normalize(h.textContent ?? "").replace(/\s+/g, " ")));

  if (heading) {
    // h2 may be wrapped in a <div> container — traverse from that wrapper
    const anchor = heading.parentElement?.tagName === "DIV" ? heading.parentElement : heading;
    const section: Element[] = [];
    let el = anchor.nextElementSibling;
    while (el && !el.matches("h2") && !el.querySelector("h2")) {
      section.push(el);
      el = el.nextElementSibling;
    }

    // What was proposed — try singular and plural subsection headings
    const motText =
      extractSubsection(section, "motionen") ||
      extractSubsection(section, "motionerna") ||
      extractSubsection(section, "yrkandena");
    if (motText) return motText;

    // Korthet box (brief outcome statement)
    const korthText = section
      .flatMap(el => Array.from(el.querySelectorAll(".Normalruta")))
      .map(p => p.textContent?.trim())
      .filter(Boolean)
      .join(" ");
    if (korthText) return korthText;

    // Last resort: first substantial content paragraph in the section
    for (const el of section) {
      const candidates = el.matches?.(".NormalIndent,p") ? [el] : Array.from(el.querySelectorAll(".NormalIndent, p"));
      for (const p of candidates) {
        const t = p.textContent?.trim();
        if (t && t.length > 40) return truncateSentences(t, 280);
      }
    }
  }

  // No h2 match — try R3/R4 subsection heading (some betänkanden nest topics under broader h2s)
  const subHeadings = Array.from(doc.querySelectorAll(".R3, .R4"));
  const subHeading = subHeadings.find(el => normalize(el.textContent ?? "") === target);
  if (subHeading) {
    let el = subHeading.nextElementSibling;
    while (el && !el.matches(".R3,.R4,.R2") && !el.querySelector?.(".R3,.R4")) {
      const t = el.textContent?.trim();
      if (t && t.length > 40) return truncateSentences(t, 280);
      el = el.nextElementSibling;
    }
  }

  // Final fallback: betänkande-level Sammanfattning
  const samHeading = doc.querySelector(".Sammanfattning");
  if (samHeading) {
    let el = samHeading.nextElementSibling;
    while (el && el.tagName === "P" && !el.className) {
      const t = el.textContent?.trim();
      if (t) return truncateSentences(t, 280);
      el = el.nextElementSibling;
    }
  }

  return "";
}

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
    let totalPoints = 0;
    let completedPoints = 0;
    let pointsFinalised = false;

    const checkDone = () => {
      if (pointsFinalised && completedPoints === totalPoints) {
        allVotesCache.set(session, collected);
        // Only notify the UI if the user hasn't switched away
        if (!signal.aborted) onDone();
      }
    };

    const startBreakdownFetch = (point: VotePoint) => {
      fetchAllPartyBreakdown(point.votering_id)
        .then(breakdown => {
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
          if (!signal.aborted) onVote(vote);
        })
        .catch(() => {})
        .finally(() => { completedPoints++; checkDone(); });
    };

    try {
      const betankanden = await fetchBetankanden(session);

      // Always process everything regardless of abort so the cache is fully
      // populated — switching back to this session will then be instant.
      await Promise.all(betankanden.map(async bet => {
        const points = await fetchVotePoints(bet);
        totalPoints += points.length;
        for (const point of points) startBreakdownFetch(point);
      }));

      pointsFinalised = true;
      if (totalPoints === 0) { if (!signal.aborted) onDone(); return; }
      checkDone();
    } catch { if (!signal.aborted) onDone(); }
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
