"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fetchRecentVotePoints } from "@/lib/api";
import type { VotePoint } from "@/lib/types";
import { COMMITTEES, committeeFromDokId } from "@/constants/committees";

interface VoteSearchProps {
  selectedVote: VotePoint | null;
  onSelect: (vote: VotePoint | null) => void;
}

export default function VoteSearch({ selectedVote, onSelect }: VoteSearchProps) {
  const [allVotes, setAllVotes] = useState<VotePoint[]>([]);
  const [query, setQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeCommittees, setActiveCommittees] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchRecentVotePoints().then(setAllVotes);
  }, []);

  const availableCommittees = useMemo(() => {
    const seen = new Map<string, string>();
    for (const v of allVotes) {
      const code = committeeFromDokId(v.dok_id);
      if (!seen.has(code)) seen.set(code, COMMITTEES[code] ?? code);
    }
    return [...seen.entries()].map(([code, label]) => ({ code, label }));
  }, [allVotes]);

  const q = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    return allVotes.filter(v => {
      if (activeCommittees.size > 0 && !activeCommittees.has(committeeFromDokId(v.dok_id))) return false;
      if (q && !v.rubrik.toLowerCase().includes(q) && !v.titel.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allVotes, q, activeCommittees]);

  const suggestions = useMemo(() => {
    if (!q) return [];
    return allVotes
      .filter(v => v.rubrik.toLowerCase().includes(q) || v.titel.toLowerCase().includes(q))
      .slice(0, 6);
  }, [allVotes, q]);

  function toggleCommittee(code: string) {
    setActiveCommittees(prev => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  }

  function handleSuggestionClick(vote: VotePoint) {
    onSelect(vote);
    setQuery("");
    setShowDropdown(false);
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        inputRef.current && !inputRef.current.contains(e.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const loading = allVotes.length === 0;

  return (
    <section className="w-full max-w-7xl mx-auto mt-8 px-6">
      {/* Search input with autocomplete */}
      <div className="relative mb-4 max-w-lg">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setShowDropdown(true); }}
          onFocus={() => setShowDropdown(true)}
          placeholder="Sök voteringar…"
          className="w-full rounded-lg px-3 py-2 text-sm bg-white/5 text-white placeholder-gray-600 border border-white/10 focus:outline-none focus:border-white/25"
        />
        {showDropdown && suggestions.length > 0 && (
          <div
            ref={dropdownRef}
            className="absolute z-10 top-full mt-1 w-full rounded-lg border border-white/10 overflow-hidden"
            style={{ backgroundColor: "#1a1d27" }}
          >
            {suggestions.map(v => (
              <button
                key={v.votering_id}
                className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-white/5 transition-colors"
                onMouseDown={() => handleSuggestionClick(v)}
              >
                <p className="truncate">{v.rubrik || v.titel}</p>
                <p className="text-xs text-gray-600">{v.datum} · {v.dok_id}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Committee filter chips */}
      {availableCommittees.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-4">
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

      {/* Count */}
      {!loading && (
        <p className="text-xs text-gray-600 mb-3">
          {filtered.length} {filtered.length !== allVotes.length ? `/ ${allVotes.length} ` : ""}voteringar
        </p>
      )}

      {/* Vote list */}
      <div className="flex flex-col gap-2">
        {loading && Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 rounded-lg animate-pulse" style={{ backgroundColor: "#1a1d27" }} />
        ))}
        {filtered.map(vote => {
          const selected = selectedVote?.votering_id === vote.votering_id;
          const formattedDate = vote.datum
            ? new Date(vote.datum).toLocaleDateString("sv-SE", { year: "numeric", month: "short", day: "numeric" })
            : "";
          return (
            <button
              key={vote.votering_id}
              onClick={() => onSelect(selected ? null : vote)}
              className="w-full text-left rounded-lg px-4 py-3 transition-colors duration-150"
              style={{
                backgroundColor: selected ? "#1e2133" : "#1a1d27",
                border: `1px solid ${selected ? "rgba(255,255,255,0.15)" : "transparent"}`,
              }}
            >
              <p className="text-sm text-white font-medium leading-snug truncate">
                {vote.rubrik || vote.titel}
              </p>
              <div className="flex gap-3 mt-0.5">
                <span className="text-xs font-mono text-gray-600">{vote.dok_id}</span>
                {formattedDate && <span className="text-xs text-gray-600">{formattedDate}</span>}
              </div>
            </button>
          );
        })}
      </div>

      {!loading && filtered.length === 0 && (
        <p className="text-gray-500 text-sm mt-4">Inga voteringar matchar filtret.</p>
      )}
    </section>
  );
}
