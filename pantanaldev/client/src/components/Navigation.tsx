import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Link, useLocation } from 'wouter';

import { PAGINAS } from '@/lib/paginas';

export default function Navigation() {
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const tabs = PAGINAS.filter((p) => p.noMenu);
  const ativa = (caminho: string) => (caminho === '/' ? location === '/' : location.startsWith(caminho));

  return (
    <nav className="sticky top-0 z-50 bg-white shadow-md">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2" onClick={() => setMobileMenuOpen(false)}>
            <div className="w-10 h-10 gradient-primary rounded-lg flex items-center justify-center text-white font-bold">
              P
            </div>
            <span className="text-xl font-bold text-gradient hidden sm:inline">
              Projeto Pantanal
            </span>
          </Link>

          {/* Desktop Menu */}
          <div className="hidden lg:flex items-center gap-1">
            {tabs.map((tab) => (
              <Link
                key={tab.caminho}
                href={tab.caminho}
                aria-current={ativa(tab.caminho) ? 'page' : undefined}
                className={`px-4 py-2 rounded-lg transition-all duration-300 font-medium text-sm ${
                  ativa(tab.caminho)
                    ? 'bg-primary text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {tab.nome}
              </Link>
            ))}
          </div>

          {/* Mobile Menu Button */}
          <button
            type="button"
            aria-label={mobileMenuOpen ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden mt-4 space-y-2 pb-4">
            {tabs.map((tab) => (
              <Link
                key={tab.caminho}
                href={tab.caminho}
                onClick={() => setMobileMenuOpen(false)}
                aria-current={ativa(tab.caminho) ? 'page' : undefined}
                className={`block w-full px-4 py-2 rounded-lg transition-all duration-300 font-medium text-left ${
                  ativa(tab.caminho)
                    ? 'bg-primary text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {tab.nome}
              </Link>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}
