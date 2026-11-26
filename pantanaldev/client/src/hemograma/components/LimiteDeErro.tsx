import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface Estado {
  erro: Error | null;
}

/**
 * Se algo der errado dentro do Hemograma, mostra um aviso só nesta aba,
 * em vez de deixar o site inteiro em branco.
 */
export class LimiteDeErro extends Component<Props, Estado> {
  state: Estado = { erro: null };

  static getDerivedStateFromError(erro: Error): Estado {
    return { erro };
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    console.error("[Hemograma] Erro na tela:", erro, info.componentStack);
  }

  render() {
    if (!this.state.erro) return this.props.children;

    const traducao = /removeChild|insertBefore|not a child/i.test(this.state.erro.message);
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
          <h2 className="text-lg font-semibold">Não foi possível mostrar o Hemograma.</h2>
          <p className="mt-2 text-sm">
            {traducao
              ? "Isso costuma acontecer quando o tradutor automático do navegador ou uma extensão (de leitura, tradução etc.) altera o texto da página. Desative a tradução para este site e tente de novo."
              : "Aconteceu um erro inesperado na tela. Tente de novo; se continuar, recarregue a página."}
          </p>
          <p className="mt-3 rounded-lg bg-white/70 p-2 font-mono text-xs text-amber-800">{this.state.erro.message}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => this.setState({ erro: null })}
              className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800"
            >
              Tentar de novo
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100"
            >
              Recarregar a página
            </button>
          </div>
        </div>
      </div>
    );
  }
}
