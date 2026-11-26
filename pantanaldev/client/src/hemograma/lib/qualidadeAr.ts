// Faixas do índice US AQI (as mesmas que o backend usa para classificar).

export interface FaixaAr {
  nome: string;
  ate: number; // limite superior do índice
  cor: string; // cor de destaque
  fundo: string; // cor de fundo suave
  explicacao: string;
}

export const FAIXAS_AR: FaixaAr[] = [
  { nome: "Boa", ate: 50, cor: "#15803d", fundo: "#dcfce7", explicacao: "Ar limpo, sem risco para a saúde." },
  { nome: "Moderada", ate: 100, cor: "#a16207", fundo: "#fef9c3", explicacao: "Aceitável; pessoas muito sensíveis podem sentir algum efeito." },
  { nome: "Ruim para grupos sensíveis", ate: 150, cor: "#c2410c", fundo: "#ffedd5", explicacao: "Crianças, idosos e quem tem asma ou doenças do coração devem evitar esforço ao ar livre." },
  { nome: "Ruim", ate: 200, cor: "#b91c1c", fundo: "#fee2e2", explicacao: "Todos podem sentir efeitos; grupos sensíveis, efeitos mais sérios." },
  { nome: "Muito ruim", ate: 300, cor: "#7e22ce", fundo: "#f3e8ff", explicacao: "Alerta de saúde: risco aumentado para toda a população." },
  { nome: "Perigosa", ate: Infinity, cor: "#7f1d1d", fundo: "#fecaca", explicacao: "Emergência: toda a população é afetada." },
];

export function faixaPorNome(nome: string | null | undefined): FaixaAr | undefined {
  return FAIXAS_AR.find((f) => f.nome === nome);
}

/** Diretriz da OMS (2021): média de PM2.5 em 24 horas de até 15 µg/m³. */
export const LIMITE_OMS_PM25 = 15;
