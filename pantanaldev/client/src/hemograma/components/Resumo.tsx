import type { UseQueryResult } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";

import type { Consulta, Fonte, Meta, RespostaClima, RespostaQueimadas, RespostaSaude } from "../api/tipos";
import { nomeDoEstado } from "../lib/estados";
import { INFO_FONTES, ORDEM_FONTES } from "../lib/fontes";
import { comUnidade, data, mesLongo, numero, plural } from "../lib/formatar";
import { diasEntre } from "../lib/periodo";
import { faixaPorNome, LIMITE_OMS_PM25 } from "../lib/qualidadeAr";
import { periodoSaudeTexto } from "./Detalhes";
import { ICONES_FONTES } from "./FormularioBusca";
import { Ajuda, Esqueleto } from "./ui/Basicos";
import { IconeAlerta, IconeCalendario, IconeCheck, IconeLocal, IconeRaio, Spinner } from "./ui/Icones";

export type Consultas = {
  queimadas: UseQueryResult<RespostaQueimadas>;
  clima: UseQueryResult<RespostaClima>;
  saude: UseQueryResult<RespostaSaude>;
};

/** Conta os segundos enquanto uma fonte está carregando. */
function Cronometro() {
  const [inicio] = useState(() => Date.now());
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return <span className="tabular-nums">{Math.floor((agora - inicio) / 1000)}s</span>;
}

interface EstadoDaFonte {
  isFetching: boolean;
  isError: boolean;
  data?: { meta: Meta };
}

function SeloFonte({ fonte, consulta }: { fonte: Fonte; consulta: EstadoDaFonte }) {
  const info = INFO_FONTES[fonte];
  if (consulta.isFetching) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
        <Spinner tamanho={13} /> {info.titulo} <span className="text-slate-400">·</span> <Cronometro />
      </span>
    );
  }
  if (consulta.isError) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
        <IconeAlerta tamanho={13} /> {info.titulo}: falhou
      </span>
    );
  }
  if (consulta.data) {
    const meta = consulta.data.meta;
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
        {meta.em_cache ? <IconeRaio tamanho={13} /> : <IconeCheck tamanho={13} strokeWidth={2.5} />}
        {info.titulo}
        <span className="font-normal text-emerald-700/80">
          · {meta.em_cache ? "já estava salvo" : `${numero(meta.tempo_segundos, 1)}s`}
        </span>
      </span>
    );
  }
  return null;
}

