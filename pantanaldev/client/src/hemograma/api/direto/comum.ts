// Funções usadas pelo modo "sem servidor": o navegador busca os dados direto
// das fontes públicas (Open-Meteo, INPE, Nominatim) e dos arquivos gerados
// pelo script gerar_dados_estaticos.py (pasta dados/ do site).

export class ErroFonte extends Error {
  status: number;
  constructor(mensagem: string, status = 0) {
    super(mensagem);
    this.status = status;
  }
}

/** Endereço de um arquivo da pasta public do site (respeita o SITE_BASE). */
export function arquivoDoSite(caminho: string): string {
  const base = (import.meta.env?.BASE_URL as string | undefined) ?? "/";
  return `${base.endsWith("/") ? base : base + "/"}${caminho.replace(/^\//, "")}`;
}

/** Junta dois AbortSignals (o da busca e o do tempo limite). */
function sinalComTempo(signal: AbortSignal | undefined, ms: number): { sinal: AbortSignal; limpar: () => void } {
  const controle = new AbortController();
  const tempo = setTimeout(() => controle.abort(new DOMException("Tempo esgotado", "TimeoutError")), ms);
  const repassar = () => controle.abort(signal?.reason ?? new DOMException("Cancelado", "AbortError"));
  if (signal) {
    if (signal.aborted) repassar();
    else signal.addEventListener("abort", repassar, { once: true });
  }
  return {
    sinal: controle.signal,
    limpar: () => {
      clearTimeout(tempo);
      signal?.removeEventListener("abort", repassar);
    },
  };
}

export function foiCancelado(erro: unknown, signal?: AbortSignal): boolean {
  return Boolean(signal?.aborted) || (erro instanceof DOMException && erro.name === "AbortError");
}

/** fetch com tempo limite. Erros de rede viram ErroFonte com a mensagem dada. */
export async function buscar(
  url: string,
  { signal, tempoLimite = 30_000, erroRede }: { signal?: AbortSignal; tempoLimite?: number; erroRede: string },
): Promise<Response> {
  const { sinal, limpar } = sinalComTempo(signal, tempoLimite);
  try {
    return await fetch(url, { signal: sinal });
  } catch (erro) {
    if (signal?.aborted) throw new DOMException("Cancelado", "AbortError");
    throw new ErroFonte(erroRede);
  } finally {
    limpar();
  }
}

export async function buscarJson<T>(url: string, opcoes: Parameters<typeof buscar>[1]): Promise<T> {
  const resposta = await buscar(url, opcoes);
  const dados = (await resposta.json().catch(() => null)) as (T & { reason?: string }) | null;
  if (!resposta.ok || dados === null) {
    throw new ErroFonte(`${opcoes.erroRede} ${dados?.reason ?? `(erro ${resposta.status})`}`, resposta.status);
  }
  return dados;
}

export function arred(valor: number | null | undefined, casas = 2): number | null {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return null;
  const f = 10 ** casas;
  return Math.round(valor * f) / f;
}

export function media(valores: (number | null)[]): number | null {
  const v = valores.filter((x): x is number => x !== null && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function maximo(valores: (number | null)[]): number | null {
  const v = valores.filter((x): x is number => x !== null && Number.isFinite(x));
  return v.length ? Math.max(...v) : null;
}

export function minimo(valores: (number | null)[]): number | null {
  const v = valores.filter((x): x is number => x !== null && Number.isFinite(x));
  return v.length ? Math.min(...v) : null;
}

export function soma(valores: (number | null)[]): number | null {
  const v = valores.filter((x): x is number => x !== null && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) : null;
}

export function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Data de hoje "AAAA-MM-DD" no horário de Brasília. */
export function hojeBrasilia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

export function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export const NOMES_ESTADOS_SEM_ACENTO: Record<string, string> = {
  AC: "ACRE", AL: "ALAGOAS", AP: "AMAPA", AM: "AMAZONAS", BA: "BAHIA", CE: "CEARA",
  DF: "DISTRITO FEDERAL", ES: "ESPIRITO SANTO", GO: "GOIAS", MA: "MARANHAO", MT: "MATO GROSSO",
  MS: "MATO GROSSO DO SUL", MG: "MINAS GERAIS", PA: "PARA", PB: "PARAIBA", PR: "PARANA",
  PE: "PERNAMBUCO", PI: "PIAUI", RJ: "RIO DE JANEIRO", RN: "RIO GRANDE DO NORTE",
  RS: "RIO GRANDE DO SUL", RO: "RONDONIA", RR: "RORAIMA", SC: "SANTA CATARINA",
  SP: "SAO PAULO", SE: "SERGIPE", TO: "TOCANTINS",
};

export const CAPITAIS: Record<string, string> = {
  AC: "Rio Branco", AL: "Maceió", AP: "Macapá", AM: "Manaus", BA: "Salvador", CE: "Fortaleza",
  DF: "Brasília", ES: "Vitória", GO: "Goiânia", MA: "São Luís", MT: "Cuiabá", MS: "Campo Grande",
  MG: "Belo Horizonte", PA: "Belém", PB: "João Pessoa", PR: "Curitiba", PE: "Recife",
  PI: "Teresina", RJ: "Rio de Janeiro", RN: "Natal", RS: "Porto Alegre", RO: "Porto Velho",
  RR: "Boa Vista", SC: "Florianópolis", SP: "São Paulo", SE: "Aracaju", TO: "Palmas",
};

/** Guarda pequenos resultados no navegador (se o navegador permitir). */
export function lerGuardado<T>(chave: string, validadeMs: number): T | null {
  try {
    const bruto = localStorage.getItem(chave);
    if (!bruto) return null;
    const { quando, valor } = JSON.parse(bruto) as { quando: number; valor: T };
    return Date.now() - quando < validadeMs ? valor : null;
  } catch {
    return null;
  }
}

export function guardar(chave: string, valor: unknown): void {
  try {
    localStorage.setItem(chave, JSON.stringify({ quando: Date.now(), valor }));
  } catch {
    // sem armazenamento disponível: tudo bem, só não guarda
  }
}
