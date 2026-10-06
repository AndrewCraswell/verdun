"""Traces a front line printed in its own colour on a fitted battle map into a line on the ground.

The official history's maps print each side's first line in one colour, the German usually a heavy blue. This picks
that ink out, thins it to a centre line, follows it, joins it across small breaks (a label, a road crossing it), and
takes it to Lambert-93 through the sheet's own kilometre grid (its `grid i,j` control points in battle-maps.json).
Breaks too long to join are kept as separate pieces and reported with where they lie, to be checked by eye.

Usage:
  python scripts/trace-front-line.py MAP_ID --ink blue --out pieces.json [--exclude x0,y0,x1,y1 ...] [--join 80]

  --ink: blue (B - R > 35, B - G > 5) or red (R - G > 45, R - B > 35). --exclude: boxes of the scan to leave out
  (the legend's samples of the ink). --join: the longest break to bridge, in scan pixels. Needs numpy, pillow, opencv.
"""
import argparse
import json
from collections import deque
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument("map")
parser.add_argument("--ink", choices=["blue", "red"], default="blue")
parser.add_argument("--out", required=True)
parser.add_argument("--exclude", action="append", default=[])
parser.add_argument("--join", type=float, default=80)
parser.add_argument("--chain", type=float, default=0, help="join all pieces into one line, bridging breaks up to this many pixels along the ink")
parser.add_argument("--start", help="x,y: where the line begins on the scan, followed along the ink to the traced line")
parser.add_argument("--end", help="x,y: where it ends")
parser.add_argument("--via", help="x,y;x,y;...: waypoints read on the scan; the line follows the ink from each to the next")
parser.add_argument("--shortest", type=float, default=120, help="pieces shorter than this, in pixels, are dropped")
args = parser.parse_args()

catalogue = json.loads((ROOT / "packages/map/data/battle-maps.json").read_text(encoding="utf-8"))
entry = next(m for m in catalogue["maps"] if m["id"] == args.map)
rgb = np.asarray(Image.open(ROOT / ".asset-cache/battle-maps" / entry["file"]).convert("RGB")).astype(np.int16)
R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]
mask = ((B - R > 35) & (B - G > 5)) if args.ink == "blue" else ((R - G > 45) & (R - B > 35))
left, top, right, bottom = entry["frame"]
keep = np.zeros_like(mask)
keep[top:bottom, left:right] = True
for box in args.exclude:
    x0, y0, x1, y1 = (int(v) for v in box.split(","))
    keep[y0:y1, x0:x1] = False
mask = (mask & keep).astype(np.uint8)
# Close small breaks in the ink, then drop specks.
mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
big = np.zeros(count, bool)
big[1:] = stats[1:, cv2.CC_STAT_AREA] >= 60
mask = big[labels].astype(np.uint8)


def thin(image):
    """Zhang-Suen thinning: peels the ink to a one-pixel centre line."""
    img = np.pad(image.copy(), 1)
    while True:
        changed = False
        for step in (0, 1):
            p2, p3, p4 = img[:-2, 1:-1], img[:-2, 2:], img[1:-1, 2:]
            p5, p6, p7 = img[2:, 2:], img[2:, 1:-1], img[2:, :-2]
            p8, p9 = img[1:-1, :-2], img[:-2, :-2]
            ring = [p2, p3, p4, p5, p6, p7, p8, p9, p2]
            neighbours = sum(ring[:8])
            transitions = sum(((ring[k] == 0) & (ring[k + 1] == 1)).astype(np.uint8) for k in range(8))
            centre = img[1:-1, 1:-1]
            if step == 0:
                cut = (p2 * p4 * p6 == 0) & (p4 * p6 * p8 == 0)
            else:
                cut = (p2 * p4 * p8 == 0) & (p2 * p6 * p8 == 0)
            remove = (centre == 1) & (neighbours >= 2) & (neighbours <= 6) & (transitions == 1) & cut
            if remove.any():
                centre[remove] = 0
                changed = True
        if not changed:
            return img[1:-1, 1:-1]


skeleton = thin(mask)
ys, xs = np.nonzero(skeleton)
on = set(zip(ys.tolist(), xs.tolist()))
STEPS = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


def neighbours_of(p):
    return [(p[0] + dy, p[1] + dx) for dy, dx in STEPS if (p[0] + dy, p[1] + dx) in on]


def farthest(start, members):
    """Breadth-first from start within a component: the farthest pixel and the path to it."""
    previous = {start: None}
    queue = deque([start])
    last = start
    while queue:
        last = queue.popleft()
        for n in neighbours_of(last):
            if n not in previous and n in members:
                previous[n] = last
                queue.append(n)
    path = []
    node = last
    while node is not None:
        path.append(node)
        node = previous[node]
    return last, path[::-1]


