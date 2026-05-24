"use client";

import { useEffect, useState } from "react";
import Hemicycle from "@/components/Hemicycle";
import VoteList from "@/components/VoteList";
import { currentSession, fetchAllPartyBreakdown } from "@/lib/api";
import type { AggregatedVote, AllPartyBreakdown } from "@/lib/types";

const SESSIONS = ["2025/26", "2024/25", "2023/24"];

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isDesktop;
}

export default function Home() {
  const [activeSessions, setActiveSessions] = useState<Set<string>>(() => new Set([currentSession()]));
  const [selectedParty, setSelectedParty] = useState<string | null>(null);
  const [selectedVoteId, setSelectedVoteId] = useState<string | null>(null);
  const [breakdown, setBreakdown] = useState<AllPartyBreakdown | null>(null);
  const isDesktop = useIsDesktop();

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

  const hemicycleProps = {
    selectedParty,
    onSelectParty: handleSelectParty,
    breakdown,
    compact: !isDesktop,
  };

  return (
    <div className="flex flex-col lg:flex-row h-dvh overflow-hidden">
      {/* Hemicycle pane — top on mobile/tablet, left on desktop */}
      <div className="lg:w-1/2 lg:h-auto flex flex-col flex-shrink-0
                      pt-3 lg:px-2 lg:pt-8 pb-1 lg:pb-6 overflow-hidden">
        <header className="mb-2 lg:mb-3 flex-shrink-0 px-4 lg:px-0">
          <h1 className="text-xl lg:text-3xl font-bold tracking-tight mb-1 lg:mb-2">
            Hur röstade ditt parti?
          </h1>
          <p className="hidden lg:block text-gray-400 text-sm max-w-md mb-4">
            Politiker säger en sak men röstar för en annan. Här ser du exakt hur varje parti röstade.
          </p>
          <div className="flex gap-2 flex-wrap">
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

        <div className="pt-3 lg:flex-1 lg:flex lg:items-start lg:min-h-0 lg:pt-10">
          <Hemicycle {...hemicycleProps} />
        </div>
      </div>

      {/* Vote list pane — bottom on mobile/tablet, right on desktop */}
      <div className="flex-1 lg:w-1/2 overflow-y-auto border-t lg:border-t-0 lg:border-l border-white/5">
        <VoteList
          sessions={[...activeSessions]}
          partyCode={selectedParty ?? undefined}
          selectedVoteId={selectedVoteId}
          onSelectVote={handleSelectVote}
          columns={isDesktop ? 2 : 1}
        />
      </div>
    </div>
  );
}
