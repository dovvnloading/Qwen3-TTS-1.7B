"""Generate the Qwen3-TTS Studio application icon.

Design notes
------------
The mark is the app's own AudioVisualizer, frozen: rounded pill bars with the
same asymmetric taper the player draws, sitting on a neumorphic tile that uses
the UI's exact palette and top-left light source. That keeps the icon tied to
the product rather than being a stock equalizer glyph.

Each icon size is rendered natively (not downscaled from one master) so stroke
weights can be tuned per size. Below 48px the mark drops to three bars — five
bars at 16px collapse into an unreadable smear.

Run:  python tools/make_icon.py
"""

import os
import sys

import numpy as np
from PIL import Image, ImageDraw

# --- palette (mirrors index.css) -------------------------------------------
# Deliberately lighter than the app's #212121 surface: the Windows taskbar is
# dark by default, and a tile that literally matches it loses its silhouette.
# This keeps the neumorphic character while staying legible on dark and light.
TILE_TOP_LEFT = (62, 62, 62)      # lifted edge, light comes from top-left
TILE_BOTTOM_RIGHT = (30, 30, 30)  # falls off toward bottom-right
RIM = (255, 255, 255, 28)         # hairline that defines the edge on dark
BAR_TOP = (255, 255, 255)
BAR_BOTTOM = (156, 156, 156)
BAR_BOTTOM_SMALL = (214, 214, 214)  # less falloff so small sizes stay punchy

# Same silhouette the in-app visualizer produces: a centre-weighted, slightly
# asymmetric waveform rather than a symmetric equalizer.
BARS_LARGE = [0.34, 0.70, 1.00, 0.56, 0.30]
BARS_SMALL = [0.52, 1.00, 0.42]

SS = 8  # supersampling factor for mask edges

ICO_SIZES = [256, 128, 64, 48, 32, 24, 16]


def _linear_gradient(size, c0, c1, diagonal):
    """RGB gradient image, either diagonal (tile) or vertical (bars)."""
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    denom = max(size - 1, 1)
    t = (xx + yy) / (2.0 * denom) if diagonal else yy / denom
    t = t[..., None]
    a = np.array(c0, np.float32)
    b = np.array(c1, np.float32)
    return Image.fromarray((a * (1.0 - t) + b * t).astype(np.uint8), "RGB")


def _rounded_mask(size, box, radius):
    """Antialiased mask, drawn oversized then downsampled."""
    big = Image.new("L", (size * SS, size * SS), 0)
    d = ImageDraw.Draw(big)
    d.rounded_rectangle(
        [box[0] * SS, box[1] * SS, box[2] * SS, box[3] * SS],
        radius=radius * SS,
        fill=255,
    )
    return big.resize((size, size), Image.LANCZOS)


def _bars_mask(size, bars):
    """Pill-shaped bars, centred, using the relative geometry below."""
    big = Image.new("L", (size * SS, size * SS), 0)
    d = ImageDraw.Draw(big)

    n = len(bars)
    span = 0.66 * size            # total width the bar group occupies
    gap_ratio = 0.45              # gap as a fraction of bar width
    bar_w = span / (n + gap_ratio * (n - 1))
    gap = bar_w * gap_ratio
    max_h = 0.60 * size
    x = (size - span) / 2.0
    cy = size / 2.0

    for frac in bars:
        h = max(max_h * frac, bar_w)  # never shorter than a dot
        d.rounded_rectangle(
            [
                round(x * SS),
                round((cy - h / 2.0) * SS),
                round((x + bar_w) * SS),
                round((cy + h / 2.0) * SS),
            ],
            radius=round((bar_w / 2.0) * SS),
            fill=255,
        )
        x += bar_w + gap

    return big.resize((size, size), Image.LANCZOS)


def render(size):
    """Render one square RGBA icon at `size` pixels."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    margin = max(round(size * 0.035), 0)
    box = (margin, margin, size - 1 - margin, size - 1 - margin)
    tile_radius = (box[2] - box[0]) * 0.21

    tile = _linear_gradient(size, TILE_TOP_LEFT, TILE_BOTTOM_RIGHT, diagonal=True)
    img.paste(tile, (0, 0), _rounded_mask(size, box, tile_radius))

    # Hairline rim. Below ~32px it just muddies the edge, so skip it there.
    if size >= 32:
        rim = Image.new("RGBA", (size * SS, size * SS), (0, 0, 0, 0))
        ImageDraw.Draw(rim).rounded_rectangle(
            [box[0] * SS, box[1] * SS, box[2] * SS, box[3] * SS],
            radius=tile_radius * SS,
            outline=RIM,
            width=max(round(size * 0.008 * SS), SS // 2),
        )
        img.alpha_composite(rim.resize((size, size), Image.LANCZOS))

    large = size >= 48
    bars = BARS_LARGE if large else BARS_SMALL
    bar_grad = _linear_gradient(
        size, BAR_TOP, BAR_BOTTOM if large else BAR_BOTTOM_SMALL, diagonal=False
    )
    img.paste(bar_grad, (0, 0), _bars_mask(size, bars))

    return img


def build_preview(path, sizes=(256, 128, 64, 48, 32, 24, 16)):
    """Contact sheet on both light and dark, to sanity-check legibility."""
    pad = 24
    width = pad + sum(s + pad for s in sizes)
    row_h = max(sizes) + pad * 2
    sheet = Image.new("RGB", (width, row_h * 2), (245, 245, 245))
    sheet.paste(Image.new("RGB", (width, row_h), (26, 26, 26)), (0, row_h))

    for row, top in enumerate((0, row_h)):
        x = pad
        for s in sizes:
            icon = render(s)
            y = top + (row_h - s) // 2
            sheet.paste(icon, (x, y), icon)
            x += s + pad
    sheet.save(path)
    return path


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ico_path = os.path.join(root, "Local-TTS", "Local-TTS", "app.ico")
    favicon_path = os.path.join(root, "public", "favicon.png")
    os.makedirs(os.path.dirname(favicon_path), exist_ok=True)

    # Pillow's ICO writer would downscale a single master for us; rendering each
    # size natively instead keeps the small ones from turning to mush.
    layers = [render(s) for s in ICO_SIZES]
    layers[0].save(
        ico_path,
        format="ICO",
        sizes=[(s, s) for s in ICO_SIZES],
        append_images=layers[1:],
    )
    print(f"wrote {ico_path}  sizes={ICO_SIZES}")

    render(256).save(favicon_path)
    print(f"wrote {favicon_path}")

    if len(sys.argv) > 1:
        print(f"wrote {build_preview(sys.argv[1])}")


if __name__ == "__main__":
    main()
