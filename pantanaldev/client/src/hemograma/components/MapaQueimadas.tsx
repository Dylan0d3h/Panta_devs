import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import { CircleMarker, MapContainer, TileLayer, useMap } from "react-leaflet";

import type { PontoMapa, RespostaQueimadas } from "../api/tipos";
import { numero } from "../lib/formatar";
import { Aviso, Cartao } from "./ui/Basicos";
import { IconeMapa } from "./ui/Icones";

const CENTRO_BRASIL: [number, number] = [-14.2, -51.9];

/** "2026-11-20 15:30" (GMT) -> "20/11/2026 12:30" no horário de Brasília. */
function dataHoraBrasilia(gmt: string | null | undefined): string {
  const m = gmt?.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/);
  if (!m) return "–";
  const instante = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - 3 * 3600 * 1000;
  const d = new Date(instante);
  const dois = (n: number) => String(n).padStart(2, "0");
  return `${dois(d.getUTCDate())}/${dois(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${dois(d.getUTCHours())}:${dois(d.getUTCMinutes())}`;
}

/** Classes de risco de fogo do INPE (valor de 0 a 1). */
function classeRisco(risco: number | null | undefined): { nome: string; cor: string } | null {
  if (risco === null || risco === undefined) return null;
  if (risco < 0.15) return { nome: "Mínimo", cor: "#16a34a" };
  if (risco < 0.4) return { nome: "Baixo", cor: "#65a30d" };
  if (risco < 0.7) return { nome: "Médio", cor: "#ca8a04" };
  if (risco < 0.95) return { nome: "Alto", cor: "#ea580c" };
  return { nome: "Crítico", cor: "#b91c1c" };
}

