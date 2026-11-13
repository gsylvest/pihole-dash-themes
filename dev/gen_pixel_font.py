"""Builds app/fonts/pipixel.ttf: a small original bold pixel font for the 8-bit dashboard design.

No downloads and no third-party font: glyphs are a 5x7 grid (same table as skins.js), widened by one
pixel for a bold look, written straight into a minimal TrueType file with the standard library only.
Licence: SIL Open Font License 1.1 (see app/fonts/OFL.txt), original work for this project.

    python3 -I pihole/dashboard/dev/gen_pixel_font.py
"""
import os, struct, time

G = {
    "A": ".###.#...##...#######...##...##...#", "B": "####.#...##...#####.#...##...#####.", "C": ".###.#...##....#....#....#...#.###.",
    "D": "####.#...##...##...##...##...#####.", "E": "######....#....####.#....#....#####", "F": "######....#....####.#....#....#....",
    "G": ".###.#...##....#.####...##...#.####", "H": "#...##...##...#######...##...##...#", "I": ".###...#....#....#....#....#...###.",
    "J": "..###...#....#....#....##..#..##...", "K": "#...##..#.#.#..##...#.#..#..#.#...#", "L": "#....#....#....#....#....#....#####",
    "M": "#...###.###.#.##.#.##...##...##...#", "N": "#...##...###..##.#.##..###...##...#", "O": ".###.#...##...##...##...##...#.###.",
    "P": "####.#...##...#####.#....#....#....", "Q": ".###.#...##...##...##.#.##..#..##.#", "R": "####.#...##...#####.#.#..#..#.#...#",
    "S": ".#####....#.....###.....#....#####.", "T": "#####..#....#....#....#....#....#..", "U": "#...##...##...##...##...##...#.###.",
    "V": "#...##...##...##...##...#.#.#...#..", "W": "#...##...##...##.#.##.#.##.#.#.#.#.", "X": "#...##...#.#.#...#...#.#.#...##...#",
    "Y": "#...##...#.#.#...#....#....#....#..", "Z": "#####....#...#...#...#...#....#####",
    "0": ".###.#...##..###.#.###..##...#.###.", "1": "..#...##....#....#....#....#...###.", "2": ".###.#...#....#...#...#...#...#####",
    "3": "####.....#....#.###.....#....#####.", "4": "...#...##..#.#.#..#.#####...#....#.", "5": "######....####.....#....##...#.###.",
    "6": "..##..#...#....####.#...##...#.###.", "7": "#####....#...#...#...#....#....#...", "8": ".###.#...##...#.###.#...##...#.###.",
    "9": ".###.#...##...#.####....#...#..##..",
    ".": ".........................##...##...", ",": "....................##....#...#....", ":": ".....##...##........##...##........",
    "-": "...............#####...............", "%": "##...##..#...#...#...#...#..##...##", "!": "..#....#....#....#....#.........#..",
    "/": "....#....#...#...#...#...#....#....", "?": ".###.#...#....#...#...#.........#..", ">": ".#.....#.....#.....#...#...#...#...",
    "<": "...#...#...#...#.....#.....#.....#.", "'": "..#....#...........................", "_": "..............................#####",
    "+": ".......#....#..#####..#....#.......", "=": "..........#####.....#####..........", "(": "...#...#...#....#....#.....#.....#.",
    ")": ".#.....#.....#....#....#...#...#...", "|": "..#....#....#....#....#....#....#..", "[": ".###..#....#....#....#....#....###.",
    "]": ".###....#....#....#....#....#..###.", "&": ".##..#..#.#.#...#...#.#.##..#..##.#", "#": ".#.#..#.#.#####.#.#.#####.#.#..#.#.",
    "*": ".......#.#.#.#.###.#.#.#.#.........", "·": "...............##...##.............", "°": ".##..#..#..##......................",
    "@": ".###.#...##.###.#.###.###.#.....###",
}
PX = 128                      # font units per pixel
EM, ASC, DESC = 8 * PX, 7 * PX, 1 * PX
ADV = 7 * PX                  # 6-pixel bold glyph + 1 pixel gap
NARROW = {",": 4 * PX, ".": 4 * PX, ":": 4 * PX}   # punctuation sits in 3 bold px + 1 gap, so "12,416" has no hole


