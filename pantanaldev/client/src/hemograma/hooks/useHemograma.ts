import { useQuery } from "@tanstack/react-query";

import { buscarFonte } from "../api/cliente";
import type { Consulta, Fonte } from "../api/tipos";

/**
 * Busca UMA fonte do Hemograma com o TanStack Query.
 *
 * - Cada fonte escolhida vira uma requisição separada, todas disparadas ao
 *   mesmo tempo: o que fica pronto primeiro já aparece na tela.
 * - A resposta fica guardada no navegador: refazer a mesma busca (ou voltar
 *   a ela) é instantâneo, sem chamar a API de novo.
 * - A chave não inclui a lista de fontes: marcar outra fonte depois não
 *   baixa de novo as que já chegaram.
 */
export function useFonte<F extends Fonte>(fonte: F, consulta: Consulta | null) {
  const ativa = consulta !== null && consulta.fontes.includes(fonte);
  return useQuery({
    queryKey: [
      "hemograma",
      fonte,
      consulta?.estado,
      consulta?.municipio.trim().toLowerCase(),
      fonte === "saude" && consulta?.saudeInicio ? consulta.saudeInicio : consulta?.dataInicio,
      fonte === "saude" && consulta?.saudeFim ? consulta.saudeFim : consulta?.dataFim,
    ],
    queryFn: ({ signal }) => buscarFonte(fonte, consulta as Consulta, signal),
    enabled: ativa,
    // A saúde já tenta de novo no servidor e pode demorar minutos:
    // repetir aqui só faria a pessoa esperar o dobro para ver o erro.
    retry: fonte === "saude" ? false : 1,
  });
}
