// Formato das respostas da API (app/routers/hemograma.py).

export type Fonte = "queimadas" | "clima" | "saude";

export interface Consulta {
  estado: string; // sigla, ex: "MS"
  municipio: string; // vazio = estado inteiro
  dataInicio: string; // "AAAA-MM-DD"
  dataFim: string; // "AAAA-MM-DD"
  fontes: Fonte[];
  // Período próprio para a saúde (usado na leitura rápida: o DATASUS só
  // publica os dados meses depois, então a saúde usa o último ano completo)
  saudeInicio?: string;
  saudeFim?: string;
}

export interface Meta {
  tempo_segundos: number;
  em_cache: boolean;
}

// ---------------- Queimadas (INPE) ----------------

export interface PontoMapa {
  latitude: number;
  longitude: number;
  satelite?: string | null;
  data_hora_gmt?: string | null;
  municipio?: string | null;
  estado?: string | null;
  bioma?: string | null;
  numero_dias_sem_chuva?: number | null;
  precipitacao?: number | null;
  risco_fogo?: number | null;
  frp?: number | null;
}

export interface RespostaQueimadas {
  total_focos: number;
  focos_por_satelite: { satelite: string; quantidade: number }[];
  resumo_semanal: { semana: string; total_focos: number }[];
  municipios_mais_focos: { municipio: string; quantidade: number; percentual_do_total: number }[];
  por_mes: { mes: string; focos: number }[];
  pontos_mapa: PontoMapa[];
  pontos_mapa_truncado: boolean;
  // Modo sem servidor: explica quando os focos vieram do arquivo do site
  aviso?: string | null;
  meta: Meta;
}

// ---------------- Clima e ar (Open-Meteo) ----------------

export interface DiaClima {
  data: string;
  temperatura_media: number | null;
  temperatura_maxima: number | null;
  temperatura_minima: number | null;
  precipitacao: number | null;
  vento_maximo: number | null;
}

export interface DiaAr {
  data: string;
  pm2_5: number | null;
  pm10: number | null;
  co: number | null;
  no2: number | null;
  so2: number | null;
  o3: number | null;
  us_aqi_max: number | null;
  classificacao: string | null;
}

export interface QualidadeArAtual {
  pm2_5: number | null;
  pm10: number | null;
  co: number | null;
  no2: number | null;
  so2: number | null;
  o3: number | null;
  us_aqi: number | null;
  classificacao: string | null;
}

export interface ClimaAtual {
  horario: string | null;
  temperatura: number | null;
  sensacao_termica: number | null;
  umidade: number | null;
  precipitacao: number | null;
  vento: number | null;
  codigo_tempo: number | null;
}

export interface RespostaClima {
  local: { municipio: string; estado: string; latitude: number; longitude: number; e_capital: boolean };
  resumo: {
    dias?: number;
    temperatura_media?: number | null;
    temperatura_maxima?: number | null;
    temperatura_minima?: number | null;
    precipitacao_total?: number | null;
    dias_sem_chuva?: number;
    vento_maximo?: number | null;
  };
  diario: DiaClima[];
  qualidade_ar_periodo: {
    diario: DiaAr[];
    resumo: {
      pm2_5_media: number | null;
      pm2_5_pior_dia: number | null;
      dias_pm2_5_acima_oms: number;
      pm10_media: number | null;
      us_aqi_pior: number | null;
      classificacao_pior: string | null;
    };
  } | null;
  qualidade_ar_atual: QualidadeArAtual | null;
  clima_atual: ClimaAtual | null;
  por_mes: {
    mes: string;
    precipitacao_total?: number | null;
    temperatura_media?: number | null;
    temperatura_maxima?: number | null;
    pm2_5_media?: number | null;
    us_aqi_pior?: number | null;
  }[];
  meta: Meta;
}

// ---------------- Saúde (PySUS / DATASUS) ----------------

export interface FaixaEtaria {
  faixa_etaria: string;
  quantidade: number;
  percentual_do_total: number;
}

export interface RespostaSaude {
  uf: string;
  anos: number[];
  total_internacoes: number;
  total_obitos: number;
  doencas_respiratorias: {
    cid: string;
    doenca: string;
    nivel_evidencia: string;
    internacoes: number;
    obitos: number;
  }[];
  leitos_hospitalares: number | null;
  leitos_referencia: string | null;
  leitos_detalhe?: {
    total: number | null;
    sus: number | null;
    por_tipo: { tipo: string; total: number; sus: number | null }[];
    referencia: string | null;
    erro: string | null;
  };
  internacoes_por_faixa_etaria: FaixaEtaria[];
  obitos_por_faixa_etaria: FaixaEtaria[];
  por_mes: { mes: string; internacoes: number; obitos: number }[];
  aviso_obitos: string | null;
  // Modo sem servidor: o período que os arquivos do site realmente cobrem
  periodo?: { inicio: string; fim: string; texto: string; aviso: string | null };
  meta: Meta;
}

export interface RespostasPorFonte {
  queimadas: RespostaQueimadas;
  clima: RespostaClima;
  saude: RespostaSaude;
}

// ---------------- Localização (leitura rápida) ----------------

export interface Localizacao {
  municipio: string;
  uf: string;
  estado: string;
}
