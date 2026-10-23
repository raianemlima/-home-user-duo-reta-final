// Tabela do material: o texto guarda uma linha por linha da tabela e as células separadas por " | ".
// O leitor desenha a tabela a partir desses intervalos do texto, sem mudar o texto (os grifos usam deslocamentos nele).
export type TableCell = { from: number; to: number; sepTo: number };

const SEPARATOR = " | ";

// null quando não é tabela de verdade (quadro de uma coluna, sem " | "): aí o texto aparece como caixa comum.
export function tableLayout(text: string): TableCell[][] | null {
  if (!text.includes(SEPARATOR)) return null;
  const rows: TableCell[][] = [];
  let offset = 0;
  const lines = text.split("\n");
  lines.forEach((line, lineIndex) => {
    const cells: TableCell[] = [];
    let start = offset;
    const parts = line.split(SEPARATOR);
    parts.forEach((part, index) => {
      const to = start + part.length;
      const last = index === parts.length - 1;
      const sepTo = last ? to + (lineIndex < lines.length - 1 ? 1 : 0) : to + SEPARATOR.length;
      cells.push({ from: start, to, sepTo });
      start = sepTo;
    });
    rows.push(cells);
    offset += line.length + 1;
  });
  const width = Math.max(...rows.map((row) => row.length));
  return width > 1 ? rows : null;
}

// Recorta os pedaços (já cortados nos grifos) que caem dentro de [from, to) do texto.
export function piecesOf<T extends { text: string }>(segments: T[], from: number, to: number): T[] {
  const out: T[] = [];
  let offset = 0;
  for (const segment of segments) {
    const end = offset + segment.text.length;
    const a = Math.max(from, offset), b = Math.min(to, end);
    if (b > a) out.push({ ...segment, text: segment.text.slice(a - offset, b - offset) });
    offset = end;
  }
  return out;
}