# Each piece of the skeleton: its longest path (its spurs and loops left off).
pieces = []
seen = set()
for p in sorted(on):
    if p in seen:
        continue
    members = set()
    queue = deque([p])
    members.add(p)
    while queue:
        q = queue.popleft()
        for n in neighbours_of(q):
            if n not in members:
                members.add(n)
                queue.append(n)
    seen |= members
    end, _ = farthest(p, members)
    _, path = farthest(end, members)
    if len(path) >= args.shortest / 3:
        pieces.append(np.array([(x, y) for y, x in path], float))


def length(piece):
    return float(np.hypot(*np.diff(piece, axis=0).T).sum())


# Join pieces end to end across breaks shorter than --join, nearest first.
pieces = [p for p in pieces if length(p) >= 20]
while True:
    best = None
    for i, a in enumerate(pieces):
        for j, b in enumerate(pieces):
            if j <= i:
                continue
            for ea, pa in ((0, a[0]), (1, a[-1])):
                for eb, pb in ((0, b[0]), (1, b[-1])):
                    gap = float(np.hypot(*(pa - pb)))
                    if gap <= args.join and (best is None or gap < best[0]):
                        best = (gap, i, j, ea, eb)
    if best is None:
        break
    _, i, j, ea, eb = best
    a, b = pieces[i], pieces[j]
    a = a if ea == 1 else a[::-1]
    b = b if eb == 0 else b[::-1]
    joined = np.vstack([a, b])
    pieces = [p for k, p in enumerate(pieces) if k not in (i, j)] + [joined]
pieces = [p for p in pieces if length(p) >= args.shortest]

if args.via:
    # Guided: no pieces of its own; the ink is followed from waypoint to waypoint.
    args.chain = args.chain or 1
    waypoints = [np.array([float(v) for v in point.split(",")]) for point in args.via.split(";")]
    pieces = []
if args.chain:
    # One line, west to east: from the westernmost end, each next piece the nearest, the break between bridged by the
    # cheapest path along the ink (where the line is printed too dark for the colour test, or crossed by a label).
    if args.ink == "blue":
        inkiness = np.clip((B - R).astype(float) / 60, 0, 1)
    else:
        inkiness = np.clip((R - G).astype(float) / 70, 0, 1)
    cost_map = 1 + 25 * (1 - inkiness) ** 2

    def cheapest(a, b):
        """The cheapest 8-connected path from pixel a to pixel b over cost_map, within a box round them."""
        import heapq

        pad = 80
        x0, y0 = int(max(0, min(a[0], b[0]) - pad)), int(max(0, min(a[1], b[1]) - pad))
        x1, y1 = int(min(W, max(a[0], b[0]) + pad)), int(min(H, max(a[1], b[1]) + pad))
        box = cost_map[y0:y1, x0:x1]
        h, w = box.shape
        start = (int(a[1]) - y0, int(a[0]) - x0)
        goal = (int(b[1]) - y0, int(b[0]) - x0)
        best_cost = np.full((h, w), np.inf)
        best_cost[start] = 0
        came = {}
        heap = [(0.0, start)]
        while heap:
            cost, node = heapq.heappop(heap)
            if node == goal:
                break
            if cost > best_cost[node]:
                continue
            for dy, dx in STEPS:
                ny, nx = node[0] + dy, node[1] + dx
                if 0 <= ny < h and 0 <= nx < w:
                    step = box[ny, nx] * (1.4142 if dy and dx else 1.0)
                    if cost + step < best_cost[ny, nx]:
                        best_cost[ny, nx] = cost + step
                        came[(ny, nx)] = node
                        heapq.heappush(heap, (cost + step, (ny, nx)))
        path = [goal]
        while path[-1] != start:
            path.append(came[path[-1]])
        path.reverse()
        on_ink = float(np.mean([inkiness[y + y0, x + x0] > 0.3 for y, x in path]))
        return np.array([(x + x0, y + y0) for y, x in path], float), on_ink

    H, W = cost_map.shape
    if args.via:
        line = waypoints[0][None]
        for a_point, b_point in zip(waypoints, waypoints[1:]):
            bridge, on_ink = cheapest(a_point, b_point)
            if on_ink < 0.6:
                print(f"from {a_point.round().tolist()} to {b_point.round().tolist()}: only {on_ink:.0%} on ink; check")
            line = np.vstack([line, bridge[1:]])
        remaining = []
    else:
        remaining = [p for p in pieces]
        westmost = min(range(len(remaining)), key=lambda k: min(remaining[k][0][0], remaining[k][-1][0]))
        line = remaining.pop(westmost)
        if line[-1][0] < line[0][0]:
            line = line[::-1]
    while remaining:
        end = line[-1]
        k, flip, gap = min(
            ((k, flip, float(np.hypot(*((p[-1] if flip else p[0]) - end)))) for k, p in enumerate(remaining)
             for flip in (False, True)),
            key=lambda t: t[2],
        )
        if gap > args.chain:
            print(f"no piece within {args.chain:.0f} px of the line's end at {end.round().tolist()}; stopping there")
            break
        piece = remaining.pop(k)
        piece = piece[::-1] if flip else piece
        bridge, on_ink = cheapest(end, piece[0])
        print(f"bridged {gap:.0f} px from {end.round().tolist()} to {piece[0].round().tolist()}: "
              f"{on_ink:.0%} of the way on ink")
        line = np.vstack([line, bridge[1:-1], piece])
    # Out to the line's printed ends, where given, along the ink.
    for which in ("start", "end"):
        anchor = getattr(args, which)
        if not anchor:
            continue
        point = np.array([float(v) for v in anchor.split(",")])
        if which == "start":
            bridge, on_ink = cheapest(point, line[0])
            line = np.vstack([bridge[:-1], line])
        else:
            bridge, on_ink = cheapest(line[-1], point)
            line = np.vstack([line, bridge[1:]])
        print(f"followed out to the {which} at {point.round().tolist()}: {on_ink:.0%} of the way on ink")
    pieces = [line]


