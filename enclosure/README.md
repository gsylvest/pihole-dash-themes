# Enclosure

A desk case for a Raspberry Pi 4 running Pi-hole behind a Waveshare 4.3" DSI touchscreen, with a 52Pi N02 NVMe adapter under the Pi and an LD2410C presence radar behind the chin. The screen leans back 15 degrees. Three printed parts, and the only seam is underneath.

Outside size: 111.4 wide x 86.6 deep x 92.1 mm tall.

## Status

**The shell in this folder (rev 6) has not been test-printed.** Read this before you spend six hours of printing on it.

| Part | Revision | Status |
|---|---|---|
| Base | rev 4 | Printed, fits. |
| Retainer | rev 4 | Printed, fits. |
| Shell | rev 6 | **Not yet printed.** It is rev 5 with the bottom edge of the screen window raised 1 mm. |

Shell history:

- Rev 4 fitted the stack, but its screen window sat too low. The top lip hid about the top 20 pixel rows, and a black strip showed under the picture.
- Rev 5 moved the window up 2.5 mm. It is print-tested: printed, fitted, approved and in use. Its one flaw is about 1 mm more black border under the picture than on the other three sides.
- Rev 6 raises the window's bottom edge 1 mm to even that border out. Nothing else changed.

Other things that are not proven:

- The support settings below come from forum reports. They are a starting point, not a tested recipe.
- The doorway for the USB-C power plug is sized for a stand-in plug, not a measured one.
- The Pi 4 and screen outlines are from published drawings, not caliper readings.

## What is in this folder

```
print/shell.3mf, shell.stl          the shell, face down
print/base.3mf, base.stl            the base, flat
print/retainer.3mf, retainer.stl    the retainer, flat
print/plate-all-parts.3mf           all three on one plate
preview/enclosure.glb               the assembled case with stand-in electronics, for the web viewer
```

Every file is already in its print orientation. The 3MF files are Bambu Studio projects for a Bambu Lab P2S (0.4 mm nozzle, textured PEI plate) and carry the settings below. For any other printer or slicer, use the STL files and set the slicer up by hand.

The electronics in `enclosure.glb` are plain blocks that show where things sit. They are not detailed models.

## Parts

| Part | What it does |
|---|---|
| Shell | The bezel, sides, top and back in one piece, open underneath. It lowers over the electronics and screws to the base from below. The right side has a hole for Ethernet and a slot for the N02's USB bridge. The back has vent slots and a notch for the power cable. |
| Base | The floor. A block on it carries the retainer, and a holder in front of the block takes the radar board. Intake slots sit under the fan. |
| Retainer | A C-shaped frame behind the Pi. Its four posts screw into the screen's corner posts, and its bottom bar screws to the base block, so the screen, N02 and Pi stand on the base as one unit. |

## Print settings

Bambu PETG Matte, 0.20 mm layers, 0.4 mm nozzle, 3 walls, 15% gyroid infill, no brim, textured PEI plate.

| Part | Orientation | Supports | Extra | Time | Filament |
|---|---|---|---|---|---|
| Shell | Face down (the bezel on the bed) | Tree supports, this part only | | 4 h 45 min | 122 g |
| Base | Flat, block up | None | 4 walls | 1 h 06 min | 35 g |
| Retainer | Flat, posts up | None | | 39 min | 14 g |
| All three on one plate | | | | 6 h 21 min | 171 g |

Times and weights are Bambu Studio's estimates for a P2S. The shell's figures include its supports.

**Why the shell prints face down.** The screen window becomes a hole in the bed face, so its edges print clean and the bezel takes the plate's texture. The supports stand inside the case where they do not show. Standing the shell on its top wall slices two hours quicker without supports, but that print failed.

**Why the base has 4 walls.** The strip of the base behind the chin is part of the radar's cover. Four walls print it solid, and air gaps there change what the radar sees.

**Shell support settings for PETG.** PETG welds to its own supports harder than PLA does. These are set in the shell's 3MF:

| Setting | Value |
|---|---|
| Type | Tree (auto) |
| Top Z distance | 0.25 mm |
| Top interface layers | 2 |
| Top interface pattern | Rectilinear |
| Top interface spacing | 0.5 mm |
| Bottom Z distance | 0.2 mm |
| Support/object XY distance | 0.35 mm |
| Branch diameter | 2 mm |
| Branch angle | 45 degrees |

If the supports still weld on, try a top Z distance of 0.28 mm and an interface spacing of 0.6 mm. Pull the supports soon after the print finishes; they get harder to break off once fully cold.

## Hardware

Electronics the case is modelled around:

