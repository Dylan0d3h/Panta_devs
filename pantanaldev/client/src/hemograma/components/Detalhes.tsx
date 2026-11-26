import type { ReactNode } from "react";

import type { Consulta, FaixaEtaria, RespostaClima, RespostaQueimadas, RespostaSaude } from "../api/tipos";
import { CORES_GRAFICO } from "../lib/fontes";
import { comUnidade, data, mesCurto, numero, plural } from "../lib/formatar";
import { FAIXAS_AR, faixaPorNome, LIMITE_OMS_PM25 } from "../lib/qualidadeAr";
import { ICONES_FONTES } from "./FormularioBusca";
import { Ajuda, Aviso, Cartao, Esqueleto, ListaBarras, Recolhivel, Tabela } from "./ui/Basicos";
import { IconeAtualizar, IconeLeito } from "./ui/Icones";

// ---------------------------------------------------------------------------
// Estados de carregando / erro de uma seção
// ---------------------------------------------------------------------------

export function SecaoCarregando({ titulo, aviso }: { titulo: string; aviso?: string }) {
  return (
    <Cartao titulo={titulo} subtitulo={aviso}>
      <div className="space-y-3">
        <Esqueleto className="h-5 w-1/3" />
        <Esqueleto className="h-24 w-full" />
        <Esqueleto className="h-5 w-1/2" />
      </div>
    </Cartao>
  );
}

export function SecaoErro({ titulo, mensagem, tentarDeNovo }: { titulo: string; mensagem: string; tentarDeNovo: () => void }) {
  return (
    <Cartao titulo={titulo}>
      <div className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between">
        <p>
          <strong className="font-semibold">Não foi possível carregar estes dados.</strong> {mensagem}
        </p>
        <button
          type="button"
          onClick={tentarDeNovo}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 font-medium text-red-700 hover:bg-red-100"
        >
          <IconeAtualizar tamanho={15} /> Tentar de novo
        </button>
      </div>
    </Cartao>
  );
}

function Estatistica({ rotulo, valor, detalhe }: { rotulo: ReactNode; valor: ReactNode; detalhe?: ReactNode }) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-3">
      <div className="text-xs font-medium text-slate-500">{rotulo}</div>
      <div className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">{valor}</div>
      {detalhe && <div className="text-xs text-slate-500">{detalhe}</div>}
    </div>
  );
}

function Subtitulo({ children }: { children: ReactNode }) {
  return <h3 className="mb-3 text-sm font-semibold text-slate-800">{children}</h3>;
}

// ---------------------------------------------------------------------------
// Queimadas
// ---------------------------------------------------------------------------

export function SecaoQueimadas({ dados }: { dados: RespostaQueimadas }) {
  if (dados.total_focos === 0) {
    return (
      <Cartao titulo="Queimadas" icone={ICONES_FONTES.queimadas} corIcone="bg-orange-100 text-orange-700">
        {dados.aviso && (
          <div className="mb-3">
            <Aviso>{dados.aviso}</Aviso>
          </div>
        )}
        <p className="text-sm text-slate-600">Nenhum foco de queimada foi detectado nesse local e período.</p>
      </Cartao>
    );
  }
  return (
    <Cartao
      titulo="Queimadas"
      subtitulo={`${numero(dados.total_focos, 0)} focos detectados pelos satélites do INPE`}
      icone={ICONES_FONTES.queimadas}
      corIcone="bg-orange-100 text-orange-700"
    >
      {dados.aviso && (
        <div className="mb-4">
          <Aviso>{dados.aviso}</Aviso>
        </div>
      )}
      <div className="grid gap-6 *:min-w-0 lg:grid-cols-2">
        {dados.municipios_mais_focos.length > 0 && (
          <div>
            <Subtitulo>Municípios com mais focos</Subtitulo>
            <ListaBarras
              cor={CORES_GRAFICO.focos}
              formatar={(v) => numero(v, 0)}
              itens={dados.municipios_mais_focos.slice(0, 10).map((m) => ({
                rotulo: m.municipio,
                valor: m.quantidade,
                detalhe: `${numero(m.percentual_do_total, 1)}%`,
              }))}
            />
          </div>
        )}
        <div>
          <Subtitulo>
            Focos por satélite{" "}
            <Ajuda>
              Cada satélite passa em horários diferentes, então o mesmo incêndio pode ser contado por mais de um. O INPE usa
              um "satélite de referência" para comparar anos entre si.
            </Ajuda>
          </Subtitulo>
          <ListaBarras
            cor="#fb923c"
            formatar={(v) => numero(v, 0)}
            itens={dados.focos_por_satelite.map((s) => ({ rotulo: s.satelite, valor: s.quantidade }))}
          />
        </div>
      </div>
      <div className="mt-6">
        <Recolhivel titulo="Ver focos semana a semana">
          <Tabela
            colunas={[
              { titulo: "Semana até", valor: (l) => data(l.semana) },
              { titulo: "Focos", valor: (l) => numero(l.total_focos, 0), alinhar: "direita" },
            ]}
            linhas={dados.resumo_semanal}
          />
        </Recolhivel>
      </div>
    </Cartao>
  );
}

