// Focos de queimada. Primeiro tenta buscar direto do INPE (WFS do
// TerraBrasilis). Se o navegador não conseguir (o INPE pode bloquear chamadas
// de outros sites, ou estar fora do ar), usa o arquivo dados/queimadas/<UF>.json
// gerado pelo script gerar_dados_estaticos.py --queimadas.
// Mesmas contas do inpe_service.py / hemograma_service.py da API em Python.

import type { Consulta, PontoMapa, RespostaQueimadas } from "../tipos";
import {
  arquivoDoSite,
  arred,
  buscar,
  ErroFonte,
  foiCancelado,
  hojeBrasilia,
  NOMES_ESTADOS_SEM_ACENTO,
  semAcento,
} from "./comum";

const WFS = "https://terrabrasilis.dpi.inpe.br/queimadas/geoserver/ows";
const COLUNAS = [
  "data_hora_gmt", "satelite", "municipio", "estado", "latitude", "longitude",
  "bioma", "numero_dias_sem_chuva", "precipitacao", "risco_fogo", "frp",
];
const LIMITE_PONTOS = 5000;

/** Um foco já limpo. `quando` é a data/hora em UTC (ms). */
interface Foco {
  quando: number | null;
  satelite: string | null;
  municipio: string | null;
  estado: string | null;
  latitude: number;
  longitude: number;
  bioma: string | null;
  numero_dias_sem_chuva: number | null;
  precipitacao: number | null;
  risco_fogo: number | null;
  frp: number | null;
}

// ---------------- Leitura do CSV ----------------

function lerCsv(texto: string): string[][] {
  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ",") {
      linha.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      linha.push(campo);
      if (linha.length > 1 || linha[0] !== "") linhas.push(linha);
      linha = [];
      campo = "";
    } else campo += c;
  }
  if (campo !== "" || linha.length) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas;
}

/** O INPE usa -999 (ou vazio) quando não tem o valor. */
function numeroInpe(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(n) && n > -900 ? arred(n) : null;
}

function texto(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  const t = String(valor).trim();
  return t || null;
}

function dataUtc(valor: unknown): number | null {
  const t = texto(valor);
  if (!t) return null;
  // "2026-11-20T12:00:00Z", "2026-11-20 12:00:00" ou "2026-11-20 12:00" (sempre UTC)
  const iso = t.replace(" ", "T");
  const ms = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
  return Number.isNaN(ms) ? null : ms;
}

function paraFoco(registro: Record<string, unknown>): Foco | null {
  const latitude = Number(registro.latitude);
  const longitude = Number(registro.longitude);
  if (registro.latitude === "" || registro.latitude == null || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    quando: dataUtc(registro.data_hora_gmt),
    satelite: texto(registro.satelite),
    municipio: texto(registro.municipio),
    estado: texto(registro.estado),
    latitude,
    longitude,
    bioma: texto(registro.bioma),
    numero_dias_sem_chuva: numeroInpe(registro.numero_dias_sem_chuva),
    precipitacao: numeroInpe(registro.precipitacao),
    risco_fogo: numeroInpe(registro.risco_fogo),
    frp: numeroInpe(registro.frp),
  };
}

// ---------------- Direto do INPE ----------------

