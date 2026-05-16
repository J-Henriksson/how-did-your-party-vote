"use client";

import { useState } from "react";
import Hemicycle from "@/components/Hemicycle";
import VoteList from "@/components/VoteList";
import { fetchAllPartyBreakdown } from "@/lib/api";
import type { AggregatedVote, AllPartyBreakdown } from "@/lib/types";

export default function Home() {
  const [selectedVoteId, setSelectedVoteId] = useState<string | null>(null);
  const [breakdown, setBreakdown] = useState<AllPartyBreakdown | null>(null);

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
        <p className="text-gray-400 text-lg max-w-xl mx-auto">
          Klicka på en votering — hemicykeln visar hur varje parti röstade.
        </p>
      </header>

      <Hemicycle
        selectedParty={null}
        onSelectParty={() => {}}
        breakdown={breakdown}
      />

      <VoteList
        selectedVoteId={selectedVoteId}
        onSelectVote={handleSelectVote}
      />
    </main>
  );
}
