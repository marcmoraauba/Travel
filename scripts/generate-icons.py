"""Genera los iconos de la app (icono iOS, adaptativo Android, splash, favicon).

Uso: pip install pillow && python3 scripts/generate-icons.py
Es un icono provisional coherente con la paleta de la app; sustitúyelo por uno de diseño
cuando lo tengas (mismos nombres y tamaños en assets/).
"""

from pathlib import Path

from PIL import Image, ImageDraw

ASSETS = Path(__file__).resolve().parent.parent / "assets"
TEAL = (14, 107, 92, 255)
CREAM = (246, 244, 239, 255)
ORANGE = (217, 130, 43, 255)
WHITE = (255, 255, 255, 255)
SS = 4  # supermuestreo para bordes suaves

# Recorrido en coordenadas normalizadas (0–1) dentro del área del glifo.
ROUTE = [(0.22, 0.74), (0.40, 0.52), (0.30, 0.34), (0.56, 0.24), (0.74, 0.46), (0.62, 0.66), (0.80, 0.80)]
STOPS = [0, 2, 4]


def bezier_path(points, steps=40):
    """Curva suave (Catmull-Rom) que pasa por los puntos."""
    out = []
    pts = [points[0]] + points + [points[-1]]
    for i in range(1, len(pts) - 2):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[i + 1], pts[i + 2]
        for s in range(steps):
            t = s / steps
            t2, t3 = t * t, t * t * t
            out.append(
                tuple(
                    0.5
                    * (
                        2 * p1[k]
                        + (-p0[k] + p2[k]) * t
                        + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2
                        + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3
                    )
                    for k in range(2)
                )
            )
    out.append(points[-1])
    return out


def draw_glyph(size, box, line, stop_fill, end_fill, bg=None):
    """Dibuja el glifo (ruta + paradas) dentro de `box` = (x0, y0, ancho) en px finales."""
    S = size * SS
    img = Image.new("RGBA", (S, S), bg or (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    x0, y0, w = (v * SS for v in box)
    to_px = lambda p: (x0 + p[0] * w, y0 + p[1] * w)  # noqa: E731

    curve = [to_px(p) for p in bezier_path(ROUTE)]
    width = int(w * 0.055)
    # Trazo discontinuo.
    dash, gap, acc, on = w * 0.07, w * 0.045, 0.0, True
    for a, b in zip(curve, curve[1:]):
        seg = ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2) ** 0.5
        if on:
            d.line([a, b], fill=line, width=width)
            r = width / 2
            d.ellipse([a[0] - r, a[1] - r, a[0] + r, a[1] + r], fill=line)
        acc += seg
        if acc >= (dash if on else gap):
            acc, on = 0.0, not on

    r_stop = w * 0.075
    for i in STOPS:
        cx, cy = to_px(ROUTE[i])
        d.ellipse([cx - r_stop, cy - r_stop, cx + r_stop, cy + r_stop], fill=stop_fill)
        ri = r_stop * 0.45
        d.ellipse([cx - ri, cy - ri, cx + ri, cy + ri], fill=bg or TEAL if stop_fill != TEAL else CREAM)

    # Destino: chincheta.
    ex, ey = to_px(ROUTE[-1])
    r_end = w * 0.1
    d.ellipse([ex - r_end, ey - r_end * 2.1, ex + r_end, ey - r_end * 0.1], fill=end_fill)
    d.polygon([(ex - r_end * 0.75, ey - r_end * 0.7), (ex + r_end * 0.75, ey - r_end * 0.7), (ex, ey + r_end * 0.4)], fill=end_fill)
    return img.resize((size, size), Image.LANCZOS)


def main():
    # iOS / genérico: 1024×1024 opaco (App Store rechaza transparencia).
    icon = draw_glyph(1024, (112, 112, 800), CREAM, CREAM, ORANGE, bg=TEAL)
    icon.convert("RGB").save(ASSETS / "icon.png")

    # Android adaptativo: 1024×1024; el contenido debe caber en el círculo central (~66 %).
    draw_glyph(1024, (232, 232, 560), CREAM, CREAM, ORANGE).save(ASSETS / "android-icon-foreground.png")
    Image.new("RGBA", (1024, 1024), TEAL).save(ASSETS / "android-icon-background.png")
    draw_glyph(1024, (232, 232, 560), WHITE, WHITE, WHITE).save(ASSETS / "android-icon-monochrome.png")

    # Splash: glifo en color sobre transparente (el fondo lo pone app.json).
    draw_glyph(1024, (112, 112, 800), TEAL, TEAL, ORANGE).save(ASSETS / "splash-icon.png")

    icon.resize((48, 48), Image.LANCZOS).convert("RGB").save(ASSETS / "favicon.png")
    print("Iconos generados en", ASSETS)


if __name__ == "__main__":
    main()
