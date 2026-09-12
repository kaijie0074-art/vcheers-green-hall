"""Extract page 3's original filled Bezier paths; never trace or redraw the logo.

Usage: python3 scripts/extract_brand.py /path/to/V-cheers-logo.pdf
Requires pypdf. Output is deterministic; no source document is published.
"""
import sys
from pathlib import Path

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
COLORS = {(0.471, 0.733, 0.18): "#78bb2e", (0.471, 0.29, 0.6): "#784a99"}


def bounds(curves):
    # Include control points: conservative bounds also protect every hand-drawn curve.
    points = [point for curve in curves for command in curve["path"] for point in command[1:]]
    return (min(p[0] for p in points), min(p[1] for p in points),
            max(p[0] for p in points), max(p[1] for p in points))


def paths(curves):
    result = []
    for curve in curves:
        commands = []
        for command in curve["path"]:
            operation = command[0]
            assert operation in {"M", "C", "Z"}, operation
            coordinates = " ".join(f"{coordinate:.4f}" for point in command[1:] for coordinate in point)
            commands.append(f"{operation}{coordinates}")
        result.append(f'<path fill="{curve["color"]}" fill-rule="{curve["rule"]}" d="{" ".join(commands)}"/>')
    return "\n".join(result)


def svg(curves, favicon=False):
    x0, y0, x1, y1 = bounds(curves)
    width, height = x1 - x0, y1 - y0
    padding = height * 0.15  # Brand guide page 4: >= 15% of logo height.
    if favicon:
        side = max(width, height) + padding * 2
        x0 -= (side - width) / 2
        y0 -= (side - height) / 2
        width = height = side
    else:
        x0 -= padding
        y0 -= padding
        width += padding * 2
        height += padding * 2
    background = (f'<rect x="{x0:.4f}" y="{y0:.4f}" width="{width:.4f}" height="{height:.4f}" '
                  f'rx="{width * 0.18:.4f}" fill="#784a99"/>\n') if favicon else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0:.4f} {y0:.4f} {width:.4f} {height:.4f}">\n'
            '<!-- Original vectors from V cheers-logo规范0911(1).pdf, page 3. -->\n'
            f'{background}{paths(curves)}\n</svg>\n')


page = PdfReader(sys.argv[1]).pages[2]
page_height = float(page.mediabox.height)
artwork, stack, current_path = [], [], []
color, transformed = None, False
for values, operation in page.get_contents().operations:
    if operation == b"q":
        stack.append((color, transformed))
    elif operation == b"Q":
        color, transformed = stack.pop()
    elif operation == b"cm":
        transformed = True
    elif operation in (b"sc", b"rg"):
        color = tuple(float(value) for value in values)
    elif operation in (b"m", b"l", b"c"):
        points = [(float(values[i]), page_height - float(values[i + 1])) for i in range(0, len(values), 2)]
        current_path.append((operation.decode().upper(), *points))
    elif operation == b"h":
        current_path.append(("Z",))
    elif operation == b"re":
        # Source rectangles are page clips, not logo artwork.
        current_path.append(("RECT",))
    elif operation in (b"f", b"f*", b"n", b"S", b"s", b"B", b"B*"):
        if color in COLORS and operation in (b"f", b"f*"):
            assert not transformed, "Source logo uses an unexpected transform; inspect PDF."
            # Preserve each original painting operation: e counters are two
            # oppositely wound subpaths in one fill, V/loops are separate fills.
            artwork.append({"color": COLORS[color], "rule": "evenodd" if operation == b"f*" else "nonzero", "path": current_path})
        current_path = []

mark = [curve for curve in artwork if curve["color"] == "#78bb2e"]
assert len(artwork) == 9 and len(mark) == 3, "Unexpected source artwork; inspect PDF first."
assert sum(command[0] == "M" for curve in artwork for command in curve["path"]) == 11
for relative, content in {
    "src/assets/vcheers-logo.svg": svg(artwork),
    "src/assets/vcheers-mark.svg": svg(mark),
    "public/favicon.svg": svg(mark, favicon=True),
}.items():
    target = ROOT / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    print(relative)