def simplify(points, tolerance=1.5):
    """Douglas-Peucker, in pixels."""
    if len(points) < 3:
        return points
    start, end = points[0], points[-1]
    direction = end - start
    norm = np.hypot(*direction) or 1.0
    offsets = points - start
    distances = np.abs(direction[0] * offsets[:, 1] - direction[1] * offsets[:, 0]) / norm
    k = int(np.argmax(distances))
    if distances[k] <= tolerance:
        return np.array([start, end])
    return np.vstack([simplify(points[: k + 1], tolerance)[:-1], simplify(points[k:], tolerance)])


# The sheet's kilometre grid: crossings by lattice index, pixel and ground.
grid = {}
for point in entry["controlPoints"]:
    if point["name"].startswith("grid "):
        i, j = (int(v) for v in point["name"][5:].split(","))
        grid[(i, j)] = (np.array(point["pixel"], float), np.array(point["ground"], float))
if not grid:
    raise SystemExit(f"{args.map} has no grid crossings to go back through")


def to_ground(pixel):
    """A pixel's place on the ground: within its grid cell, bilinear in pixels, then the same in ground metres."""
    best = None
    for (i, j), _ in grid.items():
        corners = [grid.get((i + di, j + dj)) for di, dj in ((0, 0), (1, 0), (0, 1), (1, 1))]
        if any(c is None for c in corners):
            continue
        (a, ga), (b, gb), (c, gc), (d, gd) = corners
        f = lambda u, v: a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v
        u, v = 0.5, 0.5
        for _ in range(12):
            p = f(u, v)
            jacobian = np.stack([(f(u + 1e-4, v) - p) / 1e-4, (f(u, v + 1e-4) - p) / 1e-4], axis=1)
            u, v = np.array([u, v]) + np.linalg.solve(jacobian, pixel - p)
        outside = max(0.0, -u, u - 1, -v, v - 1)
        if best is None or outside < best[0]:
            best = (outside, ga * (1 - u) * (1 - v) + gb * u * (1 - v) + gc * (1 - u) * v + gd * u * v)
        if outside == 0:
            break
    return best[1]


out = []
for index, piece in enumerate(sorted(pieces, key=length, reverse=True)):
    simple = simplify(piece)
    ground = [to_ground(p) for p in simple]
    metres = float(sum(np.hypot(*(b - a)) for a, b in zip(ground, ground[1:])))
    out.append({
        "piece": index,
        "pixels": [[round(float(x), 1), round(float(y), 1)] for x, y in simple],
        "ground": [[round(float(x), 1), round(float(y), 1)] for x, y in ground],
        "metres": round(metres),
    })
    print(f"piece {index}: {metres / 1000:.2f} km, from pixel {simple[0].round().tolist()} to {simple[-1].round().tolist()}")
Path(args.out).write_text(json.dumps(out, indent=1), encoding="utf-8")
print(f"{len(out)} pieces written to {args.out}")