function cql(valor: string): string {
  return valor.replace(/'/g, "''");
}

function filtro(inicio: string, fim: string, uf: string, municipio: string): string {
  const partes = [
    `data_hora_gmt DURING ${inicio}T00:00:00Z/${fim}T23:59:59Z`,
    `estado = '${cql(NOMES_ESTADOS_SEM_ACENTO[uf])}'`,
  ];
  if (municipio) {
    const variantes = [...new Set([municipio, semAcento(municipio)])].sort();
    partes.push("(" + variantes.map((v) => `municipio ILIKE '${cql(v)}'`).join(" OR ") + ")");
  }
  return partes.join(" AND ");
}

async function baixarAno(ano: number, inicio: string, fim: string, consulta: Consulta, signal?: AbortSignal): Promise<Foco[]> {
  const anoAtual = Number(hojeBrasilia().slice(0, 4));
  const camada = ano === anoAtual ? "dados_abertos:focos_ano_atual_br_todosats" : `dados_abertos:focos_${ano}_br_todosats`;
  const params = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeName: camada,
    outputFormat: "csv",
    CQL_FILTER: filtro(inicio, fim, consulta.estado, consulta.municipio.trim()),
    propertyName: COLUNAS.join(","),
  });
  const pedir = async () => {
    const resposta = await buscar(`${WFS}?${params}`, {
      signal,
      tempoLimite: 60_000,
      erroRede: "Não foi possível acessar o INPE direto do navegador.",
    });
    if (!resposta.ok) throw new ErroFonte(`O INPE respondeu com erro ${resposta.status}.`, resposta.status);
    return (await resposta.text()).trim();
  };

  let corpo = await pedir();
  if (corpo.startsWith("<") && corpo.toLowerCase().includes("propert")) {
    params.delete("propertyName");
    corpo = await pedir();
  }
  if (!corpo) return [];
  if (corpo.startsWith("<")) throw new ErroFonte(`O INPE recusou a consulta: ${corpo.slice(0, 200)}`);

  const [cabecalho, ...linhas] = lerCsv(corpo);
  const focos: Foco[] = [];
  for (const valores of linhas) {
    const registro = Object.fromEntries(cabecalho.map((c, i) => [c, valores[i]]));
    const foco = paraFoco(registro);
    if (foco) focos.push(foco);
  }
  return focos;
}

async function focosDoInpe(consulta: Consulta, signal?: AbortSignal): Promise<Foco[]> {
  const anoIni = Number(consulta.dataInicio.slice(0, 4));
  const anoFim = Number(consulta.dataFim.slice(0, 4));
  const pedidos = [];
  for (let ano = anoIni; ano <= anoFim; ano++) {
    const ini = ano === anoIni ? consulta.dataInicio : `${ano}-01-01`;
    const fim = ano === anoFim ? consulta.dataFim : `${ano}-12-31`;
    pedidos.push(baixarAno(ano, ini, fim, consulta, signal));
  }
  return (await Promise.all(pedidos)).flat();
}

// ---------------- Do arquivo gerado pelo script ----------------

interface ArquivoQueimadas {
  uf: string;
  inicio: string;
  fim: string;
  gerado_em: string;
  colunas: string[];
  linhas: unknown[][];
}

