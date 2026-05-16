"use client";

import { useMemo } from "react";
import { PARTIES } from "@/constants/parties";

interface Seat {
  x: number;
  y: number;
  color: string;
  party: string;
}

// Row seat counts, inner to outer — must sum to 349
const ROW_COUNTS = [29, 37, 44, 51, 57, 63, 68];
const ROW_RADII  = [120, 150, 180, 210, 240, 270, 300];
const SEAT_R = 7;
const CX = 400;
const CY = 400;

function buildSeats(): Seat[] {
  // Build a flat ordered list of party slots (left → right political order)
  const slots: string[] = [];
  for (const p of PARTIES) {
    for (let i = 0; i < p.seats; i++) slots.push(p.code);
  }

  // Fill seats row by row (inner first), left to right within each row
  const seats: Seat[] = [];
  let slotIdx = 0;
  for (let row = 0; row < ROW_COUNTS.length; row++) {
    const count = ROW_COUNTS[row];
    const r = ROW_RADII[row];
    for (let i = 0; i < count; i++) {
      // θ goes from π (left) to 0 (right)
      const theta = Math.PI - (i / (count - 1)) * Math.PI;
      const x = Math.round((CX + r * Math.cos(theta)) * 100) / 100;
      const y = Math.round((CY - r * Math.sin(theta)) * 100) / 100;
      const party = slots[slotIdx++] ?? "?";
      const partyData = PARTIES.find(p => p.code === party);
      seats.push({ x, y, color: partyData?.color ?? "#888", party });
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
  const seats = useMemo(() => ALL_SEATS, []);

  return (
    <div className="w-full max-w-5xl mx-auto px-4">
      <svg
        viewBox="0 0 800 410"
        className="w-full h-auto"
        aria-label="Riksdagens hemicykel"
        style={{ cursor: "pointer" }}
        onClick={() => onSelectParty(null)}
      >
        {seats.map((seat, i) => {
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
              onClick={e => { e.stopPropagation(); onSelectParty(seat.party === selectedParty ? null : seat.party); }}
            />
          );
        })}
      </svg>
    </div>
  );
}
