#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
if [[ "$PWD" != /home/maks/eink-dashboard || "$(id -un)" != maks || "$(uname -s)" != Linux ]]; then
  echo 'Run this as maks from /home/maks/eink-dashboard on the Raspberry Pi.' >&2
  exit 1
fi

sudo apt-get update
sudo apt-get install -y --no-install-recommends \
  chromium-headless-shell nodejs npm python3-pil python3-gpiozero python3-lgpio python3-spidev
sudo usermod -a -G gpio,spi maks
sudo raspi-config nonint do_spi 0
if [[ ! -e /dev/spidev0.0 ]]; then
  echo 'SPI was enabled. Reboot the Pi, then run this script again.' >&2
  exit 1
fi

npm ci --ignore-scripts --no-audit --no-fund
mkdir -p data images
sudo install -m 644 deploy/eink-dashboard.service deploy/eink-refresh.service deploy/eink-refresh.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable eink-dashboard.service eink-refresh.timer
sudo systemctl restart eink-dashboard.service
sudo systemctl start eink-refresh.timer
sudo systemctl start eink-refresh.service
systemctl --no-pager status eink-refresh.timer
cat data/display-status.json
