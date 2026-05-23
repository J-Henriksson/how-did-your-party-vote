export interface VotePoint {
  votering_id: string;
  rubrik: string;
  dok_id: string;
  titel: string;
  datum: string;
}

export interface VoteRecord {
  hangar_id: string;
  rm: string;
  beteckning: string;
  votering_id: string;
  intressent_id: string;
  namn: string;
  fornamn: string;
  efternamn: string;
  valkrets: string;
  parti: string;
  banknummer: string;
  kon: string;
  fodd: string;
  rost: "Ja" | "Nej" | "Avstår" | "Frånvarande";
  avser: string;
  votering: string;
  dok_id: string;
  systemdatum: string;
}

export interface AggregatedVote {
  votering_id: string;
  beteckning: string;
  rubrik: string;
  titel: string;
  datum: string;
  ja: number;
  nej: number;
  avstar: number;
  franvarande: number;
}

export interface PartyVoteBreakdown {
  ja: number;
  nej: number;
  avstar: number;
  franvarande: number;
}

export type AllPartyBreakdown = Record<string, PartyVoteBreakdown>;

export interface DocumentSummary {
  motion: string;
  committee: string;
}
