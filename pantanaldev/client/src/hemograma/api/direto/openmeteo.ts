// Clima e qualidade do ar direto do Open-Meteo (gratuito, sem chave e liberado
// para o navegador). Mesma lógica do openmeteo_service.py da API em Python.

import type { ClimaAtual, Consulta, DiaAr, DiaClima, QualidadeArAtual, RespostaClima } from "../tipos";
import {
  arred,
  buscarJson,
  CAPITAIS,
  ErroFonte,
  foiCancelado,
  guardar,
  hojeBrasilia,
  lerGuardado,
  maximo,
  media,
  minimo,
  NOMES_ESTADOS_SEM_ACENTO,
  semAcento,
  soma,
  somarDias,
} from "./comum";

const GEOCODING = "https://geocoding-api.open-meteo.com/v1/search";
const PREVISAO = "https://api.open-meteo.com/v1/forecast";
const ARQUIVO = "https://archive-api.open-meteo.com/v1/archive";
const AR = "https://air-quality-api.open-meteo.com/v1/air-quality";
const FUSO = "America/Sao_Paulo";
const ATRASO_ARQUIVO_DIAS = 6;
const LIMITE_OMS_PM25 = 15;

const VARIAVEIS_DIARIAS = [
  "temperature_2m_mean",
  "temperature_2m_max",
  "temperature_2m_min",
  "precipitation_sum",
  "wind_speed_10m_max",
];

const POLUENTES: Record<string, keyof QualidadeArAtual> = {
  pm2_5: "pm2_5",
  pm10: "pm10",
  carbon_monoxide: "co",
  nitrogen_dioxide: "no2",
  sulphur_dioxide: "so2",
  ozone: "o3",
};

const FAIXAS_US_AQI: [number, string][] = [
  [50, "Boa"],
  [100, "Moderada"],
  [150, "Ruim para grupos sensíveis"],
  [200, "Ruim"],
  [300, "Muito ruim"],
];

function classificarAqi(valor: number | null | undefined): string | null {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return null;
  for (const [limite, nome] of FAIXAS_US_AQI) if (valor <= limite) return nome;
  return "Perigosa";
}

type Diario = Record<string, (number | null)[] | string[] | undefined>;

// ---------------- Município -> coordenadas ----------------

interface LocalGeo {
  name: string;
  admin1?: string;
  latitude: number;
  longitude: number;
}

async function geocodificar(municipio: string, uf: string, signal?: AbortSignal): Promise<LocalGeo> {
  const chave = `hemograma:geo:${uf}:${semAcento(municipio).toLowerCase()}`;
  const guardado = lerGuardado<LocalGeo>(chave, 90 * 24 * 3600 * 1000);
  if (guardado) return guardado;

  const params = new URLSearchParams({ name: municipio.trim(), count: "20", language: "pt", format: "json", countryCode: "BR" });
  const dados = await buscarJson<{ results?: LocalGeo[] }>(`${GEOCODING}?${params}`, {
    signal,
    erroRede: "Não foi possível consultar o Open-Meteo (localização do município).",
  });
  const resultados = dados.results ?? [];
  if (!resultados.length) throw new ErroFonte(`Município '${municipio}' não encontrado no Open-Meteo.`, 400);
  const nomeEstado = NOMES_ESTADOS_SEM_ACENTO[uf];
  const local = resultados.find((r) => semAcento(r.admin1 ?? "").toUpperCase() === nomeEstado);
  if (!local) throw new ErroFonte(`Município '${municipio}' não encontrado no estado ${nomeEstado}.`, 400);
  guardar(chave, local);
  return local;
}

// ---------------- Clima do período ----------------

async function diarioDe(url: string, lat: number, lon: number, inicio: string, fim: string, signal?: AbortSignal) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    start_date: inicio,
    end_date: fim,
    daily: VARIAVEIS_DIARIAS.join(","),
    timezone: FUSO,
  });
  const dados = await buscarJson<{ daily?: Diario }>(`${url}?${params}`, {
    signal,
    erroRede: "Não foi possível consultar o clima no Open-Meteo.",
  });
  return dados.daily ?? {};
}

