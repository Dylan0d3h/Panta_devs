// Datas como texto "AAAA-MM-DD" no fuso local (sem conversão para UTC).

export const MAX_DIAS = 731;

function paraIso(d: Date): string {
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function deIso(iso: string): Date {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d);
}

export function hoje(): string {
  return paraIso(new Date());
}

export function diasEntre(inicio: string, fim: string): number {
  return Math.round((deIso(fim).getTime() - deIso(inicio).getTime()) / 86_400_000) + 1;
}

export function diasAtras(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return paraIso(d);
}

/** Período da leitura rápida: os últimos 30 dias, terminando hoje. */
export function periodoLeituraRapida(): { inicio: string; fim: string } {
  return { inicio: diasAtras(29), fim: hoje() };
}

/**
 * Período de saúde da leitura rápida: o último ano completo já publicado
 * pelo DATASUS. As internações de um ano costumam estar completas a partir
 * de abril do ano seguinte; antes disso, usa o ano retrasado.
 */
export function periodoSaudeRecente(): { inicio: string; fim: string } {
  const agora = new Date();
  const ano = agora.getMonth() >= 3 ? agora.getFullYear() - 1 : agora.getFullYear() - 2;
  return { inicio: `${ano}-01-01`, fim: `${ano}-12-31` };
}

/** Atalhos de período mostrados no formulário. */
export function atalhosDePeriodo(): { rotulo: string; inicio: string; fim: string }[] {
  const anoPassado = new Date().getFullYear() - 1;
  return [
    { rotulo: "Hoje", inicio: hoje(), fim: hoje() },
    { rotulo: "Últimos 7 dias", inicio: diasAtras(6), fim: hoje() },
    { rotulo: "Últimos 30 dias", inicio: diasAtras(29), fim: hoje() },
    { rotulo: "Últimos 90 dias", inicio: diasAtras(89), fim: hoje() },
    { rotulo: `Seca de ${anoPassado} (jul–out)`, inicio: `${anoPassado}-07-01`, fim: `${anoPassado}-10-31` },
    { rotulo: `Ano de ${anoPassado}`, inicio: `${anoPassado}-01-01`, fim: `${anoPassado}-12-31` },
  ];
}

/** Devolve a mensagem de erro do período, ou null se estiver tudo certo. */
export function validarPeriodo(inicio: string, fim: string): string | null {
  if (!inicio || !fim) return "Escolha a data de início e a data de fim.";
  if (fim < inicio) return "A data de fim precisa ser depois da data de início.";
  if (fim > hoje()) return "A data de fim não pode ser no futuro.";
  if (diasEntre(inicio, fim) > MAX_DIAS) return "O período máximo é de 2 anos.";
  return null;
}

/** Todos os meses tocados pelo período, como "AAAA-MM". */
export function mesesDoPeriodo(inicio: string, fim: string): string[] {
  const meses: string[] = [];
  let [ano, mes] = inicio.split("-").map(Number);
  const [anoFim, mesFim] = fim.split("-").map(Number);
  while (ano < anoFim || (ano === anoFim && mes <= mesFim)) {
    meses.push(`${ano}-${String(mes).padStart(2, "0")}`);
    mes += 1;
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
  }
  return meses;
}
