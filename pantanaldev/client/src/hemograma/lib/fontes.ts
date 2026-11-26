import type { Fonte } from "../api/tipos";

// Informações de cada fonte usadas em vários lugares da tela.
// As classes do Tailwind ficam escritas por extenso (o Tailwind só gera as
// classes que encontra literalmente no código).
export const INFO_FONTES: Record<
  Fonte,
  {
    titulo: string;
    origem: string;
    descricao: string;
    tempo: string;
    classes: { texto: string; fundo: string; borda: string; anel: string };
  }
> = {
  queimadas: {
    titulo: "Queimadas",
    origem: "INPE",
    descricao: "Focos de incêndio detectados por satélite, com mapa.",
    tempo: "Rápido",
    classes: { texto: "text-orange-700", fundo: "bg-orange-50", borda: "border-orange-200", anel: "ring-orange-500" },
  },
  clima: {
    titulo: "Clima e qualidade do ar",
    origem: "Open-Meteo",
    descricao: "Temperatura, chuva e poluição do ar (PM2.5) dia a dia.",
    tempo: "Rápido",
    classes: { texto: "text-sky-700", fundo: "bg-sky-50", borda: "border-sky-200", anel: "ring-sky-500" },
  },
  saude: {
    titulo: "Saúde respiratória",
    origem: "DATASUS",
    descricao: "Internações e óbitos por doenças respiratórias ligadas à fumaça.",
    tempo: "Pode levar alguns minutos na 1ª vez",
    classes: { texto: "text-violet-700", fundo: "bg-violet-50", borda: "border-violet-200", anel: "ring-violet-500" },
  },
};

export const ORDEM_FONTES: Fonte[] = ["queimadas", "clima", "saude"];

// Cores usadas nos gráficos (Recharts recebe a cor em hexadecimal)
export const CORES_GRAFICO = {
  focos: "#ea580c",
  chuva: "#0284c7",
  temperatura: "#0f766e",
  pm25: "#d97706",
  internacoes: "#7c3aed",
  obitos: "#475569",
};
