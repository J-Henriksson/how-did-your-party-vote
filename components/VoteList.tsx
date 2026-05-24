"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { streamAllVotes, streamPartyVotes } from "@/lib/api";
import type { AggregatedVote } from "@/lib/types";
import { PARTY_MAP } from "@/constants/parties";
import { COMMITTEES, committeeFromDokId } from "@/constants/committees";
import VoteCard from "./VoteCard";

interface VoteListProps {
  sessions: string[];
  partyCode?: string;
  selectedVoteId?: string | null;
  onSelectVote?: (vote: AggregatedVote) => void;
  columns?: number;
}

export default function VoteList({ sessions, partyCode, selectedVoteId, onSelectVote, columns = 3 }: VoteListProps) {
  const [votes, setVotes] = useState<AggregatedVote[]>([]);
  const [done, setDone] = useState(false);
  const [query, setQuery] = useState("");
  const [activeCommittees, setActiveCommittees] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<"date" | "controversy">("date");

  useEffect(() => {
    setVotes([]);
    setDone(false);
    setQuery("");
    setActiveCommittees(new Set());
    const controller = new AbortController();

    const seen = new Set<string>();
    let pending = sessions.length;

    const onVote = (vote: AggregatedVote) => {
      if (seen.has(vote.votering_id)) return;
      seen.add(vote.votering_id);
      setVotes(prev => {
        const next = [...prev, vote];
        next.sort((a, b) => b.datum.localeCompare(a.datum));
        return next;
      });
    };
    const onDoneOne = () => { if (--pending === 0) setDone(true); };

    for (const session of sessions) {
      if (partyCode) {
        streamPartyVotes(partyCode, session, onVote, onDoneOne, controller.signal);
      } else {
        streamAllVotes(session, onVote, onDoneOne, controller.signal);
      }
    }

    return () => controller.abort();
  }, [partyCode, sessions.slice().sort().join(",")]);

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
    const result = votes.filter(v => {
      if (activeCommittees.size > 0 && !activeCommittees.has(committeeFromDokId(v.beteckning))) return false;
      if (q && !v.rubrik.toLowerCase().includes(q)) return false;
      return true;
    });
    if (sortBy === "controversy") {
      result.sort((a, b) => {
        const scoreA = (a.ja + a.nej + a.avstar) > 0 ? Math.min(a.ja, a.nej) / (a.ja + a.nej + a.avstar) : 0;
        const scoreB = (b.ja + b.nej + b.avstar) > 0 ? Math.min(b.ja, b.nej) / (b.ja + b.nej + b.avstar) : 0;
        return scoreB - scoreA;
      });
    }
    return result;
  }, [votes, query, activeCommittees, sortBy]);

  function toggleCommittee(code: string) {
    setActiveCommittees(prev => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  }

  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        inputRef.current?.contains(e.target as Node) ||
        dropdownRef.current?.contains(e.target as Node)
      ) return;
      setShowDropdown(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const wordMatch = (text: string) =>
      text.toLowerCase().split(/[\s\-–,;:.!?()\[\]"']+/).some(w => w.length > 0 && w.startsWith(q));
    return votes.filter(v => wordMatch(v.rubrik)).slice(0, 6);
  }, [votes, query]);

  const party = partyCode ? PARTY_MAP[partyCode] : undefined;
  const loading = !done && votes.length === 0;

  return (
    <section className="w-full px-4 lg:px-6 pt-4 lg:pt-6 pb-16">
      {/* Header */}
      <div className="flex items-baseline gap-3 mb-1">
        {partyCode
          ? <h2 className="text-xl font-semibold" style={{ color: party?.color ?? "#fff" }}>{party?.name ?? partyCode}</h2>
          : <h2 className="text-xl font-semibold text-white">Alla voteringar</h2>
        }
        {!done && <span className="text-xs text-gray-500 animate-pulse">laddar voteringar…</span>}
        {done && votes.length > 0 && (
          <span className="text-xs text-gray-600">{filtered.length} / {votes.length} voteringar</span>
        )}
      </div>
      <p className="text-sm text-gray-500 mb-5">Riksmötet {sessions.slice().sort().reverse().join(" · ")}</p>

      {/* Search + filters */}
      {votes.length > 0 && (
        <div className="flex flex-col gap-3 mb-6">
          <div className="flex items-center gap-2">
            {(["date", "controversy"] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setSortBy(mode)}
                className="px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors duration-150"
                style={{
                  backgroundColor: sortBy === mode ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)",
                  color: sortBy === mode ? "#fff" : "#6b7280",
                  border: `1px solid ${sortBy === mode ? "rgba(255,255,255,0.25)" : "transparent"}`,
                }}
              >
                {mode === "date" ? "Senaste" : "Mest splittrad"}
              </button>
            ))}
          </div>
          <div className="relative w-full max-w-sm">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); setShowDropdown(true); }}
              onFocus={() => setShowDropdown(true)}
              placeholder="Sök bland voteringar…"
              className="w-full rounded-lg px-3 py-2 text-sm bg-white/5 text-white placeholder-gray-600 border border-white/10 focus:outline-none focus:border-white/25"
            />
            {showDropdown && suggestions.length > 0 && (
              <div
                ref={dropdownRef}
                className="absolute z-20 top-full mt-1 w-full rounded-lg border border-white/10 overflow-hidden shadow-xl"
                style={{ backgroundColor: "#13151f" }}
              >
                {suggestions.map(v => (
                  <button
                    key={v.votering_id}
                    className="w-full text-left px-3 py-2.5 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0"
                    onMouseDown={() => {
                      onSelectVote?.(v);
                      setQuery("");
                      setShowDropdown(false);
                    }}
                  >
                    <p className="text-sm text-white truncate">{v.rubrik || v.titel}</p>
                    <p className="text-xs text-gray-600 mt-0.5">{v.beteckning} · {v.datum}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
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
        <div className="flex gap-4 items-start">
          {Array.from({ length: columns }, (_, ci) => (
            <div key={ci} className="flex-1 flex flex-col gap-4 min-w-0">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="rounded-xl p-4 h-32 animate-pulse" style={{ backgroundColor: "#1a1d27" }} />
              ))}
            </div>
          ))}
        </div>
      )}

      {!loading && (
        <div className="flex gap-4 items-start">
          {Array.from({ length: columns }, (_, ci) => (
            <div key={ci} className="flex-1 flex flex-col gap-4 min-w-0">
              {filtered.filter((_, i) => i % columns === ci).map((vote, i) => (
                <div key={vote.votering_id} className="card-appear" style={{ animationDelay: `${Math.min((ci + i * 3) * 30, 300)}ms` }}>
                  <VoteCard
                    vote={vote}
                    partyCode={partyCode}
                    selected={selectedVoteId === vote.votering_id}
                    onSelect={() => onSelectVote?.(vote)}
                  />
                </div>
              ))}
              {!done && ci === 0 && (
                <div className="rounded-xl p-4 h-32 animate-pulse" style={{ backgroundColor: "#1a1d27" }} />
              )}
            </div>
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
