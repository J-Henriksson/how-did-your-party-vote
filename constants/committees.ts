export const COMMITTEES: Record<string, string> = {
  AU:  "Arbetsmarknad",
  CU:  "Civil- och bostadsrätt",
  FiU: "Finans",
  FöU: "Försvar",
  JuU: "Juridik & polis",
  KrU: "Kultur & sport",
  KU:  "Konstitution",
  MJU: "Miljö & jordbruk",
  NU:  "Näringsliv",
  SkU: "Skatt",
  SfU: "Socialförsäkring",
  SoU: "Hälsa & vård",
  TU:  "Transport",
  UbU: "Utbildning",
  UU:  "Utrikesfrågor",
};

export function committeeFromDokId(dokId: string): string {
  // "HD01FiU25" → strip 4-char session prefix → "FiU25" → strip trailing digits → "FiU"
  return dokId.slice(4).replace(/\d+$/, "");
}
