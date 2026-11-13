#!/usr/bin/env python3
"""pihole-presence: sleep the touchscreen when nobody is around, wake it when someone is.

Inputs
- HLK-LD2410C OUT pin (default GPIO23) read with lgpio, internal PULL-UP. The sensor
  drives OUT high (someone there) or low (nobody). With no sensor wired, the pull-up
  reads high, so the screen simply never sleeps (fail open).
- Any event from the touchscreen (FT5x06, /dev/input/event*) counts as activity and
  wakes the screen at once.

Output
- Primary: DPMS through the compositor (`wlopm --off/--on DSI-1`); on this panel that also
  powers the backlight down. Fallback: backlight brightness 0 / restore via sysfs.
- /run/pihole-presence/state.json so the dashboard can swallow the tap that wakes the screen.

Fail open: any error reading the sensor counts as "present"; on stop or crash the screen is
turned back on. Config comes from the environment (/etc/default/pihole-presence).
Python standard library + python3-lgpio only.
"""
import glob
import json
import os
import select
import signal
import struct
import subprocess
import sys
import time

SLEEP_AFTER = float(os.environ.get("PRESENCE_SLEEP_AFTER_SECONDS", "120"))
ENABLED = os.environ.get("PRESENCE_ENABLED", "1") not in ("0", "false", "no", "off")
GPIO_CHIP = int(os.environ.get("PRESENCE_GPIO_CHIP", "0"))
GPIO_PIN = int(os.environ.get("PRESENCE_GPIO_PIN", "23"))
OUTPUT = os.environ.get("PRESENCE_OUTPUT", "DSI-1")
TOUCH_NAME = os.environ.get("PRESENCE_TOUCH_NAME", "ft5x06")
SIM_FILE = os.environ.get("PRESENCE_SIM_FILE", "")        # testing only: file with 0/1 replaces the GPIO
BACKLIGHT = os.environ.get("PRESENCE_BACKLIGHT", "") or (sorted(glob.glob("/sys/class/backlight/*")) or [""])[0]
STATE_DIR = os.environ.get("RUNTIME_DIRECTORY", "/run/pihole-presence")
TICK = 0.1
EVENT = struct.Struct("llHHi")                               # struct input_event (64-bit)


def log(msg):
    print(msg, file=sys.stderr, flush=True)


class Sensor:
    """OUT pin reader. Returns (present, status); errors read as present (fail open)."""

    def __init__(self):
        self.h = None
        self.status = "starting"
        self.err_logged = False
        if SIM_FILE:
            self.status = "simulated"
            log(f"pihole-presence: TEST MODE, presence read from {SIM_FILE}")
            return
        try:
            import lgpio
            self.lgpio = lgpio
            self.h = lgpio.gpiochip_open(GPIO_CHIP)
            lgpio.gpio_claim_input(self.h, GPIO_PIN, lgpio.SET_PULL_UP)
            self.status = "gpio"
        except Exception as err:
            self.fail(err)

    def fail(self, err):
        self.status = "error"
        if not self.err_logged:
            log(f"pihole-presence: sensor unreadable ({type(err).__name__}: {err}); screen stays on")
            self.err_logged = True

    def read(self):
        if SIM_FILE:
            try:
                with open(SIM_FILE) as fh:
                    return fh.read().strip() == "1", "simulated"
            except OSError:
                return True, "simulated"
        if self.h is None:
            return True, "error"
        try:
            return self.lgpio.gpio_read(self.h, GPIO_PIN) == 1, "gpio"
        except Exception as err:
            self.fail(err)
            return True, "error"


