import { useCallback, useEffect, useState } from "react";

import type { Consulta, Fonte } from "../api/tipos";
import { ORDEM_FONTES } from "../lib/fontes";
import { validarPeriodo } from "../lib/periodo";

/**
 * Guarda a busca atual no endereço da página
 * (ex: ?estado=MS&inicio=2024-07-01&fim=2024-10-31&fontes=queimadas,clima).
 * Assim dá para salvar ou compartilhar o link de uma busca, e os botões
 * "voltar"/"avançar" do navegador voltam para as buscas anteriores.
 */
function lerDaUrl(): Consulta | null {
  const p = new URLSearchParams(window.location.search);
  const estado = p.get("estado");
  const dataInicio = p.get("inicio");
  const dataFim = p.get("fim");
  const fontes = (p.get("fontes") ?? "")
    .split(",")
    .filter((f): f is Fonte => (ORDEM_FONTES as string[]).includes(f));
  if (!estado || !dataInicio || !dataFim || fontes.length === 0) return null;
  if (validarPeriodo(dataInicio, dataFim)) return null;
  const saudeInicio = p.get("sinicio") ?? undefined;
  const saudeFim = p.get("sfim") ?? undefined;
  const saudeValida = saudeInicio && saudeFim && !validarPeriodo(saudeInicio, saudeFim);
  return {
    estado: estado.toUpperCase(),
    municipio: p.get("municipio") ?? "",
    dataInicio,
    dataFim,
    fontes,
    ...(saudeValida ? { saudeInicio, saudeFim } : {}),
  };
}

function escreverNaUrl(c: Consulta, substituir = false) {
  const p = new URLSearchParams({ estado: c.estado, inicio: c.dataInicio, fim: c.dataFim, fontes: c.fontes.join(",") });
  if (c.municipio.trim()) p.set("municipio", c.municipio.trim());
  if (c.saudeInicio && c.saudeFim) {
    p.set("sinicio", c.saudeInicio);
    p.set("sfim", c.saudeFim);
  }
  const novo = `${window.location.pathname}?${p.toString()}`;
  if (substituir) window.history.replaceState(null, "", novo);
  else if (novo !== `${window.location.pathname}${window.location.search}`) window.history.pushState(null, "", novo);
}

export function useConsultaNaUrl() {
  const [consulta, setConsulta] = useState<Consulta | null>(lerDaUrl);
  // Muda quando a pessoa usa voltar/avançar: serve para reiniciar o formulário
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    const aoNavegar = () => {
      setConsulta(lerDaUrl());
      setVersao((v) => v + 1);
    };
    window.addEventListener("popstate", aoNavegar);
    return () => window.removeEventListener("popstate", aoNavegar);
  }, []);

  // Busca feita pela pessoa no formulário (vira um passo no histórico)
  const buscar = useCallback((nova: Consulta) => {
    escreverNaUrl(nova);
    setConsulta(nova);
  }, []);

  // Busca vinda da localização (leitura rápida): atualiza também o
  // formulário com o local encontrado. Ao abrir a página, não cria um passo
  // novo no histórico (substituir = true).
  const buscarAutomatico = useCallback((nova: Consulta, substituir = true) => {
    escreverNaUrl(nova, substituir);
    setConsulta(nova);
    setVersao((v) => v + 1);
  }, []);

  return { consulta, buscar, buscarAutomatico, versao };
}
