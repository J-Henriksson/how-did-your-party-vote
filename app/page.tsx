"use client";

import { useState } from "react";
import Hemicycle from "@/components/Hemicycle";
import VoteList from "@/components/VoteList";
import { currentSession, fetchAllPartyBreakdown } from "@/lib/api";
import type { AggregatedVote, AllPartyBreakdown } from "@/lib/types";

const SESSIONS = ["2025/26", "2024/25", "2023/24"];

export default function Home() {
  const [activeSessions, setActiveSessions] = useState<Set<string>>(() => new Set([currentSession()]));
  const [selectedParty, setSelectedParty] = useState<string | null>(null);
  const [selectedVoteId, setSelectedVoteId] = useState<string | null>(null);
  const [breakdown, setBreakdown] = useState<AllPartyBreakdown | null>(null);

  function toggleSession(s: string) {
    setActiveSessions(prev => {
      if (prev.has(s) && prev.size === 1) return prev;
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
    setSelectedVoteId(null);
    setBreakdown(null);
  }

  function handleSelectParty(party: string | null) {
    const next = party === selectedParty ? null : party;
    setSelectedParty(next);
    setSelectedVoteId(null);
    setBreakdown(null);
  }

  async function handleSelectVote(vote: AggregatedVote) {
    if (selectedVoteId === vote.votering_id) {
      setSelectedVoteId(null);
      setBreakdown(null);
      return;
    }
    setSelectedVoteId(vote.votering_id);
    const data = await fetchAllPartyBreakdown(vote.votering_id);
    setBreakdown(data);
  }

  return (
    <main className="flex flex-col items-center w-full pb-24">
      <header className="w-full max-w-5xl mx-auto px-6 pt-12 pb-6 text-center">
        <h1 className="text-4xl font-bold tracking-tight mb-3">
          Hur röstade ditt parti?
        </h1>
        <p className="text-gray-400 text-lg max-w-xl mx-auto mb-5">
          Politiker säger en sak men röstar för en annan. Här ser du exakt hur varje parti röstade.
        </p>
        <div className="flex justify-center gap-2">
          {SESSIONS.map(s => {
            const active = activeSessions.has(s);
            return (
              <button
                key={s}
                onClick={() => toggleSession(s)}
                className="px-4 py-1.5 rounded-full text-sm font-medium transition-colors duration-150 cursor-pointer"
                style={{
                  backgroundColor: active ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)",
                  color: active ? "#fff" : "#6b7280",
                  border: `1px solid ${active ? "rgba(255,255,255,0.25)" : "transparent"}`,
                }}
              >
                {s}
              </button>
            );
          })}
        </div>
      </header>

      <Hemicycle
        selectedParty={selectedParty}
        onSelectParty={handleSelectParty}
        breakdown={breakdown}
      />

      <VoteList
        sessions={[...activeSessions]}
        partyCode={selectedParty ?? undefined}
        selectedVoteId={selectedVoteId}
        onSelectVote={handleSelectVote}
      />
    </main>
  );
}
