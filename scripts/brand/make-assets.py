"""Gera a marca do app a partir da pena oficial (JPG com fundo branco).

Uso: python3 scripts/brand/make-assets.py
Quando o DUO enviar a logo vetorial, substitua scripts/brand/pena-original.* e rode de novo.
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "scripts" / "brand" / "pena-original.jpg"
TERRACOTTA = (0xAE, 0x49, 0x41)
PAPER = (0xF4, 0xF5, 0xF0)
THRESHOLD = 235

src = Image.open(SRC).convert("RGB")
# Máscara: quanto mais escuro o pixel, mais opaco (preserva o antisserrilhado das bordas).
mask = src.convert("L").point(lambda v: 0 if v >= THRESHOLD else min(255, int((THRESHOLD - v) * 255 / (THRESHOLD - 120))))


def tinted(color):
    layer = Image.new("RGBA", src.size, color + (0,))
    layer.putalpha(mask)
    return layer


tinted(TERRACOTTA).save(ROOT / "public" / "brand" / "pena-terracota.png", optimize=True)
tinted(PAPER).save(ROOT / "public" / "brand" / "pena-branca.png", optimize=True)

for size in (192, 512):
    icon = Image.new("RGBA", (size, size), PAPER + (255,))
    mark = tinted(TERRACOTTA).resize((int(size * 0.86), int(size * 0.86)), Image.LANCZOS)
    offset = (size - mark.width) // 2
    icon.alpha_composite(mark, (offset, offset))
    icon.convert("RGB").save(ROOT / "public" / "icons" / f"icon-{size}.png", optimize=True)

apple = Image.open(ROOT / "public" / "icons" / "icon-192.png").resize((180, 180), Image.LANCZOS)
apple.save(ROOT / "public" / "icons" / "apple-touch-icon.png", optimize=True)
print("Marca gerada em public/brand e public/icons")
