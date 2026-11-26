import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { Consulta, RespostaClima, RespostaQueimadas, RespostaSaude } from "../api/tipos";
import { CORES_GRAFICO } from "../lib/fontes";
import { mesCurto, mesLongo, numero } from "../lib/formatar";
import { mesesDoPeriodo } from "../lib/periodo";
import { LIMITE_OMS_PM25 } from "../lib/qualidadeAr";
import { Cartao, Recolhivel, Tabela, type Coluna } from "./ui/Basicos";
import { IconeCalendario } from "./ui/Icones";

interface LinhaMes {
  mes: string;
  rotulo: string;
  focos?: number | null;
  chuva?: number | null;
  temperatura?: number | null;
  pm25?: number | null;
  internacoes?: number | null;
  obitos?: number | null;
}

type Metrica = Exclude<keyof LinhaMes, "mes" | "rotulo">;

interface DefinicaoGrafico {
  chave: Metrica;
  titulo: string;
  unidade: string;
  cor: string;
  tipo: "barra" | "linha";
  casas: number;
  referencia?: { valor: number; rotulo: string };
}

/** Junta as séries mensais das três fontes numa tabela só, mês a mês. */
function cruzarMeses(
  consulta: Consulta,
  queimadas?: RespostaQueimadas,
  clima?: RespostaClima,
  saude?: RespostaSaude,
): LinhaMes[] {
  const focos = new Map(queimadas?.por_mes.map((l) => [l.mes, l.focos]));
  const climaMes = new Map(clima?.por_mes.map((l) => [l.mes, l]));
  const saudeMes = new Map(saude?.por_mes.map((l) => [l.mes, l]));

  return mesesDoPeriodo(consulta.dataInicio, consulta.dataFim).map((mes) => ({
    mes,
    rotulo: mesCurto(mes),
    focos: queimadas ? (focos.get(mes) ?? 0) : undefined,
    chuva: clima ? (climaMes.get(mes)?.precipitacao_total ?? null) : undefined,
    temperatura: clima ? (climaMes.get(mes)?.temperatura_media ?? null) : undefined,
    pm25: clima ? (climaMes.get(mes)?.pm2_5_media ?? null) : undefined,
    internacoes: saude ? (saudeMes.get(mes)?.internacoes ?? null) : undefined,
    obitos: saude ? (saudeMes.get(mes)?.obitos ?? null) : undefined,
  }));
}

