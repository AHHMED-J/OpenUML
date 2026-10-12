"""
Builds the application and document icons from the logo artwork.

    python3 build/icon-src/make_icons.py        (needs Pillow and NumPy)

The logo source is a photo-like JPEG of the panther drawing on a cream rounded square. The drawing
is lifted off its background as two layers (dark ink, light highlights such as the eyes) and laid on
a freshly drawn rounded square, so every size gets crisp edges and the platform's margins:

- macOS: 824 x 824 body on a 1024 canvas with the standard drop shadow (build/icon.icns, icon.png)
- Windows / Linux: nearly full-bleed body (build/icon.ico, build/icons/<n>x<n>.png)
- 48 px and below: a closer crop on the head, which stays legible where the full drawing is noise
- .mdj documents: a page with a folded corner and the head (build/document.icns, document.ico)
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter

HERE = Path(__file__).resolve().parent
BUILD = HERE.parent
RESOURCES = BUILD.parent / 'resources'

# Where the cream square sits in the source picture, and the drawing inside it (square coordinates).
SOURCE_SQUARE = (355, 93, 970, 710)
DRAWING_MARGIN = 30  # the square's bevel and shadow are within this band
HEAD_CROP = (95, 30, 455, 390)  # square coordinates of the head, for the small sizes

BG = 228  # luminance of the cream background in the source
INK = (24, 22, 20)
LIGHT = (252, 251, 244)
CREAM_TOP = (240, 237, 218)
CREAM_BOTTOM = (226, 222, 199)
SS = 4  # supersampling for anti-aliased shapes


def drawing_layers() -> tuple[Image.Image, Image.Image]:
    """The drawing as RGBA ink (darker than the background) and light (lighter) layers, square-sized."""
    square = Image.open(HERE / 'logo-source.jpg').convert('RGB').crop(SOURCE_SQUARE)
    lum = np.asarray(square.convert('L')).astype(np.float32)
    h, w = lum.shape
    inside = np.zeros((h, w), np.float32)
    m = DRAWING_MARGIN
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((m, m, w - m, h - m), radius=90, fill=255)
    inside = np.asarray(mask.filter(ImageFilter.GaussianBlur(4))).astype(np.float32) / 255

    ink_alpha = np.clip((BG - 6 - lum) / (BG - 6 - 18), 0, 1) * inside
    # Highlights only within the animal (near ink), not on the paper.
    near_ink = np.asarray(Image.fromarray((ink_alpha > 0.25).astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(9))) / 255
    light_alpha = np.clip((lum - BG - 5) / (255 - BG - 5), 0, 1) * inside * near_ink

    def layer(color: tuple[int, int, int], alpha: np.ndarray) -> Image.Image:
        img = Image.new('RGBA', (w, h), color + (0,))
        img.putalpha(Image.fromarray((alpha * 255).round().astype(np.uint8)))
        return img

    return layer(INK, ink_alpha), layer(LIGHT, light_alpha)


def squircle_mask(size: int, body: int, offset: int) -> Image.Image:
    """Anti-aliased superellipse (n = 5, the continuous-corner look of app icons)."""
    big = size * SS
    yy, xx = np.mgrid[0:big, 0:big].astype(np.float32)
    r = body * SS / 2
    c = offset * SS + r
    inside = (np.abs((xx + 0.5 - c) / r) ** 5 + np.abs((yy + 0.5 - c) / r) ** 5) <= 1
    return Image.fromarray(inside.astype(np.uint8) * 255).resize((size, size), Image.LANCZOS)


def cream(size: int) -> Image.Image:
    t = np.linspace(0, 1, size, dtype=np.float32)[:, None, None]
    grad = np.array(CREAM_TOP, np.float32) * (1 - t) + np.array(CREAM_BOTTOM, np.float32) * t
    return Image.fromarray(np.broadcast_to(grad, (size, size, 3)).round().astype(np.uint8)).convert('RGBA')


def crop_fade(width: int, height: int) -> np.ndarray:
    """Fades a crop out toward its bottom and right edges, so the neck does not end in a straight cut."""
    x = np.linspace(0, 1, width, dtype=np.float32)[None, :]
    y = np.linspace(0, 1, height, dtype=np.float32)[:, None]
    fade_x = np.clip((1 - x) / 0.22, 0, 1)
    fade_y = np.clip((1 - y) / 0.30, 0, 1)
    return (fade_x * fade_y) ** 1.5


def place(canvas: Image.Image, layers: tuple[Image.Image, Image.Image], box: tuple[int, int, int, int], crop: tuple[int, int, int, int] | None) -> None:
    left, top, width, height = box
    for i, layer in enumerate(layers):
        part = layer.crop(crop) if crop else layer
        part = part.resize((width, height), Image.LANCZOS)
        alpha = np.asarray(part.getchannel('A')).astype(np.float32) / 255
        if crop:
            alpha *= crop_fade(width, height)
        if i == 0 and width <= 48:
            # Tiny sizes: the stippled ink averages to grey; darken it so the head reads as a shape.
            alpha = alpha ** 0.55
        part.putalpha(Image.fromarray((alpha * 255).round().astype(np.uint8)))
        if width >= 128:
            part = part.filter(ImageFilter.UnsharpMask(radius=1.2, percent=60, threshold=2))
        canvas.alpha_composite(part, (left, top))


def app_icon(size: int, platform: str, layers, small: bool) -> Image.Image:
    """`platform` 'mac' (824/1024 body, shadow) or 'full' (Windows/Linux, almost full-bleed)."""
    body = round(size * (824 / 1024 if platform == 'mac' else 0.94))
    offset = (size - body) // 2
    mask = squircle_mask(size, body, offset)
    tile = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    face = cream(size)
    if small:
        # Head only, filling most of the tile.
        inset = round(body * 0.06)
        place(face, layers, (offset + inset, offset + inset, body - 2 * inset, body - 2 * inset), HEAD_CROP)
    else:
        place(face, layers, (offset, offset, body, body), None)
    tile.paste(face, (0, 0), mask)
    if platform == 'mac' and size >= 64:
        shadow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        shadow.putalpha(mask.point(lambda a: a * 0.32))
        shadow = ImageChops.offset(shadow, 0, round(size * 12 / 1024)).filter(ImageFilter.GaussianBlur(size * 14 / 1024))
        shadow.alpha_composite(tile)
        tile = shadow
    return tile


def document_icon(size: int, layers) -> Image.Image:
    """A page with a folded corner and the head, for .mdj files."""
    big = size * SS
    page = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(page)
    l, t, r, b = big * 0.19, big * 0.08, big * 0.81, big * 0.92
    fold = (r - l) * 0.28
    outline = (150, 146, 128, 255)
    d.polygon([(l, t), (r - fold, t), (r, t + fold), (r, b), (l, b)], fill=(252, 251, 246, 255), outline=outline, width=max(SS, big // 128))
    d.polygon([(r - fold, t), (r - fold, t + fold), (r, t + fold)], fill=(226, 222, 199, 255), outline=outline, width=max(SS, big // 128))
    page = page.resize((size, size), Image.LANCZOS)
    head = round(size * 0.46)
    place(page, layers, ((size - head) // 2, round(size * 0.40), head, head), HEAD_CROP)
    return page


def save_ico(path: Path, images: dict[int, Image.Image]) -> None:
    sizes = sorted(images)
    largest = images[sizes[-1]]
    largest.save(path, format='ICO', sizes=[(s, s) for s in sizes], append_images=[images[s] for s in sizes[:-1]])


def main() -> None:
    layers = drawing_layers()
    (BUILD / 'icons').mkdir(exist_ok=True)
    RESOURCES.mkdir(exist_ok=True)

    mac = {s: app_icon(s, 'mac', layers, small=s <= 48) for s in (16, 32, 64, 128, 256, 512, 1024)}
    full = {s: app_icon(s, 'full', layers, small=s <= 48) for s in (16, 24, 32, 48, 64, 128, 256, 512, 1024)}
    doc = {s: document_icon(s, layers) for s in (16, 32, 48, 64, 128, 256, 512, 1024)}

    mac[1024].save(BUILD / 'icon.png')
    mac[1024].save(BUILD / 'icon.icns', append_images=[mac[s] for s in (16, 32, 64, 128, 256, 512)])
    save_ico(BUILD / 'icon.ico', {s: full[s] for s in (16, 24, 32, 48, 64, 128, 256)})
    for s in (16, 24, 32, 48, 64, 128, 256, 512, 1024):
        full[s].save(BUILD / 'icons' / f'{s}x{s}.png')
    full[512].save(RESOURCES / 'icon.png')

    doc[1024].save(BUILD / 'document.icns', append_images=[doc[s] for s in (16, 32, 64, 128, 256, 512)])
    save_ico(BUILD / 'document.ico', {s: doc[s] for s in (16, 32, 48, 64, 128, 256)})
    print('icons written to', BUILD, 'and', RESOURCES)


if __name__ == '__main__':
    main()
