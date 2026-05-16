"use client";

import { useEffect, useState } from "react";
import { streamPartyVotes } from "@/lib/api";
import type { AggregatedVote } from "@/lib/types";
import { PARTY_MAP } from "@/constants/parties";
import VoteCard from "./VoteCard";

interface VoteListProps {
  partyCode: string;
}

export default function VoteList({ partyCode }: VoteListProps) {
  const [votes, setVotes] = useState<AggregatedVote[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setVotes([]);
    setDone(false);
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

  const party = PARTY_MAP[partyCode];
  const loading = !done && votes.length === 0;

  return (
    <section className="w-full max-w-7xl mx-auto mt-10 px-6">
      <div className="flex items-baseline gap-3 mb-1">
        <h2 className="text-xl font-semibold" style={{ color: party?.color ?? "#fff" }}>
          {party?.name ?? partyCode}
        </h2>
        {!done && (
          <span className="text-xs text-gray-500 animate-pulse">laddar voteringar…</span>
        )}
        {done && votes.length > 0 && (
          <span className="text-xs text-gray-600">{votes.length} voteringar</span>
        )}
      </div>
      <p className="text-sm text-gray-500 mb-6">Riksmötet 2025/26</p>

      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl p-4 h-32 animate-pulse" style={{ backgroundColor: "#1a1d27" }} />
          ))}
        </div>
      )}

      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {votes.map(vote => (
            <VoteCard key={vote.votering_id} vote={vote} partyCode={partyCode} />
          ))}
          {/* Skeleton placeholders while still loading */}
          {!done && Array.from({ length: 3 }).map((_, i) => (
            <div key={`skel-${i}`} className="rounded-xl p-4 h-32 animate-pulse" style={{ backgroundColor: "#1a1d27" }} />
          ))}
        </div>
      )}

      {done && votes.length === 0 && (
        <p className="text-gray-500 text-sm">Inga voteringar hittades.</p>
      )}
    </section>
  );
}
