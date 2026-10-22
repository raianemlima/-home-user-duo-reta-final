import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // O pdfjs resolve o próprio worker em tempo de execução; empacotado pelo Next, o arquivo do worker não é encontrado.
  serverExternalPackages: ["pdfjs-dist", "@react-pdf/renderer"],
  // Em hospedagem serverless só vão os arquivos que o rastreamento enxerga; o worker do pdfjs é carregado dinamicamente.
  outputFileTracingIncludes: {
    "/api/jobs/**": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs", "./node_modules/pdfjs-dist/standard_fonts/**/*"],
    // Exportação do caderno: fontes e logo são lidas do disco pelo gerador de PDF.
    "/api/caderno/exportar": ["./node_modules/@fontsource/arimo/files/arimo-latin-{400,700}-{normal,italic}.woff", "./node_modules/@fontsource/montserrat/files/montserrat-latin-700-normal.woff", "./public/brand/pena-verde.png"],
  },
};

export default nextConfig;
