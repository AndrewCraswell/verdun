"""Fits a scanned French war map to the ground by its printed kilometre grid.

The plans directeurs, and the official history's maps drawn from them, carry the army's Lambert grid (Nord de Guerre,
EPSG:27500) as thin lines a kilometre apart. Each line is traced along the scan, so their crossings record how the
paper was printed, folded and scanned; each crossing is pinned to its kilometre, and taken to Lambert-93. The old datum
lies some 100 m off today's, more than pyproj's ballpark conversion knows, so that offset is fitted to a few places
read on the scan and on the LiDAR (forts are best). The crossings are written as control points for battle-maps.json,
to be fitted `exact` (see apps/client/src/editor/theatre/georeference.ts).

Usage:
  python scripts/fit-battle-map-grid.py scan.jpg places.json out.json \\
      --vertical 363,909,1453 --at-row 1575 --horizontal 579,1132,1684 --at-column 2575 --corner 330000,272000

  --vertical: where each vertical line crosses row --at-row, in pixels, west to east; --horizontal: where each
  horizontal line crosses column --at-column, north to south. --corner: the Nord de Guerre metres of the north-west
  crossing (round the first trace's guess, which is printed, to whole kilometres). places.json: [{name, pixel, ground}]
  with ground in Lambert-93. Needs numpy, pillow and pyproj.
"""
import argparse
import json

import numpy as np
from PIL import Image
from pyproj import Transformer

Image.MAX_IMAGE_PIXELS = None
STEP, WINDOW = 40, 50
# A traced line counts only if it was followed this closely, in pixels, over at least this share of the scan.
FOLLOWED, SPAN = 1.5, 0.4

parser = argparse.ArgumentParser()
parser.add_argument("scan")
parser.add_argument("places")
parser.add_argument("out")
parser.add_argument("--vertical", required=True)
parser.add_argument("--at-row", type=int, required=True)
parser.add_argument("--horizontal", required=True)
parser.add_argument("--at-column", type=int, required=True)
parser.add_argument("--corner", required=True, help="a guess at the north-west crossing, within 400 m")
parser.add_argument(
    "--datum",
    default="-135,-116",
    help="the old datum's offset from pyproj's ballpark, metres E,N (measured on the July 1916 Fleury map); 'fit' to fit it",
)
parser.add_argument("--lean", default="0.03,-0.034", help="pixels across per pixel along: vertical, horizontal")
parser.add_argument("--leave-out", default="", help="names of places not to fit the offset to, comma-separated")
args = parser.parse_args()

dark = 255 - np.asarray(Image.open(args.scan).convert("L")).astype(float)
H, W = dark.shape
LEAN = dict(zip(("vertical", "horizontal"), (float(value) for value in args.lean.split(","))))


def trace(start, at, vertical):
    """A grid line's course: x as a quadratic in y (vertical) or y in x (horizontal), each pass looking closer; or
    None where no line could be followed, so a missing line keeps its place in the grid."""
    length, across = (H, W) if vertical else (W, H)
    lean = LEAN["vertical" if vertical else "horizontal"]
    fit = None
    for search in (8, 4, 3):
        keys, values = [], []
        for along in range(WINDOW, length - WINDOW, STEP):
            centre = int(round(start + lean * (along - at) if fit is None else np.polyval(fit, along)))
            if centre - search - 15 < 0 or centre + search + 16 > across:
                continue
            lo, hi = along - WINDOW // 2, along + WINDOW // 2
            band = slice(centre - search - 15, centre + search + 16)
            strip = dark[lo:hi, band] if vertical else dark[band, lo:hi].T
            profile = strip.mean(axis=0)
            peak = (profile - np.convolve(profile, np.ones(11) / 11, mode="same"))[15:-15]
            best = int(np.argmax(peak))
            if peak[best] <= 4 or best in (0, len(peak) - 1):
                continue
            a, b, c = peak[best - 1], peak[best], peak[best + 1]
            keys.append(along)
            values.append(centre - search + best + (0.5 * (a - c) / (a - 2 * b + c) if a - 2 * b + c else 0))
        keys, values = np.array(keys, dtype=float), np.array(values)
        if len(keys) < 8:
            print(f"no line near {start:.0f}")
            return None
        for _ in range(4):
            fit = np.polyfit(keys, values, 2)
            error = np.abs(np.polyval(fit, keys) - values)
            keep = error < max(1.5, 3 * np.median(error))
            keys, values = keys[keep], values[keep]
        fit = np.polyfit(keys, values, 2)
    error = float(np.median(np.abs(np.polyval(fit, keys) - values)))
    followed = error <= FOLLOWED and keys.max() - keys.min() >= SPAN * length
    print(f"{'vertical' if vertical else 'horizontal'} line from {start:.0f}: traced {keys.min():.0f} to "
          f"{keys.max():.0f}, median miss {error:.2f} px{'' if followed else ': dropped'}")
    return (fit, (keys.min(), keys.max())) if followed else None