def rows_of(g):
    out = []
    for r in range(7):
        src = g[r * 5:(r + 1) * 5]
        out.append([(c < 5 and src[c] == "#") or (0 < c <= 5 and src[c - 1] == "#") for c in range(6)])
    return out


def glyph(g):
    """TrueType simple glyph: one clockwise rectangle per horizontal run of pixels."""
    rects = []
    for r, row in enumerate(rows_of(g)):
        c = 0
        while c < 6:
            if row[c]:
                s = c
                while c < 6 and row[c]: c += 1
                y1 = (7 - r) * PX; y0 = y1 - PX
                rects.append((s * PX, y0, c * PX, y1))
            else:
                c += 1
    if not rects: return b"", 0, 0
    pts = []
    for x0, y0, x1, y1 in rects: pts += [(x0, y0), (x0, y1), (x1, y1), (x1, y0)]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    d = struct.pack(">hhhhh", len(rects), min(xs), min(ys), max(xs), max(ys))
    d += b"".join(struct.pack(">H", i * 4 + 3) for i in range(len(rects)))
    d += struct.pack(">H", 0) + bytes([1] * len(pts))
    px = py = 0
    for x, _ in pts: d += struct.pack(">h", x - px); px = x
    for _, y in pts: d += struct.pack(">h", y - py); py = y
    return d, len(pts), len(rects)


def checksum(b):
    b += b"\0" * (-len(b) % 4)
    return sum(struct.unpack(f">{len(b) // 4}L", b)) & 0xFFFFFFFF


