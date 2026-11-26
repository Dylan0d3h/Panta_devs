import { useCallback, useRef, useState } from "react";

import { buscarLocalizacao, ErroApi } from "../api/cliente";
import type { Localizacao } from "../api/tipos";

export type EstadoLocalizacao =
  | { situacao: "parado" }
  | { situacao: "buscando" }
  | { situacao: "encontrada"; local: Localizacao }
  | { situacao: "erro"; mensagem: string };

/** Lê a posição do aparelho pelo navegador (pede permissão à pessoa). */
function posicaoAtual(): Promise<GeolocationPosition> {
  return new Promise((resolver, rejeitar) => {
    if (!window.isSecureContext) {
      rejeitar(
        new Error(
          "O navegador só libera a localização em endereços seguros (https) ou em localhost. Abra a página por http://localhost ou escolha o local no formulário.",
        ),
      );
      return;
    }
    if (!("geolocation" in navigator)) {
      rejeitar(new Error("Este navegador não permite obter a localização."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolver, rejeitar, {
      enableHighAccuracy: false, // precisão de cidade basta, e é bem mais rápido
      timeout: 15_000,
      maximumAge: 10 * 60 * 1000, // aceita uma posição de até 10 minutos atrás
    });
  });
}

function explicarErro(erro: unknown): string {
  if (typeof GeolocationPositionError !== "undefined" && erro instanceof GeolocationPositionError) {
    if (erro.code === erro.PERMISSION_DENIED) {
      return "Você não permitiu o acesso à localização. Para usar a leitura rápida, libere a localização no cadeado ao lado do endereço do site, ou escolha o local no formulário.";
    }
    if (erro.code === erro.TIMEOUT) return "A localização demorou demais para responder. Tente de novo ou escolha o local no formulário.";
    return "Não foi possível obter a localização do aparelho. Escolha o local no formulário.";
  }
  if (erro instanceof ErroApi || erro instanceof Error) return erro.message;
  return "Não foi possível obter sua localização.";
}

/**
 * Descobre o município e o estado de quem está usando a página:
 * 1) pede a posição ao navegador; 2) pergunta à API qual município é.
 */
export function useLocalizacao() {
  const [estado, setEstado] = useState<EstadoLocalizacao>({ situacao: "parado" });
  const emAndamento = useRef(false);

  const localizar = useCallback(async (): Promise<Localizacao | null> => {
    if (emAndamento.current) return null;
    emAndamento.current = true;
    setEstado({ situacao: "buscando" });
    try {
      const posicao = await posicaoAtual();
      const local = await buscarLocalizacao(posicao.coords.latitude, posicao.coords.longitude);
      setEstado({ situacao: "encontrada", local });
      return local;
    } catch (erro) {
      setEstado({ situacao: "erro", mensagem: explicarErro(erro) });
      return null;
    } finally {
      emAndamento.current = false;
    }
  }, []);

  return { estado, localizar };
}