function dataBr(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

async function focosDoArquivo(consulta: Consulta, signal?: AbortSignal): Promise<{ focos: Foco[]; aviso: string }> {
  const resposta = await buscar(arquivoDoSite(`dados/queimadas/${consulta.estado}.json`), {
    signal,
    tempoLimite: 30_000,
    erroRede: "Não foi possível abrir o arquivo de queimadas do site.",
  });
  const dados = resposta.ok ? ((await resposta.json().catch(() => null)) as ArquivoQueimadas | null) : null;
  if (!dados?.linhas) {
    throw new ErroFonte(
      `Não foi possível buscar as queimadas direto do INPE, e o site não tem o arquivo de queimadas de ${consulta.estado}. ` +
        'Gere com "python gerar_dados_estaticos.py --queimadas" e envie a pasta dados pelo FTP.',
    );
  }

  const municipio = semAcento(consulta.municipio.trim()).toUpperCase();
  const inicioMs = Date.parse(`${consulta.dataInicio}T00:00:00Z`);
  const fimMs = Date.parse(`${consulta.dataFim}T23:59:59Z`);
  const focos: Foco[] = [];
  for (const valores of dados.linhas) {
    const registro = Object.fromEntries(dados.colunas.map((c, i) => [c, valores[i]]));
    const foco = paraFoco(registro);
    if (!foco || foco.quando === null || foco.quando < inicioMs || foco.quando > fimMs) continue;
    if (municipio && semAcento(foco.municipio ?? "").toUpperCase() !== municipio) continue;
    focos.push(foco);
  }

  let aviso = `O INPE não respondeu direto ao navegador; os focos vêm do arquivo do site, atualizado em ${dataBr(dados.gerado_em.slice(0, 10))}.`;
  if (consulta.dataInicio < dados.inicio || consulta.dataFim > dados.fim) {
    aviso += ` Ele cobre só de ${dataBr(dados.inicio)} a ${dataBr(dados.fim)}: dias fora disso não aparecem.`;
  }
  return { focos, aviso };
}

// ---------------- Resumos (iguais aos da API) ----------------

const UM_DIA = 86_400_000;

/** Semanas de terça a segunda, com o rótulo da segunda-feira em que terminam. */
function resumoSemanal(focos: Foco[]): RespostaQueimadas["resumo_semanal"] {
  const contagem = new Map<number, number>();
  for (const f of focos) {
    if (f.quando === null) continue;
    const dia = Math.floor(f.quando / UM_DIA) * UM_DIA;
    const diaSemana = new Date(dia).getUTCDay(); // 0 = domingo, 1 = segunda
    const segunda = dia + ((1 - diaSemana + 7) % 7) * UM_DIA;
    contagem.set(segunda, (contagem.get(segunda) ?? 0) + 1);
  }
  if (!contagem.size) return [];
  const semanas = [...contagem.keys()];
  const linhas = [];
  for (let s = Math.min(...semanas); s <= Math.max(...semanas); s += 7 * UM_DIA) {
    linhas.push({ semana: new Date(s).toISOString().slice(0, 10), total_focos: contagem.get(s) ?? 0 });
  }
  return linhas;
}

function contar(valores: (string | null)[]): [string, number][] {
  const contagem = new Map<string, number>();
  for (const v of valores) if (v !== null) contagem.set(v, (contagem.get(v) ?? 0) + 1);
  return [...contagem.entries()].sort((a, b) => b[1] - a[1]);
}

function sortear<T>(lista: T[], n: number): T[] {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia.slice(0, n);
}

function dataHoraTexto(ms: number | null): string | null {
  if (ms === null) return null;
  return new Date(ms).toISOString().slice(0, 16).replace("T", " ");
}

function montarResposta(focos: Foco[], consulta: Consulta, aviso: string | null, inicio: number): RespostaQueimadas {
  const total = focos.length;
  const TRES_HORAS = 3 * 3600 * 1000; // horário de Brasília (sem horário de verão)
  const porMes = contar(focos.map((f) => (f.quando === null ? null : new Date(f.quando - TRES_HORAS).toISOString().slice(0, 7))))
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([mes, n]) => ({ mes, focos: n }));

  const truncado = total > LIMITE_PONTOS;
  const amostra = truncado ? sortear(focos, LIMITE_PONTOS) : focos;
  const pontos: PontoMapa[] = amostra.map((f) => ({
    latitude: arred(f.latitude, 4)!,
    longitude: arred(f.longitude, 4)!,
    satelite: f.satelite,
    data_hora_gmt: dataHoraTexto(f.quando),
    municipio: f.municipio,
    estado: f.estado,
    bioma: f.bioma,
    numero_dias_sem_chuva: f.numero_dias_sem_chuva,
    precipitacao: f.precipitacao,
    risco_fogo: f.risco_fogo,
    frp: f.frp,
  }));

  return {
    total_focos: total,
    focos_por_satelite: contar(focos.map((f) => f.satelite)).map(([satelite, quantidade]) => ({ satelite, quantidade })),
    resumo_semanal: resumoSemanal(focos),
    municipios_mais_focos: consulta.municipio.trim()
      ? []
      : contar(focos.map((f) => f.municipio))
          .slice(0, 15)
          .map(([municipio, quantidade]) => ({
            municipio,
            quantidade,
            percentual_do_total: arred((quantidade / total) * 100)!,
          })),
    por_mes: porMes,
    pontos_mapa: pontos,
    pontos_mapa_truncado: truncado,
    aviso,
    meta: { tempo_segundos: arred((performance.now() - inicio) / 1000) ?? 0, em_cache: false },
  };
}

// Se o navegador não conseguiu falar com o INPE uma vez (bloqueio de acesso
// entre sites), não adianta tentar de novo a cada busca nesta visita.
let inpeInacessivel = false;

export async function queimadasDireto(consulta: Consulta, signal?: AbortSignal): Promise<RespostaQueimadas> {
  const inicio = performance.now();
  try {
    if (inpeInacessivel) throw new ErroFonte("INPE inacessível nesta visita.");
    const focos = await focosDoInpe(consulta, signal);
    return montarResposta(focos, consulta, null, inicio);
  } catch (erro) {
    if (foiCancelado(erro, signal)) throw erro;
    if (erro instanceof ErroFonte && erro.status === 0) inpeInacessivel = true;
    const { focos, aviso } = await focosDoArquivo(consulta, signal);
    return montarResposta(focos, consulta, aviso, inicio);
  }
}
