"use client";

import { useEffect, useState } from "react";
import type { AggregatedVote, AllPartyBreakdown, DocumentSummary } from "@/lib/types";
import { PARTIES, PARTY_MAP } from "@/constants/parties";
import { fetchAllPartyBreakdown, fetchDocumentSummary, extractProposerParty } from "@/lib/api";

interface VoteCardProps {
  vote: AggregatedVote;
  partyCode?: string;
  onSelect?: () => void;
  selected?: boolean;
}

function Pill({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <span
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ backgroundColor: color + "22", color }}
    >
      {label}
      <span className="font-bold">{count}</span>
    </span>
  );
}

function dominantOutcome(ja: number, nej: number, avstar: number): { label: string; color: string } | null {
  const active = ja + nej + avstar;
  if (active === 0) return null;
  if (ja > nej && ja > avstar) return { label: "Ja", color: "#22c55e" };
  if (nej > ja && nej > avstar) return { label: "Nej", color: "#ef4444" };
  if (avstar > ja && avstar > nej) return { label: "Avstår", color: "#f59e0b" };
  return null;
}

export default function VoteCard({ vote, partyCode, onSelect, selected = false }: VoteCardProps) {
  const [breakdown, setBreakdown] = useState<AllPartyBreakdown | null>(null);
  const [loadingBreakdown, setLoadingBreakdown] = useState(false);
  const [summary, setSummary] = useState<DocumentSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  useEffect(() => {
    if (!selected) return;
    if (!breakdown) {
      setLoadingBreakdown(true);
      fetchAllPartyBreakdown(vote.votering_id)
        .then(data => setBreakdown(data))
        .finally(() => setLoadingBreakdown(false));
    }
    if (summary === null) {
      setLoadingSummary(true);
      fetchDocumentSummary(vote.beteckning, vote.rubrik)
        .then(text => setSummary(text))
        .finally(() => setLoadingSummary(false));
    }
  }, [selected]);

  const party = partyCode ? PARTY_MAP[partyCode] : undefined;
  const active = vote.ja + vote.nej + vote.avstar;
  const jaPct = active > 0 ? (vote.ja / active) * 100 : 0;
  const nejPct = active > 0 ? (vote.nej / active) * 100 : 0;
  const avstarPct = active > 0 ? (vote.avstar / active) * 100 : 0;
  const dominant = dominantOutcome(vote.ja, vote.nej, vote.avstar);

  const formattedDate = vote.datum
    ? new Date(vote.datum).toLocaleDateString("sv-SE", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "";

  function handleExpand() {
    onSelect?.();
  }

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3 cursor-pointer select-none transition-colors duration-150"
      style={{
        backgroundColor: selected ? "#1e2133" : "#1a1d27",
        outline: selected ? "2px solid rgba(255,255,255,0.25)" : "none",
      }}
      onClick={handleExpand}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5 min-w-0">
          <p className="text-sm font-medium text-white leading-snug" title={vote.rubrik}>
            {vote.rubrik || vote.titel}
          </p>
          {vote.titel !== vote.rubrik && (
            <p className="text-xs text-gray-500 truncate" title={vote.titel}>{vote.titel}</p>
          )}
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs font-mono text-gray-600">{vote.beteckning}</span>
            {formattedDate && <span className="text-xs text-gray-600">{formattedDate}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
          {dominant && (
            <span
              className="text-xs font-bold px-2 py-0.5 rounded"
              style={{ color: dominant.color, backgroundColor: dominant.color + "22" }}
            >
              {dominant.label}
            </span>
          )}
          <a
            href={`https://data.riksdagen.se/dokument/${vote.beteckning}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="text-xs text-gray-600 hover:text-gray-300 transition-colors"
          >
            Läs mer →
          </a>
        </div>
      </div>

      {/* Collapsed: pills + bar give a quick numeric overview */}
      {!selected && (
        <>
          <div className="flex flex-wrap gap-2">
            <Pill label="Ja" count={vote.ja} color="#22c55e" />
            <Pill label="Nej" count={vote.nej} color="#ef4444" />
            <Pill label="Avstår" count={vote.avstar} color="#f59e0b" />
            <Pill label="Frånv." count={vote.franvarande} color="#6b7280" />
          </div>
          {active > 0 && (
            <div className="h-1.5 rounded-full overflow-hidden flex bg-white/5">
              <div style={{ width: `${jaPct}%`, backgroundColor: "#22c55e", transition: "width 0.4s" }} />
              <div style={{ width: `${nejPct}%`, backgroundColor: "#ef4444", transition: "width 0.4s" }} />
              <div style={{ width: `${avstarPct}%`, backgroundColor: "#f59e0b", transition: "width 0.4s" }} />
            </div>
          )}
        </>
      )}

      <p className="text-xs text-gray-600">
        {partyCode && (
          <><span style={{ color: party?.color ?? "#888" }}>{party?.name ?? partyCode}</span>{" · "}</>
        )}
        {vote.ja + vote.nej + vote.avstar + vote.franvarande} ledamöter röstade
        <span className="ml-2 text-gray-700">{selected ? "▲" : "▼"}</span>
      </p>

      {/* Expanded: summary + per-party breakdown */}
      {selected && (
        <div className="pt-3 border-t border-white/10 flex flex-col gap-4">

          {/* 1. What the vote is about */}
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-xs text-gray-600 uppercase tracking-wide mb-1.5">Utskottets bedömning</p>
              {loadingSummary ? (
                <div className="flex flex-col gap-1.5">
                  <div className="h-3 w-full rounded animate-pulse bg-white/10" />
                  <div className="h-3 w-4/5 rounded animate-pulse bg-white/10" />
                  <div className="h-3 w-3/5 rounded animate-pulse bg-white/10" />
                </div>
              ) : summary?.committee ? (
                <p className="text-sm text-gray-200 leading-relaxed">{summary.committee}</p>
              ) : (
                <p className="text-xs text-gray-600 italic">Ingen bedömning tillgänglig.</p>
              )}
            </div>
            {!loadingSummary && summary?.motion && (
              <div>
                <p className="text-xs text-gray-600 uppercase tracking-wide mb-1.5">Ursprunglig motion</p>
                <p className="text-xs text-gray-400 leading-relaxed">{summary.motion}</p>
              </div>
            )}
          </div>

          {/* 1b. Parliamentary process context */}
          {!loadingSummary && (() => {
            const proposerParty = summary?.motion ? extractProposerParty(summary.motion) : null;
            const overallJa = vote.ja > vote.nej;
            const pb = proposerParty && breakdown ? breakdown[proposerParty] : null;
            const proposerOutcome = pb ? dominantOutcome(pb.ja, pb.nej, pb.avstar) : null;
            const paradox = proposerOutcome && (
              (overallJa && proposerOutcome.label !== "Ja") ||
              (!overallJa && proposerOutcome.label !== "Nej")
            );

            if (paradox) {
              const proposerName = PARTY_MAP[proposerParty!]?.name ?? proposerParty;
              const theirVote = proposerOutcome!.label;
              return (
                <p
                  className="text-xs rounded p-2.5 leading-relaxed"
                  style={{ backgroundColor: "#f59e0b22", color: "#f59e0b" }}
                >
                  ⚠ {proposerName} föreslog detta, men röstade {theirVote} — utskottets förslag kan skilja sig från ursprungsmotionen.
                </p>
              );
            }

            return (
              <p className="text-xs text-gray-500 italic leading-relaxed">
                Omröstningarna gäller utskottets förslag, inte ursprungsmotionen. En motion kan ha ändrats av utskottet innan omröstningen.
              </p>
            );
          })()}

          {/* 2. How parties voted */}
          <div>
            <p className="text-xs text-gray-600 uppercase tracking-wide mb-2">Alla partiers röster</p>
            {loadingBreakdown ? (
              <div className="flex flex-col gap-2">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-3 rounded animate-pulse bg-white/10" />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {PARTIES.map(p => {
                  const b = breakdown?.[p.code];
                  if (!b) return null;
                  const total = b.ja + b.nej + b.avstar;
                  if (total === 0) return null;
                  const d = dominantOutcome(b.ja, b.nej, b.avstar);
                  return (
                    <div key={p.code} className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: p.color }}
                      />
                      <span className="text-xs text-gray-400 w-32 truncate flex-shrink-0">{p.name}</span>
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden flex bg-white/5">
                        <div style={{ width: `${(b.ja / total) * 100}%`, backgroundColor: "#22c55e" }} />
                        <div style={{ width: `${(b.nej / total) * 100}%`, backgroundColor: "#ef4444" }} />
                        <div style={{ width: `${(b.avstar / total) * 100}%`, backgroundColor: "#f59e0b" }} />
                      </div>
                      {d && (
                        <span className="text-xs font-semibold w-8 text-right flex-shrink-0" style={{ color: d.color }}>
                          {d.label}
                        </span>
                      )}
                      <span className="text-xs text-gray-700 w-20 text-right flex-shrink-0">
                        {b.ja}J · {b.nej}N · {b.avstar}A
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
