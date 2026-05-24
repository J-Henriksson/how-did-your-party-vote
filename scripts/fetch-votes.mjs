#!/usr/bin/env node
// Fetches all vote data for the last 3 Riksdag sessions and writes lib/votes.json.
// Run: node scripts/fetch-votes.mjs
// Requires Node 18+ (native fetch).

import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, "../lib/votes.json");
const BASE = "https://data.riksdagen.se";

// --- Queue + retry (mirrors lib/api.ts) ---

function makeQueue(limit) {
  let active = 0;
  const queue = [];
  return function run(task) {
    return new Promise((resolve, reject) => {
      const attempt = () => {
        active++;
        task().then(resolve, reject).finally(() => { active--; queue.shift()?.(); });
      };
      active < limit ? attempt() : queue.push(attempt);
    });
  };
}
const fetchQueue = makeQueue(6);

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetchQueue(() => fetch(url));
      if (res.ok || i === retries) return res;
      console.warn(`  HTTP ${res.status} (attempt ${i + 1}): ${url}`);
    } catch (e) {
      if (i === retries) throw e;
      console.warn(`  Fetch error (attempt ${i + 1}): ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 500 * (i + 1)));
  }
  throw new Error("fetch failed");
}

// --- Session helpers (mirrors lib/api.ts) ---

function currentSession() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return month >= 10 ? `${year}/${String(year + 1).slice(2)}` : `${year - 1}/${String(year).slice(2)}`;
}

function monthsAgo(n) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

function sessionStartDate(session) {
  return `${session.split("/")[0]}-10-01`;
}

function sessionEndDate(session) {
  const startYear = parseInt(session.split("/")[0]);
  const endYear = startYear + 1;
  if (new Date() < new Date(`${endYear}-07-01`)) return monthsAgo(2);
  return `${endYear}-04-30`;
}

function prevSessions(n) {
  const cur = currentSession();
  const sessions = [cur];
  let [y1] = cur.split("/").map(Number);
  for (let i = 1; i < n; i++) {
    y1--;
    sessions.push(`${y1}/${String(y1 + 1).slice(2)}`);
  }
  return sessions;
}

// --- API fetchers ---

async function fetchBetankanden(session) {
  const url = `${BASE}/dokumentlista/?doktyp=bet&rm=${session}&utformat=json&antal=100&from=${sessionStartDate(session)}&tom=${sessionEndDate(session)}`;
  const res = await fetchWithRetry(url);
  if (!res.ok) throw new Error(`dokumentlista ${session}: ${res.status}`);
  const data = await res.json();
  const docs = data?.dokumentlista?.dokument ?? [];
  const arr = Array.isArray(docs) ? docs : [docs];
  return arr.map(d => ({
    dok_id: d.dok_id,
    titel: d.titel ?? d.dok_id,
    datum: (d.datum ?? "").slice(0, 10),
  }));
}

async function fetchVotePoints(bet) {
  const url = `${BASE}/utskottsforslag/${bet.dok_id}/json`;
  const res = await fetchWithRetry(url);
  if (!res.ok) return [];
  const data = await res.json();
  const forslag = data?.utskottsforslag?.dokutskottsforslag?.utskottsforslag ?? [];
  const arr = Array.isArray(forslag) ? forslag : [forslag];
  return arr
    .filter(f => f.votering_id?.trim())
    .map(f => ({
      votering_id: f.votering_id.toUpperCase(),
      rubrik: f.rubrik ?? bet.titel,
      dok_id: bet.dok_id,
      titel: bet.titel,
      datum: bet.datum,
    }));
}

async function fetchBreakdown(votering_id) {
  const url = `${BASE}/votering/${votering_id}/json`;
  const res = await fetchWithRetry(url);
  if (!res.ok) throw new Error(`votering ${votering_id}: ${res.status}`);
  const data = await res.json();
  const records = data?.votering?.dokvotering?.votering ?? [];
  const arr = Array.isArray(records) ? records : [records];

  const breakdown = {};
  for (const r of arr.filter(r => r.avser === "sakfrågan")) {
    if (!breakdown[r.parti]) breakdown[r.parti] = { ja: 0, nej: 0, avstar: 0, franvarande: 0 };
    const b = breakdown[r.parti];
    if (r.rost === "Ja") b.ja++;
    else if (r.rost === "Nej") b.nej++;
    else if (r.rost === "Avstår") b.avstar++;
    else if (r.rost === "Frånvarande") b.franvarande++;
  }
  return breakdown;
}

// --- Main ---

async function fetchSession(session) {
  console.log(`\nSession ${session}`);
  const betankanden = await fetchBetankanden(session);
  console.log(`  ${betankanden.length} betänkanden`);

  const votes = [];
  let total = 0;

  await Promise.all(betankanden.map(async bet => {
    const points = await fetchVotePoints(bet);
    total += points.length;

    await Promise.all(points.map(async point => {
      try {
        const breakdown = await fetchBreakdown(point.votering_id);
        let ja = 0, nej = 0, avstar = 0, franvarande = 0;
        for (const b of Object.values(breakdown)) {
          ja += b.ja; nej += b.nej; avstar += b.avstar; franvarande += b.franvarande;
        }
        votes.push({
          votering_id: point.votering_id,
          beteckning: point.dok_id,
          rubrik: point.rubrik,
          titel: point.titel,
          datum: point.datum,
          ja, nej, avstar, franvarande,
          breakdown,
        });
      } catch (e) {
        console.warn(`  Skipping ${point.votering_id}: ${e.message}`);
      }
    }));
  }));

  console.log(`  ${votes.length}/${total} votes fetched`);
  // Sort by date descending
  votes.sort((a, b) => b.datum.localeCompare(a.datum));
  return votes;
}

async function main() {
  const sessions = prevSessions(3);
  const generatedAt = new Date().toISOString().slice(0, 10);
  console.log(`Fetching votes for sessions: ${sessions.join(", ")}`);
  console.log(`Generated at: ${generatedAt}`);

  const output = { generatedAt };
  for (const session of sessions) {
    output[session] = await fetchSession(session);
  }

  writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));
  const totalVotes = sessions.reduce((s, sess) => s + (output[sess]?.length ?? 0), 0);
  console.log(`\nWrote ${totalVotes} total votes to lib/votes.json`);
}

main().catch(e => { console.error(e); process.exit(1); });