function MiniGrafico({ def, linhas }: { def: DefinicaoGrafico; linhas: LinhaMes[] }) {
  const valores = linhas.map((l) => l[def.chave]).filter((v): v is number => typeof v === "number");
  const pico = linhas.reduce<LinhaMes | null>((m, l) => {
    const v = l[def.chave];
    return typeof v === "number" && (!m || v > ((m[def.chave] as number) ?? -Infinity)) ? l : m;
  }, null);

  const dica = (
    <Tooltip
      cursor={{ fill: "rgba(148,163,184,0.12)" }}
      contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
      labelFormatter={(_, itens) => {
        const mes = itens?.[0]?.payload?.mes as string | undefined;
        return mes ? mesLongo(mes) : "";
      }}
      formatter={(v) => [`${numero(Number(v), def.casas)} ${def.unidade}`, def.titulo]}
    />
  );
  // Lista (e não fragmento) para o Recharts enxergar os eixos como filhos diretos
  const eixos = [
    <CartesianGrid key="grade" vertical={false} stroke="#f1f5f9" />,
    <XAxis key="x" dataKey="rotulo" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />,
    <YAxis key="y" tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} width={40} tickFormatter={(v) => numero(Number(v), 0)} />,
  ];

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">
          <span className="mr-2 inline-block size-2.5 rounded-full align-middle" style={{ backgroundColor: def.cor }} />
          {def.titulo}
        </h3>
        <span className="text-xs text-slate-500">{def.unidade}</span>
      </div>
      <p className="mt-0.5 text-xs text-slate-500">
        {valores.length === 0
          ? "Sem dados no período"
          : pico
            ? `Maior valor em ${mesLongo(pico.mes)}: ${numero(pico[def.chave] as number, def.casas)}`
            : ""}
      </p>
      <div className="mt-3 h-40">
        <ResponsiveContainer width="100%" height="100%">
          {def.tipo === "barra" ? (
            <BarChart data={linhas} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
              {eixos}
              {dica}
              <Bar dataKey={def.chave} fill={def.cor} radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          ) : (
            <LineChart data={linhas} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
              {eixos}
              {dica}
              {def.referencia && (
                <ReferenceLine
                  y={def.referencia.valor}
                  stroke="#dc2626"
                  strokeDasharray="4 4"
                  label={{ value: def.referencia.rotulo, position: "insideTopRight", fontSize: 10, fill: "#dc2626" }}
                />
              )}
              <Line
                type="monotone"
                dataKey={def.chave}
                stroke={def.cor}
                strokeWidth={2.5}
                dot={{ r: 3, fill: def.cor }}
                connectNulls
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function PainelMensal({
  consulta,
  queimadas,
  clima,
  saude,
}: {
  consulta: Consulta;
  queimadas?: RespostaQueimadas;
  clima?: RespostaClima;
  saude?: RespostaSaude;
}) {
  const linhas = cruzarMeses(consulta, queimadas, clima, saude);

  const graficos: DefinicaoGrafico[] = [];
  if (queimadas) graficos.push({ chave: "focos", titulo: "Focos de queimada", unidade: "focos", cor: CORES_GRAFICO.focos, tipo: "barra", casas: 0 });
  if (clima) {
    graficos.push({ chave: "chuva", titulo: "Chuva", unidade: "mm", cor: CORES_GRAFICO.chuva, tipo: "barra", casas: 1 });
    if (clima.qualidade_ar_periodo) {
      graficos.push({
        chave: "pm25", titulo: "PM2.5 médio", unidade: "µg/m³", cor: CORES_GRAFICO.pm25, tipo: "linha", casas: 1,
        referencia: { valor: LIMITE_OMS_PM25, rotulo: "limite OMS" },
      });
    } else {
      graficos.push({ chave: "temperatura", titulo: "Temperatura média", unidade: "°C", cor: CORES_GRAFICO.temperatura, tipo: "linha", casas: 1 });
    }
  }
  if (saude) {
    graficos.push({ chave: "internacoes", titulo: "Internações", unidade: "internações", cor: CORES_GRAFICO.internacoes, tipo: "barra", casas: 0 });
    graficos.push({ chave: "obitos", titulo: "Óbitos", unidade: "óbitos", cor: CORES_GRAFICO.obitos, tipo: "barra", casas: 0 });
  }
  if (graficos.length === 0) return null;

  const colunas: Coluna<LinhaMes>[] = [{ titulo: "Mês", valor: (l) => mesLongo(l.mes) }];
  const adicionar = (titulo: string, chave: Metrica, casas: number) =>
    colunas.push({ titulo, valor: (l) => numero(l[chave] as number | null, casas), alinhar: "direita" });
  if (queimadas) adicionar("Focos", "focos", 0);
  if (clima) {
    adicionar("Chuva (mm)", "chuva", 1);
    adicionar("Temp. média (°C)", "temperatura", 1);
    if (clima.qualidade_ar_periodo) adicionar("PM2.5 (µg/m³)", "pm25", 1);
  }
  if (saude) {
    adicionar("Internações", "internacoes", 0);
    adicionar("Óbitos", "obitos", 0);
  }

  return (
    <Cartao
      titulo="Mês a mês"
      subtitulo="Os mesmos meses lado a lado, para comparar queimadas, clima, ar e saúde."
      icone={<IconeCalendario />}
      corIcone="bg-emerald-100 text-emerald-800"
    >
      <div className="grid gap-4 *:min-w-0 sm:grid-cols-2 xl:grid-cols-3">
        {graficos.map((g) => (
          <MiniGrafico key={g.chave} def={g} linhas={linhas} />
        ))}
      </div>
      <p className="mt-4 text-xs leading-relaxed text-slate-500">
        Os gráficos mostram quando as coisas acontecem ao mesmo tempo, mas isso sozinho não prova que uma causa a outra.
        {saude && " Os dados de saúde são do estado inteiro."}
      </p>
      <div className="mt-4">
        <Recolhivel titulo="Ver os números em tabela">
          <Tabela colunas={colunas} linhas={linhas} alturaMaxima={false} />
        </Recolhivel>
      </div>
    </Cartao>
  );
}