async function climaPeriodo(lat: number, lon: number, inicio: string, fim: string, signal?: AbortSignal): Promise<Diario> {
  const corte = somarDias(hojeBrasilia(), -ATRASO_ARQUIVO_DIAS);
  if (fim <= corte) return diarioDe(ARQUIVO, lat, lon, inicio, fim, signal);
  if (inicio > corte) return diarioDe(PREVISAO, lat, lon, inicio, fim, signal);
  const [antigo, novo] = await Promise.all([
    diarioDe(ARQUIVO, lat, lon, inicio, corte, signal),
    diarioDe(PREVISAO, lat, lon, somarDias(corte, 1), fim, signal),
  ]);
  const junto: Diario = {};
  for (const chave of ["time", ...VARIAVEIS_DIARIAS]) {
    junto[chave] = [...((antigo[chave] as unknown[]) ?? []), ...((novo[chave] as unknown[]) ?? [])] as (number | null)[];
  }
  return junto;
}

function tabelaDiaria(diario: Diario): DiaClima[] {
  const datas = (diario.time as string[] | undefined) ?? [];
  const valor = (chave: string, i: number) => arred(((diario[chave] as (number | null)[]) ?? [])[i]);
  return datas.map((data, i) => ({
    data,
    temperatura_media: valor("temperature_2m_mean", i),
    temperatura_maxima: valor("temperature_2m_max", i),
    temperatura_minima: valor("temperature_2m_min", i),
    precipitacao: valor("precipitation_sum", i),
    vento_maximo: valor("wind_speed_10m_max", i),
  }));
}

function resumoClima(linhas: DiaClima[]): RespostaClima["resumo"] {
  if (!linhas.length) return {};
  return {
    dias: linhas.length,
    temperatura_media: arred(media(linhas.map((l) => l.temperatura_media))),
    temperatura_maxima: arred(maximo(linhas.map((l) => l.temperatura_maxima))),
    temperatura_minima: arred(minimo(linhas.map((l) => l.temperatura_minima))),
    precipitacao_total: arred(soma(linhas.map((l) => l.precipitacao)) ?? 0),
    dias_sem_chuva: linhas.filter((l) => (l.precipitacao ?? 0) < 1).length,
    vento_maximo: arred(maximo(linhas.map((l) => l.vento_maximo))),
  };
}

// ---------------- Qualidade do ar ----------------

async function arPeriodo(lat: number, lon: number, inicio: string, fim: string, signal?: AbortSignal): Promise<RespostaClima["qualidade_ar_periodo"]> {
  const variaveis = [...Object.keys(POLUENTES), "us_aqi"];
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: variaveis.join(","),
    start_date: inicio,
    end_date: fim,
    timezone: FUSO,
  });
  const dados = await buscarJson<{ hourly?: Diario }>(`${AR}?${params}`, {
    signal,
    erroRede: "Não foi possível consultar a qualidade do ar no Open-Meteo.",
  });
  const horario = dados.hourly ?? {};
  const horas = (horario.time as string[] | undefined) ?? [];
  if (!horas.length) return null;

  // Agrupa as horas por dia: média dos poluentes e o pior índice do dia
  const porDia = new Map<string, Record<string, (number | null)[]>>();
  horas.forEach((hora, i) => {
    const dia = hora.slice(0, 10);
    const grupo = porDia.get(dia) ?? {};
    for (const v of variaveis) (grupo[v] ??= []).push(((horario[v] as (number | null)[]) ?? [])[i] ?? null);
    porDia.set(dia, grupo);
  });

  const diario: DiaAr[] = [];
  let temAlgum = false;
  for (const [dia, grupo] of [...porDia.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const linha: Record<string, unknown> = { data: dia };
    for (const [api, amigavel] of Object.entries(POLUENTES)) {
      linha[amigavel] = arred(media(grupo[api]));
      if (linha[amigavel] !== null) temAlgum = true;
    }
    const aqi = arred(maximo(grupo.us_aqi));
    linha.us_aqi_max = aqi;
    linha.classificacao = classificarAqi(aqi);
    diario.push(linha as unknown as DiaAr);
  }
  if (!temAlgum) return null;

  const pm25 = diario.map((d) => d.pm2_5);
  const aqiPior = maximo(diario.map((d) => d.us_aqi_max));
  return {
    diario,
    resumo: {
      pm2_5_media: arred(media(pm25)),
      pm2_5_pior_dia: arred(maximo(pm25)),
      dias_pm2_5_acima_oms: pm25.filter((v) => v !== null && v > LIMITE_OMS_PM25).length,
      pm10_media: arred(media(diario.map((d) => d.pm10))),
      us_aqi_pior: arred(aqiPior),
      classificacao_pior: classificarAqi(aqiPior),
    },
  };
}