/** Faixa no topo dos resultados: o que foi buscado e a situação de cada fonte. */
export function CabecalhoResultado({ consulta, consultas }: { consulta: Consulta; consultas: Consultas }) {
  const local = consulta.municipio ? `${consulta.municipio}, ${consulta.estado}` : `${nomeDoEstado(consulta.estado)} (estado inteiro)`;
  const dias = diasEntre(consulta.dataInicio, consulta.dataFim);
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{local}</h2>
        <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <IconeCalendario tamanho={16} /> {data(consulta.dataInicio)} a {data(consulta.dataFim)} ({plural(dias, "dia", "dias")})
          </span>
          {consulta.municipio && (
            <span className="inline-flex items-center gap-1.5">
              <IconeLocal tamanho={16} /> {nomeDoEstado(consulta.estado)}
            </span>
          )}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {ORDEM_FONTES.filter((f) => consulta.fontes.includes(f)).map((f) => (
          <SeloFonte key={f} fonte={f} consulta={consultas[f]} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Indicadores principais
// ---------------------------------------------------------------------------

function Indicador({
  rotulo,
  valor,
  detalhe,
  ajuda,
  icone,
  corIcone,
  destaque,
}: {
  rotulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
  ajuda?: ReactNode;
  icone: ReactNode;
  corIcone: string;
  destaque?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow duration-300 hover:shadow-md">
      <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
        <span className={`grid size-7 place-items-center rounded-lg ${corIcone}`}>{icone}</span>
        <span>{rotulo}</span>
        {ajuda && <Ajuda>{ajuda}</Ajuda>}
      </div>
      <div className="mt-3 text-xl font-semibold tracking-tight break-words text-slate-900 tabular-nums sm:text-2xl" style={destaque ? { color: destaque } : undefined}>
        {valor}
      </div>
      {detalhe && <div className="mt-1 text-sm text-slate-500">{detalhe}</div>}
    </div>
  );
}

function IndicadorCarregando() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <Esqueleto className="h-4 w-28" />
      <Esqueleto className="mt-4 h-7 w-24" />
      <Esqueleto className="mt-2 h-4 w-36" />
    </div>
  );
}

export function Indicadores({ consulta, consultas }: { consulta: Consulta; consultas: Consultas }) {
  const cartoes: ReactNode[] = [];
  const quer = (f: Fonte) => consulta.fontes.includes(f);

  // ---- Queimadas ----
  if (quer("queimadas")) {
    const q = consultas.queimadas.data;
    if (q) {
      const pico = q.por_mes.reduce<{ mes: string; focos: number } | null>((m, l) => (!m || l.focos > m.focos ? l : m), null);
      cartoes.push(
        <Indicador
          key="focos"
          rotulo="Focos de queimada"
          icone={ICONES_FONTES.queimadas}
          corIcone="bg-orange-100 text-orange-700"
          valor={numero(q.total_focos, 0)}
          detalhe={pico && pico.focos > 0 ? `Mais focos em ${mesLongo(pico.mes)}` : "Nenhum foco no período"}
          ajuda="Pontos de calor detectados pelos satélites do INPE. Um mesmo incêndio pode gerar vários focos, e o mesmo foco pode ser visto por mais de um satélite."
        />,
      );
    } else if (consultas.queimadas.isPending && !consultas.queimadas.isError) {
      cartoes.push(<IndicadorCarregando key="focos" />);
    }
  }

  // ---- Clima e ar ----
  if (quer("clima")) {
    const c = consultas.clima.data;
    if (c) {
      const ar = c.qualidade_ar_periodo?.resumo;
      const faixa = faixaPorNome(ar?.classificacao_pior);
      cartoes.push(
        <Indicador
          key="chuva"
          rotulo="Chuva no período"
          icone={ICONES_FONTES.clima}
          corIcone="bg-sky-100 text-sky-700"
          valor={comUnidade(c.resumo.precipitacao_total, "mm")}
          detalhe={c.resumo.dias_sem_chuva !== undefined ? `${plural(c.resumo.dias_sem_chuva, "dia", "dias")} sem chuva` : undefined}
          ajuda="Soma da chuva de todos os dias do período. 'Dia sem chuva' é um dia com menos de 1 mm. Períodos secos favorecem as queimadas."
        />,
      );
      if (!ar) {
        // Sem dados de qualidade do ar, mostra a temperatura no lugar
        cartoes.push(
          <Indicador
            key="temp"
            rotulo="Temperatura média"
            icone={<span className="text-sm font-bold">°C</span>}
            corIcone="bg-teal-100 text-teal-700"
            valor={comUnidade(c.resumo.temperatura_media, "°C")}
            detalhe={`Máxima de ${comUnidade(c.resumo.temperatura_maxima, "°C")}`}
          />,
        );
      } else {
        cartoes.push(
          <Indicador
            key="pm25"
            rotulo="PM2.5 médio"
            icone={<span className="text-[10px] font-bold">PM</span>}
            corIcone="bg-amber-100 text-amber-700"
            valor={comUnidade(ar.pm2_5_media, "µg/m³")}
            detalhe={`${plural(ar.dias_pm2_5_acima_oms, "dia", "dias")} acima do limite da OMS`}
            ajuda={`Partículas finas de poeira e fumaça que entram fundo nos pulmões. A OMS recomenda média diária de até ${LIMITE_OMS_PM25} µg/m³.`}
          />,
          <Indicador
            key="ar"
            rotulo="Pior qualidade do ar"
            icone={<span className="text-[10px] font-bold">AQI</span>}
            corIcone="bg-amber-100 text-amber-700"
            valor={<span className="text-lg leading-snug">{ar.classificacao_pior ?? "–"}</span>}
            destaque={faixa?.cor}
            detalhe={`Índice US AQI máximo: ${numero(ar.us_aqi_pior, 0)}`}
            ajuda={faixa ? faixa.explicacao : "Índice de qualidade do ar (US AQI): quanto maior, pior."}
          />,
        );
      }
    } else if (consultas.clima.isPending && !consultas.clima.isError) {
      cartoes.push(<IndicadorCarregando key="chuva" />, <IndicadorCarregando key="pm25" />);
    }
  }

  // ---- Saúde ----
  if (quer("saude")) {
    const s = consultas.saude.data;
    if (s) {
      cartoes.push(
        <Indicador
          key="internacoes"
          rotulo="Internações"
          icone={ICONES_FONTES.saude}
          corIcone="bg-violet-100 text-violet-700"
          valor={numero(s.total_internacoes, 0)}
          detalhe={consulta.saudeInicio ? `Respiratórias ligadas à fumaça · ${periodoSaudeTexto(consulta, s)}` : "Doenças respiratórias ligadas à fumaça"}
          ajuda="Internações pelo SUS no estado, por pneumonia, asma, bronquite, DPOC e outras doenças respiratórias que a literatura associa à fumaça."
        />,
        <Indicador
          key="obitos"
          rotulo="Óbitos"
          icone={ICONES_FONTES.saude}
          corIcone="bg-slate-100 text-slate-600"
          valor={numero(s.total_obitos, 0)}
          detalhe={consulta.saudeInicio ? `Pelas mesmas doenças · ${periodoSaudeTexto(consulta, s)}` : "Pelas mesmas doenças"}
          ajuda="Óbitos registrados no SIM (DATASUS) de moradores do estado. Anos muito recentes podem ainda não estar publicados."
        />,
      );
    } else if (consultas.saude.isPending && !consultas.saude.isError) {
      cartoes.push(<IndicadorCarregando key="internacoes" />, <IndicadorCarregando key="obitos" />);
    }
  }

  if (cartoes.length === 0) return null;
  return <div className="grid grid-cols-2 gap-3 *:min-w-0 md:grid-cols-[repeat(auto-fit,minmax(170px,1fr))]">{cartoes}</div>;
}
