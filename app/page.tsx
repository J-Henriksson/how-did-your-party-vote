"use client";

import { useState } from "react";
import Hemicycle from "@/components/Hemicycle";
import PartyLegend from "@/components/PartyLegend";
import VoteList from "@/components/VoteList";

export default function Home() {
  const [selectedParty, setSelectedParty] = useState<string | null>(null);

  function handleSelect(party: string | null) {
    setSelectedParty(prev => (prev === party ? null : party));
  }

  return (
    <main className="flex flex-col items-center w-full pb-24">
      <header className="w-full max-w-5xl mx-auto px-6 pt-12 pb-6 text-center">
        <h1 className="text-4xl font-bold tracking-tight mb-3">
          Hur röstade ditt parti?
        </h1>
        <p className="text-gray-400 text-lg max-w-xl mx-auto">
          Politiker säger en sak och röstar en annan. Här ser du exakt hur varje parti röstade — ingen spin, bara data.
        </p>
      </header>

      <Hemicycle selectedParty={selectedParty} onSelectParty={handleSelect} />

      <PartyLegend selectedParty={selectedParty} onSelect={handleSelect} />

      {selectedParty ? (
        <VoteList partyCode={selectedParty} />
      ) : (
        <p className="mt-10 text-gray-600 text-sm cursor-default">
          Klicka på ett parti för att se deras voteringar.
        </p>
      )}
    </main>
  );
}
