# Generates the app icons (run once: python3 tools/make_icons.py). Needs Pillow.
from PIL import Image, ImageDraw
S = 1024
def icon(pad=0.0, bg=(15, 21, 18)):
    im = Image.new('RGB', (S, S), bg); d = ImageDraw.Draw(im)
    m = S * (0.2 + pad); w = S - 2 * m
    rows = [((0.00, 0.34), (79, 127, 234)), ((0.30, 0.62), (154, 106, 238)), ((0.58, 1.00), (22, 167, 194))]
    rh = w / 3
    for i, ((a, b), col) in enumerate(rows):
        y = m + i * rh + rh * 0.2; h = rh * 0.6
        d.rounded_rectangle([m, y, m + w, y + h], radius=int(h * 0.3), fill=(38, 48, 43))
        x1 = m + w * (1 - b); x2 = m + w * (1 - a)
        d.rounded_rectangle([x1, y, x2, y + h], radius=int(h * 0.3), fill=col)
    return im
icon().resize((192, 192), Image.LANCZOS).save('public/icons/icon-192.png')
icon().resize((512, 512), Image.LANCZOS).save('public/icons/icon-512.png')
icon(0.08).resize((512, 512), Image.LANCZOS).save('public/icons/icon-maskable-512.png')
icon().resize((180, 180), Image.LANCZOS).save('public/icons/apple-touch-icon.png')
print('icons written')
