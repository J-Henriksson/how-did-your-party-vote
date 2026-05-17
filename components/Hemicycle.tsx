"use client";

import { useState } from "react";
import { PARTIES, PARTY_MAP } from "@/constants/parties";
import type { AllPartyBreakdown } from "@/lib/types";

interface Seat {
  x: number;
  y: number;
  color: string;
  party: string;
  partyIndex: number;
}

const ROW_COUNTS = [29, 37, 44, 51, 57, 63, 68];
const ROW_RADII  = [120, 150, 180, 210, 240, 270, 300];
const SEAT_R = 7;
const CX = 400;
const CY = 400;

const PARTY_ANGLES = (() => {
  const result: Array<{ code: string; start: number; end: number }> = [];
  let cum = 0;
  for (const p of PARTIES) {
    const frac = p.seats / 349;
    result.push({ code: p.code, start: cum, end: cum + frac });
    cum += frac;
  }
  return result;
})();

function partyAtFraction(fraction: number): string {
  for (const pa of PARTY_ANGLES) {
    if (fraction >= pa.start && fraction < pa.end) return pa.code;
  }
  return PARTY_ANGLES[PARTY_ANGLES.length - 1].code;
}

function buildSeats(): Seat[] {
  const seats: Seat[] = [];
  const partyCounts: Record<string, number> = {};
  for (let row = 0; row < ROW_COUNTS.length; row++) {
    const count = ROW_COUNTS[row];
    const r = ROW_RADII[row];
    for (let i = 0; i < count; i++) {
      const fraction = i / (count - 1);
      const theta = Math.PI - fraction * Math.PI;
      const x = Math.round((CX + r * Math.cos(theta)) * 100) / 100;
      const y = Math.round((CY - r * Math.sin(theta)) * 100) / 100;
      const code = partyAtFraction(fraction);
      const partyIndex = partyCounts[code] ?? 0;
      partyCounts[code] = partyIndex + 1;
      seats.push({ x, y, color: PARTY_MAP[code]?.color ?? "#888", party: code, partyIndex });
    }
  }
  return seats;
}

const ALL_SEATS = buildSeats();

function seatOpacity(seat: Seat, breakdown: AllPartyBreakdown | null, selectedParty: string | null): number {
  if (breakdown) {
    const b = breakdown[seat.party];
    if (!b) return 0.12;
    const { ja, nej, avstar } = b;
    if (seat.partyIndex < ja) return 1;
    if (seat.partyIndex < ja + nej) return 0.12;
    if (seat.partyIndex < ja + nej + avstar) return 0.35;
    return 0.12;
  }
  if (selectedParty !== null && seat.party !== selectedParty) return 0.15;
  return 1;
}

interface HemicycleProps {
  selectedParty: string | null;
  onSelectParty: (party: string | null) => void;
  breakdown: AllPartyBreakdown | null;
}

export default function Hemicycle({ selectedParty, onSelectParty, breakdown }: HemicycleProps) {
  const [hoveredParty, setHoveredParty] = useState<string | null>(null);
  const tooltipParty = hoveredParty ? PARTY_MAP[hoveredParty] : null;

  return (
    <div className="w-full max-w-5xl mx-auto px-4 relative">
      <svg
        viewBox="0 0 800 410"
        className="w-full h-auto"
        aria-label="Riksdagens hemicykel"
        onClick={() => onSelectParty(null)}
        onMouseLeave={() => setHoveredParty(null)}
      >
        <rect x="0" y="0" width="800" height="410" fill="transparent" onMouseEnter={() => setHoveredParty(null)} />

        {ALL_SEATS.map((seat, i) => (
          <circle
            key={i}
            cx={seat.x}
            cy={seat.y}
            r={SEAT_R}
            fill={seat.color}
            opacity={seatOpacity(seat, breakdown, selectedParty)}
            style={{ transition: "opacity 0.3s", cursor: "pointer" }}
            onMouseEnter={() => setHoveredParty(seat.party)}
            onClick={e => { e.stopPropagation(); onSelectParty(seat.party); }}
          />
        ))}
      </svg>

      {tooltipParty && (
        <div
          className="absolute left-1/2 -translate-x-1/2 bottom-2 px-3 py-1.5 rounded-lg text-sm font-medium pointer-events-none transition-opacity duration-150"
          style={{ backgroundColor: tooltipParty.color + "22", color: tooltipParty.color, border: `1px solid ${tooltipParty.color}44` }}
        >
          {tooltipParty.name}
          <span className="ml-2 opacity-60 font-normal">{tooltipParty.seats} mandat</span>
        </div>
      )}
    </div>
  );
}
