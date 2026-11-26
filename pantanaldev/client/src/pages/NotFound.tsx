import { Home, MapPinOff } from "lucide-react";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <section className="flex min-h-[60vh] items-center justify-center bg-gradient-to-br from-emerald-50 to-cyan-50 px-4 py-24">
      <div className="max-w-lg text-center">
        <MapPinOff className="mx-auto mb-6 text-primary" size={56} />
        <h1 className="mb-2 text-5xl font-bold text-gray-900">404</h1>
        <h2 className="mb-4 text-xl font-semibold text-gray-700">Página não encontrada</h2>
        <p className="mb-8 text-gray-600">O endereço que você abriu não existe ou foi alterado.</p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-bold text-white transition hover:bg-emerald-600"
        >
          <Home size={18} />
          Voltar para o início
        </Link>
      </div>
    </section>
  );
}
