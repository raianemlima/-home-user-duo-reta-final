import "server-only";
import raw from "@/data/fundamentacoes.json";
import type { Fundamentacao } from "@/lib/questions/types";

// Fundamentação do gabarito, conferida em fonte oficial e guardada em data/fundamentacoes.json
// (confira com `node scripts/questoes/conferir-fundamentacao.mjs`). Fica no servidor e vai para o
// aparelho só quando o aluno responde — o banco inteiro com os textos de lei pesaria no celular.
const FILE = raw as { schema: 1; itens: Record<string, Fundamentacao> };

export const FUNDAMENTACOES = new Map<string, Fundamentacao>(Object.entries(FILE.itens));
export const fundamentacaoDe = (questionId: string): Fundamentacao | null => FUNDAMENTACOES.get(questionId) ?? null;
