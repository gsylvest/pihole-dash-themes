#!/usr/bin/env bash
# Run ON THE PI from a copy of this repo:  sudo ./install.sh
# Idempotent. Never touches pihole-FTL, Pi-hole settings, or the app password file's contents.
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
DESKTOP_USER="${SUDO_USER:?run with sudo as the desktop user}"
DESKTOP_HOME="$(getent passwd "$DESKTOP_USER" | cut -d: -f6)"
RESTART_KIOSK="${RESTART_KIOSK:-1}"

[ "$(id -u)" -eq 0 ] || { echo "run with sudo" >&2; exit 1; }

# 1. dedicated unprivileged service user
if ! id pihole-dash >/dev/null 2>&1; then
  useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin pihole-dash
  echo "created user pihole-dash"
fi

# 2. app files (root-owned, world-readable code; no secrets in here)
install -d -m 755 /opt/pihole-dash /opt/pihole-dash/backend
rm -rf /opt/pihole-dash/www.new
cp -R "$SRC/app" /opt/pihole-dash/www.new
chown -R root:root /opt/pihole-dash/www.new
find /opt/pihole-dash/www.new -type d -exec chmod 755 {} + -o -type f -exec chmod 644 {} +
rm -rf /opt/pihole-dash/www.old
[ -d /opt/pihole-dash/www ] && mv /opt/pihole-dash/www /opt/pihole-dash/www.old
mv /opt/pihole-dash/www.new /opt/pihole-dash/www
rm -rf /opt/pihole-dash/www.old
install -m 644 "$SRC/backend/pihole_dash.py" /opt/pihole-dash/backend/pihole_dash.py
install -m 644 "$SRC/README.md" /opt/pihole-dash/README.md

# 3. secret directory (root only). You create the password file yourself (README → App password).
install -d -m 700 -o root -g root /etc/pihole-dash

# 4. backend service
install -m 644 "$SRC/systemd/pihole-dash.service" /etc/systemd/system/pihole-dash.service
systemctl daemon-reload
systemctl enable pihole-dash.service >/dev/null
systemctl restart pihole-dash.service

# 4b. optional: screen sleep/wake with an HLK-LD2410C radar (run as: sudo PRESENCE=1 ./install.sh)
#     Fails open: with no sensor wired the screen simply stays on.
if [ "${PRESENCE:-0}" = "1" ]; then
  for pkg in python3-lgpio wlopm; do
    dpkg -s "$pkg" >/dev/null 2>&1 || apt-get install -y "$pkg"
  done
  install -d -m 755 /opt/pihole-dash/presence
  install -m 644 "$SRC/presence/pihole_presence.py" /opt/pihole-dash/presence/pihole_presence.py
  [ -f /etc/default/pihole-presence ] || install -m 644 "$SRC/presence/pihole-presence.default" /etc/default/pihole-presence
  sed -e "s/@USER@/$DESKTOP_USER/g" -e "s/@UID@/$(id -u "$DESKTOP_USER")/g" \
    "$SRC/systemd/pihole-presence.service" > /etc/systemd/system/pihole-presence.service
  chmod 644 /etc/systemd/system/pihole-presence.service
  systemctl daemon-reload
  systemctl enable pihole-presence.service >/dev/null
  systemctl restart pihole-presence.service
  echo "pihole-presence: $(systemctl is-active pihole-presence.service)"
fi

# 5. kiosk launcher + desktop autostart for the desktop user
install -m 755 "$SRC/kiosk/pihole-dash-kiosk" /usr/local/bin/pihole-dash-kiosk
install -d -m 755 -o "$DESKTOP_USER" -g "$DESKTOP_USER" "$DESKTOP_HOME/.config/autostart"
install -m 644 -o "$DESKTOP_USER" -g "$DESKTOP_USER" "$SRC/kiosk/pihole-dash-kiosk.desktop" "$DESKTOP_HOME/.config/autostart/pihole-dash-kiosk.desktop"

# 6. wait for the backend, then reload the kiosk so it picks up new page files
for _ in $(seq 20); do curl -fsS -o /dev/null --max-time 1 http://127.0.0.1:8088/healthz 2>/dev/null && break; sleep 0.5; done
systemctl is-active --quiet pihole-dash.service && echo "pihole-dash: active" || { echo "pihole-dash failed to start" >&2; journalctl -u pihole-dash -n 20 --no-pager >&2; exit 1; }
if [ "$RESTART_KIOSK" = "1" ]; then
  sudo -u "$DESKTOP_USER" XDG_RUNTIME_DIR="/run/user/$(id -u "$DESKTOP_USER")" /usr/local/bin/pihole-dash-kiosk restart || true
fi
echo "install complete"