def open_touch():
    """Open the touchscreen's evdev node by name (non-blocking), or None."""
    try:
        with open("/proc/bus/input/devices") as fh:
            blocks = fh.read().split("\n\n")
    except OSError:
        return None
    for b in blocks:
        if TOUCH_NAME.lower() in b.lower():
            for line in b.splitlines():
                if line.startswith("H: Handlers="):
                    for h in line.split("=", 1)[1].split():
                        if h.startswith("event"):
                            try:
                                return os.open(f"/dev/input/{h}", os.O_RDONLY | os.O_NONBLOCK)
                            except OSError as err:
                                log(f"pihole-presence: can't read touchscreen /dev/input/{h}: {err}")
                                return None
    log("pihole-presence: touchscreen not found; touch-to-wake off")
    return None


class Screen:
    def __init__(self):
        self.asleep = False
        self.method = None
        self.saved_brightness = None

    def _wlopm(self, mode):
        try:
            r = subprocess.run(["wlopm", f"--{mode}", OUTPUT], capture_output=True, timeout=5)
            return r.returncode == 0
        except Exception:
            return False

    def _backlight(self, value):
        try:
            with open(os.path.join(BACKLIGHT, "brightness"), "w") as fh:
                fh.write(str(value))
            return True
        except Exception:
            return False

    def sleep(self):
        if self._wlopm("off"):
            self.method = "dpms"
        else:
            try:
                with open(os.path.join(BACKLIGHT, "brightness")) as fh:
                    self.saved_brightness = int(fh.read().strip() or 255)
            except Exception:
                self.saved_brightness = 255
            if not self._backlight(0):
                log("pihole-presence: could not blank the screen (DPMS and backlight both failed)")
                return
            self.method = "backlight"
        self.asleep = True
        log(f"pihole-presence: screen asleep ({self.method})")

    def wake(self, why=""):
        ok = self._wlopm("on")
        # Always restore the backlight too, in case the fallback was used (or a previous run died).
        if self.method == "backlight" or not ok:
            self._backlight(self.saved_brightness or 255)
        if self.asleep:
            log(f"pihole-presence: screen awake ({why})")
        self.asleep = False
        self.method = None


def write_state(state):
    path = os.path.join(STATE_DIR, "state.json")
    tmp = path + ".tmp"
    try:
        with open(tmp, "w") as fh:
            json.dump(state, fh)
        os.replace(tmp, path)
    except OSError:
        pass


def main():
    screen = Screen()
    screen.wake("start")                    # whatever happened before, start with the screen on
    stopping = {"now": False}

    def stop(*_):
        stopping["now"] = True
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)

    if not ENABLED:
        log("pihole-presence: disabled in config; screen stays on")
        write_state({"enabled": False, "asleep": False, "updated_at": time.time()})
        while not stopping["now"]:
            time.sleep(1)
        return

    sensor = Sensor()
    touch = open_touch()
    last_active = time.monotonic()
    last_state = None
    last_write = 0.0
    log(f"pihole-presence: sleep after {SLEEP_AFTER:.0f}s without presence; output {OUTPUT}; "
        f"sensor {sensor.status}; touch {'on' if touch is not None else 'off'}")

    try:
        while not stopping["now"]:
            touched = False
            if touch is not None:
                r, _, _ = select.select([touch], [], [], TICK)
                if r:
                    try:
                        data = os.read(touch, EVENT.size * 64)
                        touched = len(data) >= EVENT.size
                    except BlockingIOError:
                        pass
                    except OSError:
                        os.close(touch)
                        touch = None
            else:
                time.sleep(TICK)

            present, status = sensor.read()
            now = time.monotonic()
            if present or touched:
                last_active = now
                if screen.asleep:
                    screen.wake("touch" if touched else "presence")
            elif not screen.asleep and now - last_active >= SLEEP_AFTER:
                screen.sleep()

            state = {"enabled": True, "asleep": screen.asleep, "present": present, "sensor": status,
                     "sleep_after": SLEEP_AFTER}
            if state != last_state or time.time() - last_write > 5:
                write_state({**state, "updated_at": time.time()})
                last_state, last_write = state, time.time()
    finally:
        screen.wake("stop")                 # fail open
        write_state({"enabled": True, "asleep": False, "updated_at": time.time(), "stopped": True})


if __name__ == "__main__":
    main()
