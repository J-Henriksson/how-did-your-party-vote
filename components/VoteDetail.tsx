"use client";

import type { VotePoint, AllPartyBreakdown } from "@/lib/types";
import { PARTIES } from "@/constants/parties";

interface VoteDetailProps {
  vote: VotePoint;
  breakdown: AllPartyBreakdown;
}

function dominantOutcome(ja: number, nej: number, avstar: number): { label: string; color: string } | null {
  if (ja === 0 && nej === 0 && avstar === 0) return null;
  if (ja > nej && ja > avstar) return { label: "Ja", color: "#22c55e" };
  if (nej > ja && nej > avstar) return { label: "Nej", color: "#ef4444" };
  if (avstar > ja && avstar > nej) return { label: "Avstår", color: "#f59e0b" };
  return null;
}

export default function VoteDetail({ vote, breakdown }: VoteDetailProps) {
  const formattedDate = vote.datum
    ? new Date(vote.datum).toLocaleDateString("sv-SE", { year: "numeric", month: "short", day: "numeric" })
    : "";

  return (
    <section className="w-full max-w-7xl mx-auto mt-6 px-6">
      <div className="rounded-xl p-5" style={{ backgroundColor: "#1e2133" }}>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <p className="text-base font-semibold text-white leading-snug">{vote.rubrik || vote.titel}</p>
            {vote.titel !== vote.rubrik && (
              <p className="text-sm text-gray-500 mt-0.5">{vote.titel}</p>
            )}
            <div className="flex gap-3 mt-1">
              <span className="text-xs font-mono text-gray-600">{vote.dok_id}</span>
              {formattedDate && <span className="text-xs text-gray-600">{formattedDate}</span>}
            </div>
          </div>
          <a
            href={`https://data.riksdagen.se/dokument/${vote.dok_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-600 hover:text-gray-300 transition-colors flex-shrink-0"
          >
            Läs mer →
          </a>
        </div>

        <p className="text-xs text-gray-500 mb-3">Alla partiers röster</p>
        <div className="flex flex-col gap-2">
          {PARTIES.map(p => {
            const b = breakdown[p.code];
            if (!b) return null;
            const total = b.ja + b.nej + b.avstar;
            if (total === 0) return null;
            const d = dominantOutcome(b.ja, b.nej, b.avstar);
            return (
              <div key={p.code} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                <span className="text-xs text-gray-400 w-32 truncate flex-shrink-0">{p.name}</span>
                <div className="flex-1 h-1.5 rounded-full overflow-hidden flex bg-white/5">
                  <div style={{ width: `${(b.ja / total) * 100}%`, backgroundColor: "#22c55e", transition: "width 0.4s" }} />
                  <div style={{ width: `${(b.nej / total) * 100}%`, backgroundColor: "#ef4444", transition: "width 0.4s" }} />
                  <div style={{ width: `${(b.avstar / total) * 100}%`, backgroundColor: "#f59e0b", transition: "width 0.4s" }} />
                </div>
                {d && (
                  <span className="text-xs font-semibold w-8 text-right flex-shrink-0" style={{ color: d.color }}>
                    {d.label}
                  </span>
                )}
                <span className="text-xs text-gray-700 w-20 text-right flex-shrink-0">
                  {b.ja}J · {b.nej}N · {b.avstar}A
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
