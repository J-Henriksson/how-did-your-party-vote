export const PARTIES = [
  { code: "V",  name: "Vänsterpartiet",      color: "#AF1E2D", seats: 24  },
  { code: "MP", name: "Miljöpartiet",         color: "#83CF39", seats: 18  },
  { code: "S",  name: "Socialdemokraterna",   color: "#E8112D", seats: 107 },
  { code: "C",  name: "Centerpartiet",        color: "#009933", seats: 24  },
  { code: "L",  name: "Liberalerna",          color: "#006AB3", seats: 16  },
  { code: "KD", name: "Kristdemokraterna",    color: "#231977", seats: 19  },
  { code: "M",  name: "Moderaterna",          color: "#52BDEC", seats: 68  },
  { code: "SD", name: "Sverigedemokraterna",  color: "#DDDD00", seats: 73  },
] as const;

export type PartyCode = typeof PARTIES[number]["code"];

export const PARTY_MAP = Object.fromEntries(
  PARTIES.map(p => [p.code, p])
) as Record<string, typeof PARTIES[number]>;
