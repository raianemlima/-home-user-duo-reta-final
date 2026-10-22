import { join } from "node:path";
import { Font } from "@react-pdf/renderer";

const FONTS = join(process.cwd(), "node_modules", "@fontsource");
let registered = false;

// Mesmas fontes do app (pacotes @fontsource, arquivos .woff): Arimo = Arial dos e-books; Montserrat só no logotipo. Sem hifenização automática: o texto do material fica intacto.
export function registerFonts() {
  if (registered) return;
  Font.register({ family: "Arimo", fonts: [
    { src: join(FONTS, "arimo", "files", "arimo-latin-400-normal.woff"), fontWeight: 400 },
    { src: join(FONTS, "arimo", "files", "arimo-latin-400-italic.woff"), fontWeight: 400, fontStyle: "italic" },
    { src: join(FONTS, "arimo", "files", "arimo-latin-700-normal.woff"), fontWeight: 700 },
    { src: join(FONTS, "arimo", "files", "arimo-latin-700-italic.woff"), fontWeight: 700, fontStyle: "italic" },
  ] });
  Font.register({ family: "Montserrat", src: join(FONTS, "montserrat", "files", "montserrat-latin-700-normal.woff"), fontWeight: 700 });
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}
