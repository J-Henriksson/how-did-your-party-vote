"use client";

import { useEffect, useMemo, useState } from "react";
import { streamPartyVotes } from "@/lib/api";
import type { AggregatedVote } from "@/lib/types";
import { PARTY_MAP } from "@/constants/parties";
import { COMMITTEES, committeeFromDokId } from "@/constants/committees";
import VoteCard from "./VoteCard";

interface VoteListProps {
  partyCode: string;
}

export default function VoteList({ partyCode }: VoteListProps) {
  const [votes, setVotes] = useState<AggregatedVote[]>([]);
  const [done, setDone] = useState(false);
  const [query, setQuery] = useState("");
  const [activeCommittees, setActiveCommittees] = useState<Set<string>>(new Set());

  useEffect(() => {
    setVotes([]);
    setDone(false);
    setQuery("");
    setActiveCommittees(new Set());
    const controller = new AbortController();

    streamPartyVotes(
      partyCode,
      vote => {
        setVotes(prev => {
          const next = [...prev, vote];
          next.sort((a, b) => b.datum.localeCompare(a.datum));
          return next;
        });
      },
      () => setDone(true),
      controller.signal
    );

    return () => controller.abort();
  }, [partyCode]);

  // Committees present in the loaded votes, in the order they appear
  const availableCommittees = useMemo(() => {
    const seen = new Map<string, string>();
    for (const v of votes) {
      const code = committeeFromDokId(v.beteckning);
      if (!seen.has(code)) seen.set(code, COMMITTEES[code] ?? code);
    }
    return [...seen.entries()].map(([code, label]) => ({ code, label }));
  }, [votes]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return votes.filter(v => {
      if (activeCommittees.size > 0 && !activeCommittees.has(committeeFromDokId(v.beteckning))) return false;
      if (q && !v.rubrik.toLowerCase().includes(q) && !v.titel.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [votes, query, activeCommittees]);

  function toggleCommittee(code: string) {
    setActiveCommittees(prev => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  }

  const party = PARTY_MAP[partyCode];
  const loading = !done && votes.length === 0;

  return (
    <section className="w-full max-w-7xl mx-auto mt-10 px-6">
      {/* Header */}
      <div className="flex items-baseline gap-3 mb-1">
        <h2 className="text-xl font-semibold" style={{ color: party?.color ?? "#fff" }}>
          {party?.name ?? partyCode}
        </h2>
        {!done && <span className="text-xs text-gray-500 animate-pulse">laddar voteringar…</span>}
        {done && votes.length > 0 && (
          <span className="text-xs text-gray-600">{filtered.length} / {votes.length} voteringar</span>
        )}
      </div>
      <p className="text-sm text-gray-500 mb-5">Riksmötet 2025/26</p>

      {/* Search + filters */}
      {votes.length > 0 && (
        <div className="flex flex-col gap-3 mb-6">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Sök bland voteringar…"
            className="w-full max-w-sm rounded-lg px-3 py-2 text-sm bg-white/5 text-white placeholder-gray-600 border border-white/10 focus:outline-none focus:border-white/25"
          />
          {availableCommittees.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {availableCommittees.map(({ code, label }) => {
                const active = activeCommittees.has(code);
                return (
                  <button
                    key={code}
                    onClick={() => toggleCommittee(code)}
                    className="px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors duration-150"
                    style={{
                      backgroundColor: active ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)",
                      color: active ? "#fff" : "#6b7280",
                      border: `1px solid ${active ? "rgba(255,255,255,0.25)" : "transparent"}`,
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Skeletons on initial load */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl p-4 h-32 animate-pulse" style={{ backgroundColor: "#1a1d27" }} />
          ))}
        </div>
      )}

      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((vote, i) => (
            <div key={vote.votering_id} className="card-appear" style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}>
              <VoteCard vote={vote} partyCode={partyCode} />
            </div>
          ))}
          {!done && Array.from({ length: 3 }).map((_, i) => (
            <div key={`skel-${i}`} className="rounded-xl p-4 h-32 animate-pulse" style={{ backgroundColor: "#1a1d27" }} />
          ))}
        </div>
      )}

      {done && filtered.length === 0 && votes.length > 0 && (
        <p className="text-gray-500 text-sm">Inga voteringar matchar filtret.</p>
      )}
      {done && votes.length === 0 && (
        <p className="text-gray-500 text-sm">Inga voteringar hittades.</p>
      )}
    </section>
  );
}
