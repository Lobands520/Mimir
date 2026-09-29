"""Regenerate icon/icon.svg and icon/icon-{size}.png from one geometry definition.

Run from anywhere:  python3 icon/build.py   (needs Pillow)
"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).parent
SIZES = (16, 32, 48, 128, 256)
TOP, BOTTOM = (0x33, 0x80, 0x68), (0x1b, 0x47, 0x39)   # background gradient, matches --accent #26614e
LEGS = [(34, 92), (34, 40), (64, 72), (94, 40), (94, 92)]  # the "M" polyline on a 128 grid
STROKE, DOT, DOT_COLOR, RADIUS = 13, (64, 92, 6), (0xd4, 0xea, 0xa8), 28


def hexc(c): return '#%02x%02x%02x' % c


def svg():
    points = ' '.join(f'{x},{y}' for x, y in LEGS)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{hexc(TOP)}"/><stop offset="1" stop-color="{hexc(BOTTOM)}"/></linearGradient></defs>
  <rect width="128" height="128" rx="{RADIUS}" fill="url(#g)"/>
  <polyline points="{points}" fill="none" stroke="#fff" stroke-width="{STROKE}" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="{DOT[0]}" cy="{DOT[1]}" r="{DOT[2]}" fill="{hexc(DOT_COLOR)}"/>
</svg>
'''


def png(size, scale=8):
    n = 128 * scale
    gradient = Image.new('RGB', (n, n))
    px = gradient.load()
    for y in range(n):
        for x in range(n):
            t = (x + y) / (2 * (n - 1))
            px[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(TOP, BOTTOM))
    mask = Image.new('L', (n, n), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, n - 1, n - 1), RADIUS * scale, fill=255)
    art = Image.new('RGBA', (n, n)); art.paste(gradient, (0, 0), mask)
    d = ImageDraw.Draw(art)
    pts = [(x * scale, y * scale) for x, y in LEGS]
    d.line(pts, fill='white', width=STROKE * scale)
    r = STROKE * scale / 2
    for x, y in pts: d.ellipse((x - r, y - r, x + r, y + r), fill='white')  # round caps and joins
    cx, cy, cr = (v * scale for v in DOT)
    d.ellipse((cx - cr, cy - cr, cx + cr, cy + cr), fill=DOT_COLOR)
    return art.resize((size, size), Image.LANCZOS)


if __name__ == '__main__':
    (OUT / 'icon.svg').write_text(svg())
    for size in SIZES: png(size).save(OUT / f'icon-{size}.png')
    print('wrote icon.svg and', ', '.join(f'icon-{s}.png' for s in SIZES))
