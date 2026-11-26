import { useEffect, type ReactNode } from 'react';
import { Link, Route, Router, Switch, useLocation } from 'wouter';
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from './components/ErrorBoundary';
import { ThemeProvider } from "./contexts/ThemeContext";
import Navigation from './components/Navigation';
import HomePage from './pages/HomePage';
import ObjetivoPage from './pages/ObjetivoPage';
import RelatorioPage from './pages/RelatorioPage';
import MapaPage from './pages/MapaPage';
import MissaoPage from './pages/MissaoPage';
import EquipePage from './pages/EquipePage';
import ParceirosPage from './pages/ParceirosPage';
import HemogramaPage from './pages/HemogramaPage';
import NotFound from './pages/NotFound';
import { PAGINAS } from './lib/paginas';
import { CREDITOS_IMAGENS } from './lib/imagens';
import { useRevelarAoRolar } from './hooks/useRevelarAoRolar';

/** Volta ao topo sempre que a página muda e atualiza o título da aba do navegador. */
function AoTrocarDePagina() {
  const [location] = useLocation();
  useRevelarAoRolar(location);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const pagina = PAGINAS.find((p) => p.caminho === location);
    document.title = pagina && pagina.caminho !== '/'
      ? `${pagina.nome} | Projeto Pantanal`
      : 'Projeto Pantanal e o Desenvolvimento Regional';
  }, [location]);
  return null;
}

/** Cada página entra com um leve "fade" ao trocar de aba. */
function ConteudoAnimado({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return (
    <div key={location} className="entrada-pagina">
      {children}
    </div>
  );
}

/** Créditos das fotos de fundo (exigidos pelas licenças Creative Commons). */
function CreditosFotos() {
  return (
    <details className="mx-auto mt-4 max-w-3xl text-left text-xs text-gray-500">
      <summary className="cursor-pointer text-center hover:text-gray-300">Créditos das fotos</summary>
      <ul className="mt-3 space-y-1.5">
        {CREDITOS_IMAGENS.map((c) => (
          <li key={c.fonte}>
            <a href={c.fonte} target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-300">
              {c.descricao}
            </a>
            {" — "}
            {c.autor}, via Wikimedia Commons,{" "}
            {c.licencaUrl ? (
              <a href={c.licencaUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-300">
                {c.licenca}
              </a>
            ) : (
              c.licenca
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

function LinkRodape({ href, children }: { href: string; children: ReactNode }) {
  return (
    <li>
      <Link href={href} className="hover:text-white transition">
        {children}
      </Link>
    </li>
  );
}

// Pasta do site na hospedagem (SITE_BASE no .env.production). O wouter usa
// sem a barra final: "/" vira "" e "/pantanal/" vira "/pantanal".
const BASE_DO_SITE = (import.meta.env?.BASE_URL ?? "/").replace(/\/$/, "");

function App() {
  return (
    <ErrorBoundary>
      <Router base={BASE_DO_SITE}>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <AoTrocarDePagina />
          <div className="min-h-screen bg-white">
            <Navigation />
            <main>
              <ConteudoAnimado>
              <Switch>
                <Route path="/" component={HomePage} />
                <Route path="/objetivo" component={ObjetivoPage} />
                <Route path="/relatorio" component={RelatorioPage} />
                <Route path="/hemograma" component={HemogramaPage} />
                <Route path="/equipe" component={EquipePage} />
                <Route path="/parceiros" component={ParceirosPage} />
                <Route path="/mapa" component={MapaPage} />
                <Route path="/missao" component={MissaoPage} />
                <Route component={NotFound} />
              </Switch>
              </ConteudoAnimado>
            </main>

            {/* Footer */}
            <footer className="bg-gray-900 text-white py-12">
              <div className="container mx-auto px-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
                  <div>
                    <h3 className="text-lg font-bold mb-4">Projeto Pantanal</h3>
                    <p className="text-gray-400 text-sm">
                      Monitoramento integrado de queimadas e saúde pública na região do Pantanal
                    </p>
                  </div>
                  <div>
                    <h4 className="font-bold mb-4">Navegação</h4>
                    <ul className="space-y-2 text-sm text-gray-400">
                      <LinkRodape href="/">Início</LinkRodape>
                      <LinkRodape href="/objetivo">Objetivo</LinkRodape>
                      <LinkRodape href="/relatorio">Relatório</LinkRodape>
                      <LinkRodape href="/hemograma">Hemograma</LinkRodape>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-bold mb-4">Informações</h4>
                    <ul className="space-y-2 text-sm text-gray-400">
                      <LinkRodape href="/mapa">Mapa</LinkRodape>
                      <LinkRodape href="/equipe">Equipe</LinkRodape>
                      <LinkRodape href="/parceiros">Parceiros</LinkRodape>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-bold mb-4">Contato</h4>
                    <p className="text-sm text-gray-400">
                      Instituto Federal de Mato Grosso do Sul<br/>
                      Rua Jornalista Belizário Lima, 236<br/>
                      Campo Grande - MS
                    </p>
                  </div>
                </div>
                <div className="border-t border-gray-800 pt-8 text-center text-gray-400 text-sm">
                  <p>&copy; 2026 Projeto Pantanal e o Desenvolvimento Regional. Todos os direitos reservados.</p>
                  <CreditosFotos />
                </div>
              </div>
            </footer>
          </div>
        </TooltipProvider>
      </ThemeProvider>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