def build():
    chars = sorted(G)                                  # glyph 0 = .notdef, 1 = space
    names = [None, " "] + chars
    glyf, loca, maxp_pts, maxp_ctr = b"", [], 0, 0
    for n in names:
        loca.append(len(glyf))
        if n is None:                                  # .notdef: hollow box
            d = struct.pack(">hhhhh", 2, 0, 0, 5 * PX, 7 * PX) + struct.pack(">HH", 3, 7) + struct.pack(">H", 0) + bytes([1] * 8)
            P = [(0, 0), (0, 7 * PX), (5 * PX, 7 * PX), (5 * PX, 0), (PX, PX), (4 * PX, PX), (4 * PX, 6 * PX), (PX, 6 * PX)]
            px = py = 0
            for x, _ in P: d += struct.pack(">h", x - px); px = x
            for _, y in P: d += struct.pack(">h", y - py); py = y
            np, nc = 8, 2
        elif n == " ":
            d, np, nc = b"", 0, 0
        else:
            d, np, nc = glyph(G[n])
        maxp_pts, maxp_ctr = max(maxp_pts, np), max(maxp_ctr, nc)
        glyf += d + b"\0" * (-len(d) % 4)
    loca.append(len(glyf))
    ng = len(names)

    # cmap format 4: one segment per code point (upper and lower case share glyphs)
    cmap_map = {32: 1}
    for i, ch in enumerate(chars):
        cmap_map[ord(ch)] = i + 2
        if ch.isalpha(): cmap_map[ord(ch.lower())] = i + 2
    codes = sorted(cmap_map)
    segs = [(c, c, (cmap_map[c] - c) & 0xFFFF) for c in codes] + [(0xFFFF, 0xFFFF, 1)]
    n = len(segs); sr = 2 * (1 << (n.bit_length() - 1)); es = (n.bit_length() - 1)
    sub = struct.pack(">HHHHHHH", 4, 0, 0, n * 2, sr, es, n * 2 - sr)
    sub += b"".join(struct.pack(">H", e) for _, e, _ in segs) + b"\0\0"
    sub += b"".join(struct.pack(">H", s) for s, _, _ in segs)
    sub += b"".join(struct.pack(">H", d) for _, _, d in segs)
    sub += b"".join(struct.pack(">H", 0) for _ in segs)
    sub = sub[:2] + struct.pack(">H", len(sub)) + sub[4:]
    cmap = struct.pack(">HHHHL", 0, 1, 3, 1, 12) + sub

    now = int(time.time()) + 2082844800
    head = struct.pack(">LLLLHHqqhhhhHHhhh", 0x00010000, 0x00010000, 0, 0x5F0F3CF5, 0x000B, EM, now, now,
                       0, 0, 6 * PX, 7 * PX, 0, 8, 2, 1, 0)
    hhea = struct.pack(">LhhhHhhhhhhhhhhhH", 0x00010000, ASC, -DESC, 0, ADV, 0, PX, 6 * PX, 1, 0, 0, 0, 0, 0, 0, 0, ng)
    hmtx = b"".join(struct.pack(">Hh", NARROW.get(n, ADV), 0) for n in names)
    maxp = struct.pack(">LHHHHHHHHHHHHHH", 0x00010000, ng, maxp_pts, maxp_ctr, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0)
    os2 = struct.pack(">HhHHHhhhhhhhhhhh", 4, ADV, 400, 5, 0, PX * 4, PX * 4, 0, PX, PX * 4, PX * 4, 0, PX * 3, PX, 3 * PX, 0)
    os2 += bytes(10) + struct.pack(">LLLL", 1, 0, 0, 0) + b"PIHL"
    os2 += struct.pack(">HHHhhhHHLLhhHHH", 0x40, 32, max(codes), ASC, -DESC, 0, ASC, DESC, 1, 0, 5 * PX, 7 * PX, 0, 32, 1)
    post = struct.pack(">LLhhLLLLL", 0x00030000, 0, -PX, PX, 1, 0, 0, 0, 0)
    strs = {0: "Original pixel font for the Pi-hole touchscreen dashboard", 1: "PiPixel", 2: "Regular", 3: "PiPixel-Regular-1.0",
            4: "PiPixel", 5: "Version 1.0", 6: "PiPixel-Regular", 13: "SIL Open Font License 1.1"}
    recs, blob = b"", b""
    for nid, s in strs.items():
        e = s.encode("utf-16-be"); recs += struct.pack(">HHHHHH", 3, 1, 0x409, nid, len(e), len(blob)); blob += e
    name = struct.pack(">HHH", 0, len(strs), 6 + 12 * len(strs)) + recs + blob
    loca_t = b"".join(struct.pack(">L", o) for o in loca)

    tables = {b"OS/2": os2, b"cmap": cmap, b"glyf": glyf, b"head": head, b"hhea": hhea, b"hmtx": hmtx,
              b"loca": loca_t, b"maxp": maxp, b"name": name, b"post": post}
    tags = sorted(tables); nt = len(tags); sr = 16 * (1 << (nt.bit_length() - 1))
    out = struct.pack(">LHHHH", 0x00010000, nt, sr, nt.bit_length() - 1, nt * 16 - sr)
    off = 12 + 16 * nt; body = b""; dirs = b""
    for t in tags:
        d = tables[t]; dirs += struct.pack(">4sLLL", t, checksum(d), off + len(body), len(d))
        body += d + b"\0" * (-len(d) % 4)
    font = bytearray(out + dirs + body)
    adj = (0xB1B0AFBA - checksum(bytes(font))) & 0xFFFFFFFF
    hoff = off + sum(len(tables[t]) + (-len(tables[t]) % 4) for t in tags[:tags.index(b"head")])
    font[hoff + 8:hoff + 12] = struct.pack(">L", adj)
    return bytes(font)


if __name__ == "__main__":
    dst = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "app", "fonts", "pipixel.ttf")
    with open(dst, "wb") as f: f.write(build())
    print("wrote", os.path.normpath(dst), os.path.getsize(dst), "bytes")
