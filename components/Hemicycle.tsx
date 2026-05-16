"use client";

import { useState } from "react";
import { PARTIES, PARTY_MAP } from "@/constants/parties";

interface Seat {
  x: number;
  y: number;
  color: string;
  party: string;
}

const ROW_COUNTS = [29, 37, 44, 51, 57, 63, 68];
const ROW_RADII  = [120, 150, 180, 210, 240, 270, 300];
const SEAT_R = 7;
const CX = 400;
const CY = 400;

// Cumulative angle fractions per party (left → right political order)
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
  for (let row = 0; row < ROW_COUNTS.length; row++) {
    const count = ROW_COUNTS[row];
    const r = ROW_RADII[row];
    for (let i = 0; i < count; i++) {
      const fraction = i / (count - 1); // 0 = left, 1 = right
      const theta = Math.PI - fraction * Math.PI;
      const x = Math.round((CX + r * Math.cos(theta)) * 100) / 100;
      const y = Math.round((CY - r * Math.sin(theta)) * 100) / 100;
      const code = partyAtFraction(fraction);
      seats.push({ x, y, color: PARTY_MAP[code]?.color ?? "#888", party: code });
    }
  }
  return seats;
}

const ALL_SEATS = buildSeats();

interface HemicycleProps {
  selectedParty: string | null;
  onSelectParty: (party: string | null) => void;
}

export default function Hemicycle({ selectedParty, onSelectParty }: HemicycleProps) {
  const [hoveredParty, setHoveredParty] = useState<string | null>(null);
  const tooltipParty = hoveredParty ? PARTY_MAP[hoveredParty] : null;

  return (
    <div className="w-full max-w-5xl mx-auto px-4 relative">
      <svg
        viewBox="0 0 800 410"
        className="w-full h-auto"
        aria-label="Riksdagens hemicykel"
        style={{ cursor: "pointer" }}
        onClick={() => onSelectParty(null)}
        onMouseLeave={() => setHoveredParty(null)}
      >
        {/* Transparent background — clears tooltip when hovering empty space */}
        <rect x="0" y="0" width="800" height="410" fill="transparent" onMouseEnter={() => setHoveredParty(null)} />

        {ALL_SEATS.map((seat, i) => {
          const dimmed = selectedParty !== null && seat.party !== selectedParty;
          return (
            <circle
              key={i}
              cx={seat.x}
              cy={seat.y}
              r={SEAT_R}
              fill={seat.color}
              opacity={dimmed ? 0.15 : 1}
              style={{ transition: "opacity 0.25s", cursor: "pointer" }}
              onMouseEnter={() => setHoveredParty(seat.party)}
              onClick={e => { e.stopPropagation(); onSelectParty(seat.party); }}
            />
          );
        })}
      </svg>

      {/* Hover tooltip */}
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
