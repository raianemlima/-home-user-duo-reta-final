import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cursos DUO · Reta Final DPE-SP",
    short_name: "DUO Reta Final",
    description: "Material do curso, grifos e caderno de revisão.",
    start_url: "/",
    display: "standalone",
    theme_color: "#29343A",
    background_color: "#F4F5F0",
    lang: "pt-BR",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
