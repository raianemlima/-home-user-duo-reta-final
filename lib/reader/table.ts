// Tabela do material: o texto guarda uma linha por linha da tabela e as células separadas por " | ".
// O leitor desenha a tabela a partir desses intervalos do texto, sem mudar o texto (os grifos usam deslocamentos nele).
// span: quantas colunas a célula ocupa (célula mesclada no Word, marcada com U+2063 no começo).
// merged: a célula continua a de cima (mesclagem vertical, marcada com U+2062); rowSpan: quantas linhas a célula ocupa.
export type TableCell = { from: number; to: number; sepTo: number; span: number; merged: boolean; rowSpan: number };

// Separador de célula: uma "|" com espaço (ou começo/fim da linha) dos dois lados. Célula vazia vira " | | " depois que a
// limpeza junta os espaços duplos ("A | | B"): por isso o separador é achado pela "|", não pelo trecho " | " inteiro.
function separators(line: string): [number, number][] {
  const found: [number, number][] = [];
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] !== "|" || (i > 0 && line[i - 1] !== " ") || (i < line.length - 1 && line[i + 1] !== " ")) continue;
    const from = Math.max(i > 0 ? i - 1 : i, found.at(-1)?.[1] ?? 0);
    found.push([from, i < line.length - 1 ? i + 2 : i + 1]);
  }
  return found;
}

// null quando não é tabela de verdade (quadro de uma coluna, sem separador): aí o texto aparece como caixa comum.
export function tableLayout(text: string): TableCell[][] | null {
  const rows: TableCell[][] = [];
  let offset = 0;
  const lines = text.split("\n");
  lines.forEach((line, lineIndex) => {
    const cells: TableCell[] = [];
    let start = 0;
    for (const [from, to] of [...separators(line), [line.length, line.length + (lineIndex < lines.length - 1 ? 1 : 0)] as [number, number]]) {
      const content = line.slice(start, Math.max(start, from));
      cells.push({ from: offset + start, to: offset + Math.max(start, from), sepTo: offset + to, span: 1 + (/^\u2063*/.exec(content)?.[0].length ?? 0), merged: content.replace(/^\u2063*/, "") === "\u2062", rowSpan: 1 });
      start = to;
    }
    rows.push(cells);
    offset += line.length + 1;
  });
  // Linha com menos colunas que a tabela (mesclagem sem marca, arquivo antigo): a última célula ocupa o que falta.
  const width = Math.max(...rows.map((row) => row.reduce((sum, cell) => sum + cell.span, 0)));
  for (const row of rows) { const used = row.reduce((sum, cell) => sum + cell.span, 0); if (used < width) row[row.length - 1].span += width - used; }
  // Mesclagem vertical: a célula de cima, na mesma coluna, cresce uma linha por célula que a continua.
  const startOf = (row: TableCell[], index: number) => row.slice(0, index).reduce((sum, cell) => sum + cell.span, 0);
  rows.forEach((row, r) => row.forEach((cell, c) => {
    if (!cell.merged) return;
    const column = startOf(row, c);
    for (let above = r - 1; above >= 0; above -= 1) {
      const index = rows[above].findIndex((other, k) => startOf(rows[above], k) === column);
      const owner = rows[above][index];
      if (!owner) break;
      if (!owner.merged) { owner.rowSpan += 1; break; }
    }
  }));
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
