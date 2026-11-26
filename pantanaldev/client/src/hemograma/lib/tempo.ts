// Códigos de tempo (padrão WMO) usados pelo Open-Meteo, em português.
const DESCRICOES: Record<number, string> = {
  0: "Céu limpo",
  1: "Poucas nuvens",
  2: "Parcialmente nublado",
  3: "Nublado",
  45: "Neblina",
  48: "Neblina com geada",
  51: "Garoa fraca",
  53: "Garoa moderada",
  55: "Garoa forte",
  56: "Garoa congelante",
  57: "Garoa congelante forte",
  61: "Chuva fraca",
  63: "Chuva moderada",
  65: "Chuva forte",
  66: "Chuva congelante",
  67: "Chuva congelante forte",
  71: "Neve fraca",
  73: "Neve moderada",
  75: "Neve forte",
  77: "Grãos de neve",
  80: "Pancadas de chuva fracas",
  81: "Pancadas de chuva",
  82: "Pancadas de chuva fortes",
  85: "Pancadas de neve",
  86: "Pancadas de neve fortes",
  95: "Trovoadas",
  96: "Trovoadas com granizo",
  99: "Trovoadas com granizo forte",
};

export function descreverTempo(codigo: number | null | undefined): string {
  if (codigo === null || codigo === undefined) return "–";
  return DESCRICOES[codigo] ?? "Condição não identificada";
}
