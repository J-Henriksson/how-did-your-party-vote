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
  compact?: boolean;
}

// viewBox params: [minX, minY, width, height]
const VB_DESKTOP = [80, 88, 640, 319] as const;
const VB_COMPACT = [80, 88, 640, 319] as const;

function nearestParty(
  e: React.MouseEvent<SVGSVGElement>,
  vb: readonly [number, number, number, number]
): string | null {
  const svg = e.currentTarget;
  const rect = svg.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width * vb[2] + vb[0];
  const y = (e.clientY - rect.top) / rect.height * vb[3] + vb[1];

  // Polar distance from the arc center — determines if cursor is inside the arc band
  const r = Math.hypot(x - CX, y - CY);
  const inBand = r >= ROW_RADII[0] - SEAT_R && r <= ROW_RADII[ROW_RADII.length - 1] + SEAT_R && y <= CY + SEAT_R;

  let minDist = Infinity;
  let party: string | null = null;
  for (const seat of ALL_SEATS) {
    const d = Math.hypot(seat.x - x, seat.y - y);
    if (d < minDist) { minDist = d; party = seat.party; }
  }
  // Within the arc band: generous threshold covers horizontal gaps between seats
  // Outside the band (approaching from above/below/outside): must nearly touch a seat
  return minDist < (inBand ? 20 : SEAT_R) ? party : null;
}

export default function Hemicycle({ selectedParty, onSelectParty, breakdown, compact = false }: HemicycleProps) {
  const [hoveredParty, setHoveredParty] = useState<string | null>(null);
  const tooltipParty = hoveredParty ? PARTY_MAP[hoveredParty] : null;
  const vb = compact ? VB_COMPACT : VB_DESKTOP;
  const viewBox = `${vb[0]} ${vb[1]} ${vb[2]} ${vb[3]}`;
  const aspectRatio = `${vb[2]}/${vb[3]}`;

  return (
    <div className="w-full max-w-5xl mx-auto px-1 lg:px-4 relative">
      <svg
        viewBox={viewBox}
        className="w-full"
        style={{ aspectRatio, cursor: hoveredParty ? "pointer" : "default" }}
        aria-label="Riksdagens hemicykel"
        onMouseMove={e => setHoveredParty(nearestParty(e, vb))}
        onMouseLeave={() => setHoveredParty(null)}
        onClick={e => {
          const p = nearestParty(e, vb);
          p ? onSelectParty(p) : onSelectParty(null);
        }}
      >
        <rect x="0" y="0" width="800" height="410" fill="transparent" />

        {ALL_SEATS.map((seat, i) => (
          <circle
            key={i}
            cx={seat.x}
            cy={seat.y}
            r={SEAT_R}
            fill={seat.color}
            opacity={seatOpacity(seat, breakdown, selectedParty)}
            style={{ transition: "opacity 0.3s", cursor: "pointer" }}
          />
        ))}
      </svg>

      {tooltipParty && (
        <div
          className="absolute left-1/2 -translate-x-1/2 bottom-2 px-2 py-1 lg:px-3 lg:py-1.5 rounded-lg pointer-events-none transition-opacity duration-150 text-center w-20 lg:w-44"
          style={{ backgroundColor: tooltipParty.color + "33", color: "#fff", border: `1px solid ${tooltipParty.color}88` }}
        >
          <div className="text-xs lg:text-sm font-semibold leading-tight">
            <span className="lg:hidden">{hoveredParty}</span>
            <span className="hidden lg:inline">{tooltipParty.name}</span>
          </div>
          <div className="text-[10px] lg:text-xs opacity-60">{tooltipParty.seats} mandat</div>
        </div>
      )}
    </div>
  );
}