function texto(v: string | null | undefined): string {
  if (!v) return "–";
  // "CORUMBA" -> "Corumba" (o INPE manda tudo em maiúsculas)
  const pequenas = new Set(["da", "das", "de", "do", "dos", "e"]);
  return v
    .toLowerCase()
    .split(" ")
    .map((p, i) => (i > 0 && pequenas.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
}

function escapar(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** HTML do balão com as informações do foco, parecido com o do BDQueimadas.
 *  Cada informação fica com o rótulo em cima e o valor embaixo, para caber
 *  até em celulares pequenos. Informações que o INPE não mandou não aparecem. */
function htmlFoco(foco: PontoMapa): string {
  const risco = classeRisco(foco.risco_fogo);
  const linhas: [string, string | null][] = [
    ["Data e hora", foco.data_hora_gmt ? `${dataHoraBrasilia(foco.data_hora_gmt)} (Brasília)` : null],
    ["Satélite", foco.satelite ?? null],
    ["Município", foco.municipio ? `${texto(foco.municipio)}${foco.estado ? ` – ${texto(foco.estado)}` : ""}` : null],
    ["Bioma", foco.bioma ?? null],
    ["Dias sem chuva", foco.numero_dias_sem_chuva != null ? numero(foco.numero_dias_sem_chuva, 0) : null],
    ["Precipitação", foco.precipitacao != null ? `${numero(foco.precipitacao, 1)} mm` : null],
    ["Risco de fogo", risco ? `${risco.nome} (${numero(foco.risco_fogo, 2)})` : null],
    ["FRP (potência do fogo)", foco.frp != null ? `${numero(foco.frp, 1)} MW` : null],
    ["Latitude, longitude", `${numero(foco.latitude, 4)}, ${numero(foco.longitude, 4)}`],
  ];
  const selo = risco
    ? `<span class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white" style="background:${risco.cor}">Risco ${escapar(risco.nome.toLowerCase())}</span>`
    : "";
  const corpo = linhas
    .filter(([, valor]) => valor)
    .map(
      ([rotulo, valor]) =>
        `<div><dt class="text-[11px] text-slate-500">${escapar(rotulo)}</dt><dd class="font-medium break-words text-slate-800">${escapar(valor as string)}</dd></div>`,
    )
    .join("");
  return `<div class="text-[12px] leading-snug text-slate-700">
    <div class="mb-1.5 flex items-center justify-between gap-2 border-b border-slate-200 pb-1.5">
      <strong class="text-[13px] text-slate-900">Foco de queimada</strong>${selo}
    </div>
    <dl class="grid grid-cols-2 gap-x-3 gap-y-1.5">${corpo}</dl>
  </div>`;
}

/** Desenha os focos. Ao clicar em um, abre um balão com os detalhes dele. */
function PontosDosFocos({ pontos }: { pontos: PontoMapa[] }) {
  const mapa = useMap();
  return (
    <>
      {pontos.map((p, i) => (
        <CircleMarker
          key={i}
          center={[p.latitude, p.longitude]}
          radius={5}
          pathOptions={{ color: "#9a3412", weight: 0.8, fillColor: "#f97316", fillOpacity: 0.75 }}
          eventHandlers={{
            click: () => {
              // O balão nunca fica mais largo que o próprio mapa (celular)
              const largura = Math.max(180, Math.min(300, mapa.getSize().x - 56));
              L.popup({ maxWidth: largura, minWidth: Math.min(220, largura), autoPanPadding: [16, 16], keepInView: true })
                .setLatLng([p.latitude, p.longitude])
                .setContent(htmlFoco(p))
                .openOn(mapa);
            },
          }}
        />
      ))}
    </>
  );
}

/** Ajusta o zoom para mostrar todos os pontos sempre que eles mudam. */
function EnquadrarPontos({ pontos }: { pontos: PontoMapa[] }) {
  const mapa = useMap();
  useEffect(() => {
    if (pontos.length === 0) return;
    const lats = pontos.map((p) => p.latitude);
    const lons = pontos.map((p) => p.longitude);
    mapa.fitBounds(
      [
        [Math.min(...lats), Math.min(...lons)],
        [Math.max(...lats), Math.max(...lons)],
      ],
      { padding: [24, 24], maxZoom: 11 },
    );
  }, [mapa, pontos]);
  return null;
}

export function MapaQueimadas({ dados }: { dados: RespostaQueimadas }) {
  const [satelite, setSatelite] = useState<string | null>(null);

  // Ao trocar de busca, volta a mostrar todos os satélites
  useEffect(() => setSatelite(null), [dados]);


  const pontos = useMemo(
    () => (satelite ? dados.pontos_mapa.filter((p) => p.satelite === satelite) : dados.pontos_mapa),
    [dados, satelite],
  );

  const totalSelecionado = satelite
    ? (dados.focos_por_satelite.find((s) => s.satelite === satelite)?.quantidade ?? 0)
    : dados.total_focos;

  return (
    <Cartao
      titulo="Onde estão os focos de queimada"
      subtitulo="Cada ponto é um foco de calor detectado por satélite. Clique em um ponto para ver os detalhes, ou em um satélite para filtrar."
      icone={<IconeMapa />}
      corIcone="bg-orange-100 text-orange-700"
    >
      {dados.focos_por_satelite.length > 1 && (
        <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1">
          {[{ satelite: null as string | null, quantidade: dados.total_focos }, ...dados.focos_por_satelite].map((s) => {
            const ativo = satelite === s.satelite;
            return (
              <button
                key={s.satelite ?? "todos"}
                type="button"
                onClick={() => setSatelite(s.satelite)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition ${
                  ativo
                    ? "border-orange-600 bg-orange-600 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                {s.satelite ?? "Todos os satélites"}{" "}
                <span className={ativo ? "text-orange-100" : "text-slate-400"}>{numero(s.quantidade, 0)}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="relative overflow-hidden rounded-xl border border-slate-200">
        <MapContainer
          center={CENTRO_BRASIL}
          zoom={4}
          preferCanvas
          scrollWheelZoom={false}
          className="h-[340px] w-full sm:h-[460px]"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <PontosDosFocos pontos={pontos} />
          <EnquadrarPontos pontos={pontos} />
        </MapContainer>
        <div className="pointer-events-none absolute bottom-2 left-2 z-[400] rounded-lg bg-white/90 px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm">
          {numero(totalSelecionado, 0)} focos{satelite ? ` · ${satelite}` : ""}
        </div>
      </div>

      {dados.pontos_mapa_truncado && (
        <div className="mt-3">
          <Aviso>
            Para o mapa não ficar lento, ele mostra uma amostra de {numero(dados.pontos_mapa.length, 0)} dos{" "}
            {numero(dados.total_focos, 0)} focos. Todos os números e gráficos usam o total completo.
          </Aviso>
        </div>
      )}
    </Cartao>
  );
}
