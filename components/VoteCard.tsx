import type { AggregatedVote } from "@/lib/types";
import { PARTY_MAP } from "@/constants/parties";

interface VoteCardProps {
  vote: AggregatedVote;
  partyCode: string;
}

function Pill({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <span
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ backgroundColor: color + "22", color }}
    >
      {label}
      <span className="font-bold">{count}</span>
    </span>
  );
}

function dominantOutcome(vote: AggregatedVote): { label: string; color: string } | null {
  const active = vote.ja + vote.nej + vote.avstar;
  if (active === 0) return null;
  if (vote.ja > vote.nej && vote.ja > vote.avstar) return { label: "Ja", color: "#22c55e" };
  if (vote.nej > vote.ja && vote.nej > vote.avstar) return { label: "Nej", color: "#ef4444" };
  if (vote.avstar > vote.ja && vote.avstar > vote.nej) return { label: "Avstår", color: "#f59e0b" };
  return null;
}

export default function VoteCard({ vote, partyCode }: VoteCardProps) {
  const party = PARTY_MAP[partyCode];
  const active = vote.ja + vote.nej + vote.avstar;
  const jaPct = active > 0 ? (vote.ja / active) * 100 : 0;
  const nejPct = active > 0 ? (vote.nej / active) * 100 : 0;
  const avstarPct = active > 0 ? (vote.avstar / active) * 100 : 0;
  const dominant = dominantOutcome(vote);

  const formattedDate = vote.datum
    ? new Date(vote.datum).toLocaleDateString("sv-SE", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "";

  return (
    <div className="rounded-xl p-4 flex flex-col gap-3" style={{ backgroundColor: "#1a1d27" }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5 min-w-0">
          <p className="text-sm font-medium text-white leading-snug truncate" title={vote.rubrik}>
            {vote.rubrik || vote.titel}
          </p>
          <p className="text-xs text-gray-500 truncate" title={vote.titel}>
            {vote.titel !== vote.rubrik && vote.titel}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs font-mono text-gray-600">{vote.beteckning}</span>
            {formattedDate && <span className="text-xs text-gray-600">{formattedDate}</span>}
          </div>
        </div>
        {dominant && (
          <span
            className="text-xs font-bold px-2 py-0.5 rounded flex-shrink-0 mt-0.5"
            style={{ color: dominant.color, backgroundColor: dominant.color + "22" }}
          >
            {dominant.label}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Pill label="Ja" count={vote.ja} color="#22c55e" />
        <Pill label="Nej" count={vote.nej} color="#ef4444" />
        <Pill label="Avstår" count={vote.avstar} color="#f59e0b" />
        <Pill label="Frånv." count={vote.franvarande} color="#6b7280" />
      </div>

      {active > 0 && (
        <div className="h-1.5 rounded-full overflow-hidden flex bg-white/5">
          <div style={{ width: `${jaPct}%`, backgroundColor: "#22c55e", transition: "width 0.4s" }} />
          <div style={{ width: `${nejPct}%`, backgroundColor: "#ef4444", transition: "width 0.4s" }} />
          <div style={{ width: `${avstarPct}%`, backgroundColor: "#f59e0b", transition: "width 0.4s" }} />
        </div>
      )}

      <p className="text-xs text-gray-600">
        <span style={{ color: party?.color ?? "#888" }}>{party?.name ?? partyCode}</span>
        {" · "}
        {vote.ja + vote.nej + vote.avstar + vote.franvarande} ledamöter röstade
      </p>
    </div>
  );
}
