const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MESES_LONGOS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** 12345.678 -> "12.345,7" (com `casas` casas decimais no máximo). */
export function numero(valor: number | null | undefined, casas = 1): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return "–";
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: casas });
}

export function comUnidade(valor: number | null | undefined, unidade: string, casas = 1): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return "–";
  return `${numero(valor, casas)} ${unidade}`;
}

/** "2023-08-05" -> "05/08/2023" (sem passar por Date, para não mudar de dia por fuso). */
export function data(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** "2023-08-05" -> "05/08" */
export function dataCurta(iso: string): string {
  const m = iso.match(/^\d{4}-(\d{2})-(\d{2})/);
  return m ? `${m[2]}/${m[1]}` : iso;
}

/** "2023-08" -> "ago/23" */
export function mesCurto(mes: string): string {
  const [ano, m] = mes.split("-");
  return `${MESES_CURTOS[Number(m) - 1]}/${ano.slice(2)}`;
}

/** "2023-08" -> "agosto de 2023" */
export function mesLongo(mes: string): string {
  const [ano, m] = mes.split("-");
  return `${MESES_LONGOS[Number(m) - 1]} de ${ano}`;
}

export function plural(n: number, singular: string, pluralTexto: string): string {
  return `${numero(n, 0)} ${n === 1 ? singular : pluralTexto}`;
}