// ---------------------------------------------------------------------------
// Clima e qualidade do ar
// ---------------------------------------------------------------------------

/** Régua colorida das faixas de qualidade do ar, marcando a pior do período. */
function EscalaQualidadeAr({ pior }: { pior: string | null }) {
  return (
    <div>
      <div className="grid grid-cols-6 gap-1">
        {FAIXAS_AR.map((f) => (
          <div key={f.nome} className="text-center">
            <div
              className={`h-2.5 rounded-full ${f.nome === pior ? "ring-2 ring-slate-900 ring-offset-2" : ""}`}
              style={{ backgroundColor: f.cor }}
            />
            <div className={`mt-1.5 text-[10px] leading-tight sm:text-[11px] ${f.nome === pior ? "font-semibold text-slate-900" : "text-slate-500"}`}>
              {f.nome}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SecaoClima({ dados, agoraNoTopo = false }: { dados: RespostaClima; agoraNoTopo?: boolean }) {
  const r = dados.resumo;
  const ar = dados.qualidade_ar_periodo;
  const faixa = faixaPorNome(ar?.resumo.classificacao_pior);
  const agora = dados.qualidade_ar_atual;
  const faixaAgora = faixaPorNome(agora?.classificacao);

  return (
    <Cartao
      titulo="Clima e qualidade do ar"
      subtitulo={`Medições em ${dados.local.municipio}${dados.local.estado ? `, ${dados.local.estado}` : ""}`}
      icone={ICONES_FONTES.clima}
      corIcone="bg-sky-100 text-sky-700"
    >
      {dados.local.e_capital && (
        <div className="mb-4">
          <Aviso>
            Como nenhum município foi informado, o clima e a qualidade do ar são os da capital, {dados.local.municipio}.
          </Aviso>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 *:min-w-0 lg:grid-cols-4">
        <Estatistica
          rotulo="Temperatura"
          valor={comUnidade(r.temperatura_media, "°C")}
          detalhe={`de ${comUnidade(r.temperatura_minima, "°C")} a ${comUnidade(r.temperatura_maxima, "°C")}`}
        />
        <Estatistica rotulo="Chuva total" valor={comUnidade(r.precipitacao_total, "mm")} />
        <Estatistica rotulo="Dias sem chuva" valor={r.dias_sem_chuva !== undefined ? numero(r.dias_sem_chuva, 0) : "–"} detalhe={r.dias ? `de ${plural(r.dias, "dia", "dias")}` : undefined} />
        <Estatistica rotulo="Vento mais forte" valor={comUnidade(r.vento_maximo, "km/h")} />
      </div>

      <div className={`mt-6 grid gap-6 ${agoraNoTopo ? "" : "lg:grid-cols-2"}`}>
        <div>
          <Subtitulo>
            Qualidade do ar no período{" "}
            <Ajuda>
              Calculada pelo índice US AQI, que junta vários poluentes. A cor mostra o pior dia do período. Fumaça de
              queimadas costuma piorar muito esse índice.
            </Ajuda>
          </Subtitulo>
          {ar ? (
            <>
              <p className="mb-4 text-sm text-slate-600">
                No pior dia, o ar ficou{" "}
                <strong style={{ color: faixa?.cor }}>{ar.resumo.classificacao_pior?.toLowerCase() ?? "–"}</strong>.{" "}
                {faixa?.explicacao}
              </p>
              <EscalaQualidadeAr pior={ar.resumo.classificacao_pior} />
              <div className="mt-4 grid grid-cols-2 gap-3 *:min-w-0">
                <Estatistica rotulo="PM2.5 médio" valor={comUnidade(ar.resumo.pm2_5_media, "µg/m³")} detalhe={`pior dia: ${comUnidade(ar.resumo.pm2_5_pior_dia, "µg/m³")}`} />
                <Estatistica
                  rotulo="Dias acima da OMS"
                  valor={numero(ar.resumo.dias_pm2_5_acima_oms, 0)}
                  detalhe={`PM2.5 acima de ${LIMITE_OMS_PM25} µg/m³`}
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">O Open-Meteo não tem dados históricos de qualidade do ar para esse período.</p>
          )}
        </div>

        {!agoraNoTopo && (
        <div>
          <Subtitulo>Qualidade do ar agora</Subtitulo>
          {agora ? (
            <div className="rounded-xl border p-4" style={{ borderColor: faixaAgora?.cor, backgroundColor: faixaAgora?.fundo }}>
              <div className="text-lg font-semibold" style={{ color: faixaAgora?.cor }}>
                {agora.classificacao ?? "–"}
              </div>
              <div className="text-sm text-slate-600">Índice US AQI: {numero(agora.us_aqi, 0)}</div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                {(
                  [
                    ["PM2.5", agora.pm2_5],
                    ["PM10", agora.pm10],
                    ["Ozônio", agora.o3],
                    ["CO", agora.co],
                    ["NO₂", agora.no2],
                    ["SO₂", agora.so2],
                  ] as [string, number | null][]
                ).map(([nome, valor]) => (
                  <div key={nome} className="rounded-lg bg-white/70 px-2 py-1.5">
                    <dt className="text-slate-500">{nome}</dt>
                    <dd className="font-semibold text-slate-800 tabular-nums">{numero(valor, 1)}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 text-[11px] text-slate-500">Valores em µg/m³.</p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Sem dados de qualidade do ar no momento.</p>
          )}
        </div>
        )}
      </div>

      <div className="mt-6 space-y-3">
        <Recolhivel titulo="Ver o clima dia a dia">
          <Tabela
            colunas={[
              { titulo: "Dia", valor: (l) => data(l.data) },
              { titulo: "Temp. média", valor: (l) => comUnidade(l.temperatura_media, "°C"), alinhar: "direita" },
              { titulo: "Máxima", valor: (l) => comUnidade(l.temperatura_maxima, "°C"), alinhar: "direita" },
              { titulo: "Mínima", valor: (l) => comUnidade(l.temperatura_minima, "°C"), alinhar: "direita" },
              { titulo: "Chuva", valor: (l) => comUnidade(l.precipitacao, "mm"), alinhar: "direita" },
              { titulo: "Vento máx.", valor: (l) => comUnidade(l.vento_maximo, "km/h"), alinhar: "direita" },
            ]}
            linhas={dados.diario}
          />
        </Recolhivel>
        {ar && (
          <Recolhivel titulo="Ver a qualidade do ar dia a dia">
            <Tabela
              colunas={[
                { titulo: "Dia", valor: (l) => data(l.data) },
                {
                  titulo: "Qualidade",
                  valor: (l) => {
                    const f = faixaPorNome(l.classificacao);
                    return (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="size-2 rounded-full" style={{ backgroundColor: f?.cor ?? "#94a3b8" }} />
                        {l.classificacao ?? "–"}
                      </span>
                    );
                  },
                },
                { titulo: "PM2.5", valor: (l) => numero(l.pm2_5, 1), alinhar: "direita" },
                { titulo: "PM10", valor: (l) => numero(l.pm10, 1), alinhar: "direita" },
                { titulo: "US AQI", valor: (l) => numero(l.us_aqi_max, 0), alinhar: "direita" },
              ]}
              linhas={ar.diario}
            />
          </Recolhivel>
        )}
      </div>
    </Cartao>
  );
}

// ---------------------------------------------------------------------------
// Saúde
// ---------------------------------------------------------------------------

const ORDEM_FAIXAS = ["Criança/Adolescente (0-17)", "Adulto (18-59)", "Idoso (60+)", "Não informado"];

function juntarFaixas(internacoes: FaixaEtaria[], obitos: FaixaEtaria[]) {
  return ORDEM_FAIXAS.map((faixa) => ({
    faixa,
    internacoes: internacoes.find((f) => f.faixa_etaria === faixa),
    obitos: obitos.find((f) => f.faixa_etaria === faixa),
  })).filter((l) => l.internacoes || l.obitos);
}

function BarraPercentual({ percentual, cor }: { percentual: number; cor: string }) {
  return (
    <div className="h-2 w-full rounded-full bg-slate-100">
      <div className="h-2 rounded-full" style={{ width: `${Math.min(100, percentual)}%`, backgroundColor: cor }} />
    </div>
  );
}

/** Descreve o período da saúde: "ano de 2025" ou "01/08/2025 a 30/09/2025".
 *  No modo sem servidor, usa o período que os arquivos do site realmente cobrem. */
export function periodoSaudeTexto(consulta: Consulta, dados?: RespostaSaude): string {
  if (dados?.periodo) return dados.periodo.texto;
  const inicio = consulta.saudeInicio ?? consulta.dataInicio;
  const fim = consulta.saudeFim ?? consulta.dataFim;
  if (inicio.endsWith("-01-01") && fim.endsWith("-12-31") && inicio.slice(0, 4) === fim.slice(0, 4)) {
    return `ano de ${inicio.slice(0, 4)}`;
  }
  return `${data(inicio)} a ${data(fim)}`;
}

/** Gráfico de colunas simples (só CSS) com as internações de cada mês. */
function ColunasMensais({ linhas }: { linhas: { mes: string; internacoes: number; obitos: number }[] }) {
  const maximo = Math.max(1, ...linhas.map((l) => l.internacoes));
  return (
    <div className="overflow-x-auto">
      <div className="flex h-44 min-w-[480px] items-end gap-1.5 border-b border-slate-200 pb-1">
        {linhas.map((l) => (
          <div
            key={l.mes}
            className="group relative flex h-full flex-1 flex-col items-center justify-end"
            title={`${mesCurto(l.mes)}: ${numero(l.internacoes, 0)} internações, ${numero(l.obitos, 0)} óbitos`}
          >
            <span className="mb-1 text-[10px] font-medium text-slate-500 tabular-nums">{numero(l.internacoes, 0)}</span>
            <div
              className="w-full max-w-10 rounded-t-md transition-opacity group-hover:opacity-80"
              style={{ height: `${(l.internacoes / maximo) * 85}%`, backgroundColor: CORES_GRAFICO.internacoes, minHeight: 2 }}
            />
          </div>
        ))}
      </div>
      <div className="flex min-w-[480px] gap-1.5 pt-1">
        {linhas.map((l) => (
          <span key={l.mes} className="flex-1 text-center text-[10px] text-slate-500">
            {mesCurto(l.mes)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Leitos hospitalares: total, SUS, por tipo, ou o motivo de não ter o dado. */
function BlocoLeitos({ dados }: { dados: RespostaSaude }) {
  const leitos = dados.leitos_detalhe;
  if (!leitos || leitos.total === null) {
    return (
      <div className="rounded-xl bg-slate-50 px-4 py-3">
        <div className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
          <IconeLeito tamanho={14} /> Leitos hospitalares
        </div>
        <div className="mt-1 text-sm font-medium text-slate-700">Não disponível agora</div>
        <div className="text-xs text-slate-500">
          {leitos?.erro ?? "O CNES não respondeu."}{" "}
          {dados.periodo ? "Gere os dados de saúde de novo mais tarde para tentar outra vez." : "A próxima busca tenta de novo."}
        </div>
      </div>
    );
  }
  const principais = leitos.por_tipo.slice(0, 4);
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-3">
      <div className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
        <IconeLeito tamanho={14} /> Leitos hospitalares
        <Ajuda>
          Leitos cadastrados no CNES (Cadastro Nacional de Estabelecimentos de Saúde) em todo o estado. É uma foto do mês
          indicado. Os leitos "complementares" incluem as UTIs, importantes nos casos respiratórios graves.
        </Ajuda>
      </div>
      <div className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">{numero(leitos.total, 0)}</div>
      <div className="text-xs text-slate-500">
        {leitos.sus !== null && `${numero(leitos.sus, 0)} do SUS · `}CNES de {leitos.referencia}
      </div>
      {principais.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
          {principais.map((t) => (
            <li key={t.tipo} className="flex justify-between gap-2">
              <span className="truncate">{t.tipo}</span>
              <span className="tabular-nums">{numero(t.total, 0)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SecaoSaude({ dados, consulta }: { dados: RespostaSaude; consulta: Consulta }) {
  const faixas = juntarFaixas(dados.internacoes_por_faixa_etaria, dados.obitos_por_faixa_etaria);
  const periodoProprio = Boolean(consulta.saudeInicio);
  return (
    <Cartao
      titulo="Saúde respiratória"
      subtitulo={`Internações e óbitos pelo SUS no estado inteiro (DATASUS) · ${periodoSaudeTexto(consulta, dados)}`}
      icone={ICONES_FONTES.saude}
      corIcone="bg-violet-100 text-violet-700"
    >
      {periodoProprio && (
        <div className="mb-4">
          <Aviso>
            O DATASUS publica os dados de saúde alguns meses depois. Por isso, a leitura rápida mostra o último ano
            completo disponível ({periodoSaudeTexto(consulta, dados)}). Para outro período, use "Pesquisar outro local ou período".
          </Aviso>
        </div>
      )}
      {dados.periodo?.aviso && (
        <div className="mb-4">
          <Aviso tipo="atencao">{dados.periodo.aviso}</Aviso>
        </div>
      )}
      {dados.aviso_obitos && (
        <div className="mb-4">
          <Aviso tipo="atencao">{dados.aviso_obitos}</Aviso>
        </div>
      )}

      <div className="grid grid-cols-2 items-start gap-3 *:min-w-0 lg:grid-cols-3">
        <Estatistica rotulo="Internações" valor={numero(dados.total_internacoes, 0)} />
        <Estatistica rotulo="Óbitos" valor={numero(dados.total_obitos, 0)} />
        <div className="col-span-2 lg:col-span-1">
          <BlocoLeitos dados={dados} />
        </div>
      </div>

      {periodoProprio && dados.por_mes.length > 1 && (
        <div className="mt-6">
          <Subtitulo>Internações mês a mês</Subtitulo>
          <ColunasMensais linhas={dados.por_mes} />
        </div>
      )}

      <div className="mt-6 grid gap-6 *:min-w-0 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Subtitulo>
            Doenças mais frequentes{" "}
            <Ajuda>
              Só entram doenças respiratórias com relação com fumaça documentada em estudos. "Alta evidência": pneumonias,
              asma, bronquites e DPOC, entre outras. "Moderada": infecções das vias aéreas superiores, rinite e
              insuficiência respiratória.
            </Ajuda>
          </Subtitulo>
          {/* Celular: um cartão por doença (a tabela não cabe na tela) */}
          <ul className="space-y-2 sm:hidden">
            {dados.doencas_respiratorias.length === 0 && (
              <li className="text-sm text-slate-500">Nenhuma internação ou óbito por essas doenças no período.</li>
            )}
            {dados.doencas_respiratorias.map((l) => (
              <li key={l.cid} className="rounded-xl border border-slate-200 p-3">
                <div className="text-sm text-slate-800">{l.doenca}</div>
                <div className="text-xs text-slate-400">
                  CID {l.cid} · {l.nivel_evidencia.startsWith("Núcleo") ? "alta evidência" : "evidência moderada"}
                </div>
                <div className="mt-2 flex gap-6 text-sm">
                  <span>
                    <span className="text-slate-500">Internações </span>
                    <strong className="tabular-nums text-slate-900">{numero(l.internacoes, 0)}</strong>
                  </span>
                  <span>
                    <span className="text-slate-500">Óbitos </span>
                    <strong className="tabular-nums text-slate-900">{numero(l.obitos, 0)}</strong>
                  </span>
                </div>
              </li>
            ))}
          </ul>
          {/* Telas maiores: tabela */}
          <div className="hidden overflow-hidden rounded-xl border border-slate-200 sm:block">
            <Tabela
              colunas={[
                {
                  titulo: "Doença",
                  valor: (l) => (
                    <span className="flex max-w-[22rem] flex-col whitespace-normal">
                      <span className="text-slate-800">{l.doenca}</span>
                      <span className="text-xs text-slate-400">
                        CID {l.cid} · {l.nivel_evidencia.startsWith("Núcleo") ? "alta evidência" : "evidência moderada"}
                      </span>
                    </span>
                  ),
                },
                { titulo: "Internações", valor: (l) => numero(l.internacoes, 0), alinhar: "direita" },
                { titulo: "Óbitos", valor: (l) => numero(l.obitos, 0), alinhar: "direita" },
              ]}
              linhas={dados.doencas_respiratorias}
              vazio="Nenhuma internação ou óbito por essas doenças no período."
            />
          </div>
        </div>

        <div className="lg:col-span-2">
          <Subtitulo>Quem foi mais afetado</Subtitulo>
          {faixas.length === 0 ? (
            <p className="text-sm text-slate-500">Sem dados de idade no período.</p>
          ) : (
            <ul className="space-y-4">
              {faixas.map((l) => (
                <li key={l.faixa}>
                  <div className="mb-1.5 text-sm font-medium text-slate-800">{l.faixa}</div>
                  <div className="grid grid-cols-[5.5rem_1fr_3.5rem] items-center gap-2 text-xs text-slate-500">
                    <span>Internações</span>
                    <BarraPercentual percentual={l.internacoes?.percentual_do_total ?? 0} cor={CORES_GRAFICO.internacoes} />
                    <span className="text-right tabular-nums">{numero(l.internacoes?.percentual_do_total ?? 0, 0)}%</span>
                    <span>Óbitos</span>
                    <BarraPercentual percentual={l.obitos?.percentual_do_total ?? 0} cor={CORES_GRAFICO.obitos} />
                    <span className="text-right tabular-nums">{numero(l.obitos?.percentual_do_total ?? 0, 0)}%</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Cartao>
  );
}