async function arAgora(lat: number, lon: number, signal?: AbortSignal): Promise<QualidadeArAtual | null> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: [...Object.keys(POLUENTES), "us_aqi"].join(","),
    timezone: FUSO,
  });
  const dados = await buscarJson<{ current?: Record<string, number | null> }>(`${AR}?${params}`, {
    signal,
    erroRede: "Qualidade do ar indisponível.",
  });
  const atual = dados.current;
  if (!atual) return null;
  const resultado = Object.fromEntries(
    Object.entries(POLUENTES).map(([api, amigavel]) => [amigavel, atual[api] ?? null]),
  ) as unknown as QualidadeArAtual;
  resultado.us_aqi = atual.us_aqi ?? null;
  resultado.classificacao = classificarAqi(atual.us_aqi);
  return resultado;
}

async function tempoAgora(lat: number, lon: number, signal?: AbortSignal): Promise<ClimaAtual | null> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m",
    timezone: FUSO,
  });
  const dados = await buscarJson<{ current?: Record<string, number | string | null> }>(`${PREVISAO}?${params}`, {
    signal,
    erroRede: "Tempo agora indisponível.",
  });
  const a = dados.current;
  if (!a) return null;
  const n = (v: unknown) => arred(typeof v === "number" ? v : null);
  return {
    horario: (a.time as string) ?? null,
    temperatura: n(a.temperature_2m),
    sensacao_termica: n(a.apparent_temperature),
    umidade: n(a.relative_humidity_2m),
    precipitacao: n(a.precipitation),
    vento: n(a.wind_speed_10m),
    codigo_tempo: typeof a.weather_code === "number" ? a.weather_code : null,
  };
}

/** Uma consulta que pode falhar sem derrubar o resto (devolve null). */
async function opcional<T>(promessa: Promise<T>, signal?: AbortSignal): Promise<T | null> {
  try {
    return await promessa;
  } catch (erro) {
    if (foiCancelado(erro, signal)) throw erro;
    return null;
  }
}

function porMes(diario: DiaClima[], ar: DiaAr[]): RespostaClima["por_mes"] {
  const meses = new Map<string, RespostaClima["por_mes"][number]>();
  const grupos = <T extends { data: string }>(linhas: T[]) => {
    const g = new Map<string, T[]>();
    for (const l of linhas) {
      const mes = l.data.slice(0, 7);
      g.set(mes, [...(g.get(mes) ?? []), l]);
    }
    return g;
  };
  for (const [mes, linhas] of grupos(diario)) {
    meses.set(mes, {
      mes,
      precipitacao_total: arred(soma(linhas.map((l) => l.precipitacao)) ?? 0, 1),
      temperatura_media: arred(media(linhas.map((l) => l.temperatura_media)), 1),
      temperatura_maxima: arred(maximo(linhas.map((l) => l.temperatura_maxima)), 1),
    });
  }
  for (const [mes, linhas] of grupos(ar)) {
    const linha = meses.get(mes) ?? { mes };
    linha.pm2_5_media = arred(media(linhas.map((l) => l.pm2_5)), 1);
    linha.us_aqi_pior = arred(maximo(linhas.map((l) => l.us_aqi_max)), 1);
    meses.set(mes, linha);
  }
  return [...meses.keys()].sort().map((m) => meses.get(m)!);
}

export async function climaDireto(consulta: Consulta, signal?: AbortSignal): Promise<RespostaClima> {
  const inicio = performance.now();
  const municipio = consulta.municipio.trim() || CAPITAIS[consulta.estado];
  const local = await geocodificar(municipio, consulta.estado, signal);
  const { latitude: lat, longitude: lon } = local;

  const [diarioBruto, ar, arAtual, climaAtual] = await Promise.all([
    climaPeriodo(lat, lon, consulta.dataInicio, consulta.dataFim, signal),
    opcional(arPeriodo(lat, lon, consulta.dataInicio, consulta.dataFim, signal), signal),
    opcional(arAgora(lat, lon, signal), signal),
    opcional(tempoAgora(lat, lon, signal), signal),
  ]);
  const diario = tabelaDiaria(diarioBruto);

  return {
    local: {
      municipio: local.name,
      estado: local.admin1 ?? "",
      latitude: lat,
      longitude: lon,
      e_capital: !consulta.municipio.trim(),
    },
    resumo: resumoClima(diario),
    diario,
    qualidade_ar_periodo: ar,
    qualidade_ar_atual: arAtual,
    clima_atual: climaAtual,
    por_mes: porMes(diario, ar?.diario ?? []),
    meta: { tempo_segundos: arred((performance.now() - inicio) / 1000) ?? 0, em_cache: false },
  };
}
