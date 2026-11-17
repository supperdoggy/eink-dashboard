#!/usr/bin/env bash
set -euo pipefail
export LC_ALL=C

profile=${1:?Usage: bash deploy/install-wifi-recovery.sh 'Wi-Fi profile name'}
cd "$(dirname "$0")"

uuid=$(nmcli -g connection.uuid connection show id "$profile")
if [[ ! "$uuid" =~ ^[[:xdigit:]]{8}(-[[:xdigit:]]{4}){3}-[[:xdigit:]]{12}$ ||
      "$(nmcli -g connection.type connection show uuid "$uuid")" != 802-11-wireless ]]; then
  printf 'Expected one saved Wi-Fi profile.\n' >&2
  exit 1
fi

sudo -n nmcli connection modify uuid "$uuid" connection.autoconnect yes connection.autoconnect-retries 0
config=$(mktemp)
trap 'rm -f "$config"' EXIT
printf 'WIFI_PROFILE_UUID=%s\n' "$uuid" > "$config"
sudo -n install -m 644 "$config" /etc/default/eink-wifi-recover
sudo -n install -D -m 755 eink-wifi-recover /usr/local/libexec/eink-wifi-recover
sudo -n install -m 644 eink-wifi-recover.service eink-wifi-recover.timer /etc/systemd/system/
sudo -n systemctl daemon-reload
sudo -n systemctl enable --now eink-wifi-recover.timer
systemctl list-timers eink-wifi-recover.timer --no-pager
