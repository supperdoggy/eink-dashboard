#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
sudo -n install -D -m 644 journald-eink.conf /etc/systemd/journald.conf.d/99-eink-dashboard.conf
sudo -n systemctl restart systemd-journald
sudo -n journalctl --flush
sudo -n install -D -m 644 networkmanager-eink.conf /etc/NetworkManager/conf.d/99-eink-dashboard-logging.conf
sudo -n nmcli general logging level INFO domains 'DEFAULT,WIFI:DEBUG,SUPPLICANT:DEBUG,DHCP4:DEBUG'