verticals = [trace(float(x), args.at_row, True) for x in args.vertical.split(",")]
horizontals = [trace(float(y), args.at_column, False) for y in args.horizontal.split(",")]

# The crossings, row by row from the north: x = fv(y) meets y = fh(x).
nodes = []
for horizontal in horizontals:
    row = []
    for vertical in verticals:
        if horizontal is None or vertical is None:
            row.append(None)
            continue
        (fh, hspan), (fv, vspan) = horizontal, vertical
        x = np.polyval(fv, (hspan[0] + hspan[1]) / 2)
        y = np.polyval(fh, x)
        for _ in range(20):
            x, y = np.polyval(fv, y), np.polyval(fh, np.polyval(fv, y))
        inside = hspan[0] - 60 <= x <= hspan[1] + 60 and vspan[0] - 60 <= y <= vspan[1] + 60
        row.append(np.array([x, y]) if inside else None)
    nodes.append(row)


def to_lattice(pixel):
    """A pixel in grid coordinates (column east, row south), within the cell it lies in."""
    pixel = np.array(pixel, dtype=float)
    for j in range(len(nodes) - 1):
        for i in range(len(nodes[0]) - 1):
            a, b, c, d = nodes[j][i], nodes[j][i + 1], nodes[j + 1][i], nodes[j + 1][i + 1]
            if any(corner is None for corner in (a, b, c, d)):
                continue
            f = lambda u, v: a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v
            u, v = 0.5, 0.5
            for _ in range(30):
                p = f(u, v)
                jacobian = np.stack([(f(u + 1e-4, v) - p) / 1e-4, (f(u, v + 1e-4) - p) / 1e-4], axis=1)
                u, v = np.array([u, v]) + np.linalg.solve(jacobian, pixel - p)
            if -0.02 <= u <= 1.02 and -0.02 <= v <= 1.02:
                return np.array([i + u, j + v])
    return None


to_ndg = Transformer.from_crs(2154, 27500, always_xy=True)
to_l93 = Transformer.from_crs(27500, 2154, always_xy=True)
east0, north0 = (float(value) for value in args.corner.split(","))
left_out = {name.strip() for name in args.leave_out.split(",") if name.strip()}
places = [place for place in json.load(open(args.places, encoding="utf-8")) if place["name"] not in left_out]
offsets = []
for place in places:
    at = to_lattice(place["pixel"])
    if at is None:
        print(f"{place['name']} lies outside the traced grid")
        continue
    ndg = np.array(to_ndg.transform(*place["ground"]))
    offsets.append((place["name"], ndg - [east0 + 1000 * at[0], north0 - 1000 * at[1]]))
offset = np.median([o for _, o in offsets], axis=0)
if args.datum != "fit":
    # The datum's offset is the same on every sheet; the places only say which kilometre each line is.
    known = np.array([float(value) for value in args.datum.split(",")])
    whole = np.round((offset - known) / 1000) * 1000
    east0, north0 = east0 + whole[0], north0 + whole[1]
    offsets = [(name, o - whole) for name, o in offsets]
    offset = known
    print(f"north-west crossing at Nord de Guerre {east0:.0f} E, {north0:.0f} N")
print(f"datum offset {offset[0]:+.1f} m E, {offset[1]:+.1f} m N, from {len(offsets)} places; each one's miss:")
for name, o in offsets:
    print(f"  {name:<28} {np.hypot(*(o - offset)):6.1f} m")

points = []
for j, row in enumerate(nodes):
    for i, pixel in enumerate(row):
        if pixel is None:
            continue
        x, y = to_l93.transform(east0 + 1000 * i + offset[0], north0 - 1000 * j + offset[1])
        points.append({"name": f"grid {i},{j}", "pixel": [round(float(pixel[0]), 1), round(float(pixel[1]), 1)],
                       "ground": [round(x, 1), round(y, 1)]})
json.dump(points, open(args.out, "w", encoding="utf-8"), indent=1)
# The map's frame: where its grid lines end, which is where the drawn map does.
spans_x = [h[1] for h in horizontals if h is not None]
spans_y = [v[1] for v in verticals if v is not None]
frame = [min(s[0] for s in spans_x), min(s[0] for s in spans_y), max(s[1] for s in spans_x), max(s[1] for s in spans_y)]
print("frame", json.dumps([int(round(value)) for value in frame]))
print(f"{len(points)} crossings written to {args.out}")
