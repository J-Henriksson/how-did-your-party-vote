import type { AggregatedVote, AllPartyBreakdown, DocumentSummary, VotePoint } from "./types";
import prebuiltSummaries from "./summaries.json";
import prebuiltVotes from "./votes.json";

const BASE = "https://data.riksdagen.se";

function makeQueue(limit: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  return function run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const attempt = () => {
        active++;
        task().then(resolve, reject).finally(() => { active--; queue.shift()?.(); });
      };
      active < limit ? attempt() : queue.push(attempt);
    });
  };
}
const fetchQueue = makeQueue(8);

async function fetchWithRetry(url: string, retries = 2): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetchQueue(() => fetch(url));
      if (res.ok || i === retries) return res;
    } catch (e) {
      if (i === retries) throw e;
    }
    await new Promise(r => setTimeout(r, 300 * (i + 1)));
  }
  throw new Error("fetch failed");
}

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

async function fetchBetankanden(session: string, fromDate?: string): Promise<Betankande[]> {
  const from = fromDate ?? sessionStartDate(session);
  const url = `${BASE}/dokumentlista/?doktyp=bet&rm=${session}&utformat=json&antal=100&from=${from}&tom=${sessionEndDate(session)}`;
  const res = await fetchWithRetry(url);
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
  const res = await fetchWithRetry(url);
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

const summaryCache = new Map<string, DocumentSummary>();
const docHtmlCache = new Map<string, Promise<string>>();

function fetchDocHtml(dok_id: string): Promise<string> {
  if (!docHtmlCache.has(dok_id)) {
    const p = fetchWithRetry(`${BASE}/dokument/${dok_id}/json`)
      .then(res => res.ok ? res.json() : null)
      .then(data => (data?.dokumentstatus?.dokument?.html as string) ?? "")
      .catch(() => "");
    docHtmlCache.set(dok_id, p);
  }
  return docHtmlCache.get(dok_id)!;
}

export function extractProposerParty(summary: string): string | null {
  // "av [Name] m.fl. (V)" — most common form
  let m = summary.match(/\bav\b[^(]{1,80}\(([A-ZÅÄÖ]{1,3})\)/);
  if (m) return m[1];
  // "[Name] m.fl. (V) efterlyser/föreslår…" — name is subject, no "av"
  m = summary.match(/^[^(]{1,80}m\.fl\.\s*\(([A-ZÅÄÖ]{1,3})\)/);
  if (m) return m[1];
  // Last resort: first party code in parens in the opening sentence
  const first = summary.split(/[.!?]/)[0];
  m = first.match(/\(([A-ZÅÄÖ]{1,3})\)/);
  return m ? m[1] : null;
}

export async function fetchDocumentSummary(votering_id: string, dok_id: string, rubrik: string): Promise<DocumentSummary> {
  const prebuilt = (prebuiltSummaries as Record<string, string>)[votering_id];
  if (prebuilt) return { committee: prebuilt, motion: "" };

  const cacheKey = `${dok_id}:${rubrik}`;
  if (summaryCache.has(cacheKey)) return summaryCache.get(cacheKey)!;

  const html = await fetchDocHtml(dok_id);
  const doc = new DOMParser().parseFromString(html, "text/html");
  const result = extractBothSections(doc, rubrik);

  summaryCache.set(cacheKey, result);
  return result;
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



const PARA_SEL = ".NormalIndent, .Brödtext, .Brodtext, .Normal, p";

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
      const candidates = next.matches?.(PARA_SEL)
        ? [next]
        : Array.from(next.querySelectorAll(PARA_SEL));
      for (const p of candidates) {
        const t = p.textContent?.trim();
        if (t && t.length > 20) return truncateSentences(t, 280);
      }
    }
  }
  return "";
}

function extractBothSections(doc: Document, rubrik: string): DocumentSummary {
  const target = normalize(rubrik);

  const headings = Array.from(doc.querySelectorAll("h2"));
  const heading =
    headings.find(h => normalize(h.textContent ?? "") === target) ??
    headings.find(h => normalize(h.textContent ?? "").includes(target)) ??
    headings.find(h => target.includes(normalize(h.textContent ?? "").replace(/\s+/g, " "))) ??
    headings.find(h => target.length >= 20 && normalize(h.textContent ?? "").replace(/\s+/g, " ").startsWith(target.slice(0, 20)));

  if (heading) {
    const anchor = heading.parentElement?.tagName === "DIV" ? heading.parentElement : heading;
    const section: Element[] = [];
    let el = anchor.nextElementSibling;
    while (el && !el.matches("h2") && !el.querySelector("h2")) {
      section.push(el);
      el = el.nextElementSibling;
    }

    const motText =
      extractSubsection(section, "motionen") ||
      extractSubsection(section, "motionerna") ||
      extractSubsection(section, "yrkandena");

    const committeeText =
      extractSubsection(section, "utskottets ställningstagande") ||
      extractSubsection(section, "utskottets bedömning") ||
      extractSubsection(section, "utskottets förslag");

    // Normalruta = "i korthet" box — genuine committee summary, use when no explicit subsection
    const korthText = committeeText ? "" : section
      .flatMap(el => Array.from(el.querySelectorAll(".Normalruta")))
      .map(p => p.textContent?.trim())
      .filter(Boolean)
      .join(" ");

    if (committeeText || korthText || motText) {
      return { motion: motText, committee: committeeText || korthText };
    }

    // Last resort: first substantial paragraph — route to committee (more useful than motion slot)
    for (const el of section) {
      const candidates = el.matches?.(PARA_SEL) ? [el] : Array.from(el.querySelectorAll(PARA_SEL));
      for (const p of candidates) {
        const t = p.textContent?.trim();
        if (t && t.length > 40) return { motion: motText, committee: truncateSentences(t, 280) };
      }
    }
  }

  // Document-wide Normalruta ("i korthet") — present in most betänkanden, reliable committee summary
  const allNormalruta = Array.from(doc.querySelectorAll(".Normalruta"))
    .map(p => p.textContent?.trim())
    .filter((t): t is string => !!t && t.length > 40);
  if (allNormalruta.length > 0) {
    return { motion: "", committee: truncateSentences(allNormalruta[0], 280) };
  }

  // No h2 match — try R3/R4 subsection heading (motion slot, provenance unclear)
  const subHeadings = Array.from(doc.querySelectorAll(".R3, .R4"));
  const subHeading = subHeadings.find(el => normalize(el.textContent ?? "") === target);
  if (subHeading) {
    let el = subHeading.nextElementSibling;
    while (el && !el.matches(".R3,.R4,.R2") && !el.querySelector?.(".R3,.R4")) {
      const t = el.textContent?.trim();
      if (t && t.length > 40) return { motion: truncateSentences(t, 280), committee: "" };
      el = el.nextElementSibling;
    }
  }

  // Final fallback: betänkande-level Sammanfattning (document-level, OK as committee)
  const samHeading = doc.querySelector(".Sammanfattning");
  if (samHeading) {
    let el = samHeading.nextElementSibling;
    while (el && el.tagName === "P" && !el.className) {
      const t = el.textContent?.trim();
      if (t) return { motion: "", committee: truncateSentences(t, 280) };
      el = el.nextElementSibling;
    }
  }

  return { motion: "", committee: "" };
}

export async function fetchAllPartyBreakdown(votering_id: string): Promise<AllPartyBreakdown> {
  if (detailCache.has(votering_id)) return detailCache.get(votering_id)!;

  const url = `${BASE}/votering/${votering_id}/json`;
  const res = await fetchWithRetry(url);
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
    const prebuilt = (prebuiltVotes as Record<string, unknown>)[session] as Array<
      AggregatedVote & { breakdown: AllPartyBreakdown }
    > | undefined;

    const collected: AggregatedVote[] = [];

    if (prebuilt?.length) {
      // Seed caches from prebuilt data so the UI renders instantly
      for (const entry of prebuilt) {
        const { breakdown, ...vote } = entry;
        detailCache.set(vote.votering_id, breakdown);
        collected.push(vote);
      }
      allVotesCache.set(session, collected);
      setTimeout(() => {
        if (signal.aborted) return;
        for (const v of collected) onVote(v);
      }, 0);

      // Fetch only betänkanden newer than the snapshot to pick up recent votes
      const generatedAt = (prebuiltVotes as unknown as Record<string, string>).generatedAt;
      try {
        const newBets = await fetchBetankanden(session, generatedAt);
        const newPoints: VotePoint[] = (await Promise.all(newBets.map(fetchVotePoints))).flat()
          .filter(p => !detailCache.has(p.votering_id));

        if (newPoints.length === 0) {
          if (!signal.aborted) onDone();
          return;
        }

        let remaining = newPoints.length;
        const finish = () => { if (--remaining === 0 && !signal.aborted) onDone(); };

        for (const point of newPoints) {
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
              allVotesCache.set(session, collected);
              if (!signal.aborted) onVote(vote);
            })
            .catch(() => {})
            .finally(finish);
        }
      } catch {
        if (!signal.aborted) onDone();
      }
      return;
    }

    // No prebuilt data — full fetch fallback
    let totalPoints = 0;
    let completedPoints = 0;
    let pointsFinalised = false;

    const checkDone = () => {
      if (pointsFinalised && completedPoints === totalPoints) {
        allVotesCache.set(session, collected);
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

  // If allVotesCache is pre-warmed (from prebuilt JSON), filter instantly from it
  if (allVotesCache.has(session)) {
    const all = allVotesCache.get(session)!;
    const filtered: AggregatedVote[] = [];
    for (const v of all) {
      const b = detailCache.get(v.votering_id)?.[party];
      if (b && (b.ja + b.nej + b.avstar + b.franvarande) > 0) {
        filtered.push({ ...v, ja: b.ja, nej: b.nej, avstar: b.avstar, franvarande: b.franvarande });
      }
    }
    streamCache.set(cacheKey, filtered);
    setTimeout(() => {
      if (signal.aborted) return;
      for (const v of filtered) onVote(v);
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
