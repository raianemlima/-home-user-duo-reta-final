export type Platform = "installed" | "ios" | "android" | "other";

// Onde o aluno está: o app já instalado, iPhone/iPad (instala pelo menu Compartilhar), Android (instala pelo navegador) ou computador.
export function detectPlatform(userAgent: string, standalone: boolean, maxTouchPoints = 0): Platform {
  if (standalone) return "installed";
  if (/iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "other";
}

export function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), "=").replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}
