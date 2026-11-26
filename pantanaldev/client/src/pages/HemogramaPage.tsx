import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "leaflet/dist/leaflet.css";
import "../hemograma/hemograma.css";

import Hemograma from "../hemograma/Hemograma";
import { LimiteDeErro } from "../hemograma/components/LimiteDeErro";

// Guarda as respostas da API no navegador por 30 minutos: repetir ou voltar
// a uma busca já feita mostra o resultado na hora, sem chamar a API.
const clienteConsultas = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 60 * 1000,
      gcTime: 60 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/** Aba "Hemograma" do site. Todo o código do hemograma fica em client/src/hemograma. */
export default function HemogramaPage() {
  return (
    <QueryClientProvider client={clienteConsultas}>
      {/* translate="no": impede o tradutor do navegador de mexer nesta aba */}
      <div translate="no" className="notranslate">
        <LimiteDeErro>
          <Hemograma />
        </LimiteDeErro>
      </div>
    </QueryClientProvider>
  );
}