| Qty | Part | Exact item | Size and connection |
|---|---|---|---|
| 1 | Computer | Raspberry Pi 4 Model B | Board 85 x 56 x 1.6 mm (published drawing). |
| 1 | Cooler | GeeekPi Aluminum Heatsink with PWM Controllable Fan for Raspberry Pi 4 ("Armor Lite"), Amazon ASIN B091L1XKL6 | One-piece black heatsink over the whole board with a built-in blower fan. Three wires on single 2.54 mm plugs: red 5 V to pin 4, black ground to pin 6, blue speed control to pin 7 (GPIO4). Its height was not measured on its own: it sits lower than the Pi's USB ports, which stand 16.3 mm above the board. |
| 1 | Screen | Waveshare 4.3inch Capacitive Touch Display, MIPI DSI, board Rev2.2 | 800 x 480 IPS, FT5x06 touch, DSI ribbon. Board 106 x 68 mm (Waveshare drawing), 9.6 mm from glass front to board back (measured). Four M2.5 threaded posts on the corner holes, 99.3 x 61.8 mm apart, 3.9 mm tall and 5.5 mm across (measured). Keep those posts on. |
| 1 | NVMe adapter | 52Pi / GeeekPi M.2 NVMe SSD Adapter N02 (EP-0171), for the Pi 4 B | Board 85 x 56 x 1.65 mm (measured). Mounts under the Pi, between the Pi and the screen. Powered through spring pins on the Pi's header joints; data through the rigid USB 3 bridge supplied with it, which plugs into the Pi's lower blue USB port from outside the case. |
| 1 | NVMe drive | Patriot P300 M.2 2280, 256 GB (P300P256GM28) | 80 x 22 x 3.8 mm (retailer listings), no heatsink. Any bare 2280 drive of that thickness should fit. |
| 1 | Presence radar (optional) | Hi-Link HLK-LD2410C, 24 GHz | Board 22.2 x 16.1 x 1.7 mm (measured), five pins at 2.54 mm pitch: TX, RX, OUT, GND, VCC. 5 V supply, 3.3 V signals. |
| 5 | Radar wires | Female-to-female Dupont jumper wires, single 2.54 mm housings | Housings 14.2 mm long (measured). |
| 1 | Power | USB-C power supply for the Pi 4 with a right-angle plug | The Pi's power socket ends up on the top edge, about 6 mm under the shell's roof. The plug size is not measured. |

**Radar mount.** There is no separate mount to print. The holder is part of the base: two grooved posts in front of the base block, centred under the screen. The board stands in them parallel to the screen face, pin row at the top, and the screen above stops it lifting out. It looks out through the chin under the screen, which has no hole: 1.2 mm of shell, a 0.15 mm gap and a 2.45 mm strip of the base, 3.8 mm in all, with the antenna 6.2 mm behind it. Both figures follow Hi-Link's manual for a cover over this radar.

**Cooler fit.** The case's back wall stands 6.5 mm behind the tops of the Pi's USB ports, which are the deepest point of the stack. Another cooler fits if it is no taller than those ports.

Fasteners:

| Qty | Item | Where |
|---|---|---|
| 4 | M2.5 x 25 machine screw, pan or cap head | Retainer posts into the screen's corner posts |
| 2 | M2.5 x 10 machine screw, pan or cap head | Retainer's bottom bar into the base block. They cut their own thread in 2.0 mm printed holes. |
| 4 | M3 x 8 countersunk screw (DIN 965, head about 5.5 mm) | Base into the shell, from underneath |
| 4 | M3 heat-set insert, 5.7 mm long, 4.6 mm outside diameter (ruthex RX-M3x5.7) | The four bosses inside the shell. The holes are 4.0 mm wide and 7.0 mm deep. |

Do not use corner screws longer than 25 mm. A 25 mm screw goes 3 mm into a 3.9 mm post, and a longer one can reach the display panel.

The Pi, the N02 and the screen are joined by the standoffs that come with the screen and the N02. The case is built round a stack that measures, from the front of the glass: 9.6 mm to the back of the screen's board, 20.4 mm to the N02's Pi-side face, 28.8 mm to the Pi's component side, and 45.1 mm to the tops of the USB ports. Check your stack against these before printing.

## Assembly

1. Press the four M3 inserts into the shell's bosses from underneath with a soldering iron. Each hole has a small bevel to centre the insert.
2. Build the stack as the screen and the N02 instruct: N02 on the back of the screen with the NVMe drive facing the screen, then the Pi on the N02, then the fan cooler. Connect the display ribbon. Leave the USB bridge off for now.
3. Radar (optional): push the five jumper wires onto the radar's pins and stand the board in the holder on the base with its pin row at the top and the pins pointing back. Put a small drop of super glue in the holder's grooves first so the board can't rattle loose. Lead the wires back through the slot in the base block.
4. Screw the retainer to the screen with the four M2.5 x 25 screws, through its posts into the screen's silver corner posts.
5. Stand the stack on the base with the retainer's bottom bar against the block, and fix it with the two M2.5 x 10 screws.
6. Connect the radar wires to the Pi's header: 5 V to pin 2, ground to pin 14, the radar's RX to pin 8, its TX to pin 10, and OUT to pin 16.
7. Plug in the USB-C power cable. The plug sits in the doorway in the retainer's top bar. Run the cable down the back to the notch at the bottom of the shell's back wall.
8. Lower the shell over the stack. Start about 3 mm forward of its final position, so the two front bosses pass in front of the glass. Once they are below the bottom edge of the glass, move the shell back and lower it the rest of the way.
9. Turn the case over and fit the four M3 x 8 countersunk screws through the base.
10. Push the USB bridge into the slot in the right side, and plug Ethernet into the hole next to it.

With the shell on, only the Ethernet port and the USB bridge are reachable. The SD card slot, HDMI ports and the other USB ports are closed in.

## License

[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Copyright (c) 2026 Gary Sylvester. See [LICENSE](LICENSE). This covers the enclosure folder only.
