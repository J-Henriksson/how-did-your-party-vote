"use client";

import { PARTIES } from "@/constants/parties";

interface PartyLegendProps {
  selectedParty: string | null;
  onSelect: (party: string | null) => void;
}

export default function PartyLegend({ selectedParty, onSelect }: PartyLegendProps) {
  return (
    <div className="flex flex-wrap justify-center gap-3 mt-6">
      {PARTIES.map(p => {
        const active = selectedParty === p.code;
        return (
          <button
            key={p.code}
            onClick={() => onSelect(active ? null : p.code)}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 cursor-pointer"
            style={{
              backgroundColor: active ? p.color : "rgba(255,255,255,0.06)",
              color: active ? "#fff" : "#d1d5db",
              boxShadow: active ? `0 0 0 2px ${p.color}` : "none",
              filter: active ? "none" : "none",
            }}
            aria-pressed={active}
          >
            <span
              className="inline-block w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: p.color }}
            />
            <span className="hidden sm:inline">{p.name}</span>
            <span className="sm:hidden font-bold">{p.code}</span>
          </button>
        );
      })}
    </div>
  );
}
