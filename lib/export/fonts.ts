import { join } from "node:path";
import { Font } from "@react-pdf/renderer";

const FONTS = join(process.cwd(), "node_modules", "@fontsource");
let registered = false;

// Mesmas fontes do app (pacotes @fontsource, arquivos .woff). Sem hifenização automática: o texto do material fica intacto.
export function registerFonts() {
  if (registered) return;
  Font.register({ family: "Inter", fonts: [
    { src: join(FONTS, "inter", "files", "inter-latin-400-normal.woff"), fontWeight: 400 },
    { src: join(FONTS, "inter", "files", "inter-latin-400-italic.woff"), fontWeight: 400, fontStyle: "italic" },
    { src: join(FONTS, "inter", "files", "inter-latin-600-normal.woff"), fontWeight: 600 },
  ] });
  Font.register({ family: "Montserrat", src: join(FONTS, "montserrat", "files", "montserrat-latin-700-normal.woff"), fontWeight: 700 });
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}
