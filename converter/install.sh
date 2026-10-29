#!/usr/bin/env bash
# 모두플레이 변환 서버 설치 (Debian/Ubuntu, 1회 실행)
# 사용: curl -fsSL https://raw.githubusercontent.com/BopsPower/moduplay/main/converter/install.sh | sudo bash
set -euo pipefail

echo "== 1/5 기본 패키지"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates xvfb libfuse2t64 libgl1 libegl1 libxkbcommon-x11-0 libxcb-cursor0 \
  libxcb-icccm4 libxcb-keysyms1 libxcb-shape0 libxcb-xinerama0 libxcb-xkb1 libnss3 libasound2t64 libpulse0 \
  fonts-noto-cjk git 2>/dev/null || \
apt-get install -y -qq curl ca-certificates xvfb libfuse2 libgl1 libegl1 libxkbcommon-x11-0 libxcb-cursor0 \
  libxcb-icccm4 libxcb-keysyms1 libxcb-shape0 libxcb-xinerama0 libxcb-xkb1 libnss3 libasound2 libpulse0 \
  fonts-noto-cjk git

echo "== 2/5 스왑 2GB (작은 서버에서 MuseScore 메모리 확보)"
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "== 3/5 Node.js 20"
if ! command -v node >/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
  apt-get install -y -qq nodejs
fi

echo "== 4/5 MuseScore 4 (AppImage)"
mkdir -p /opt/musescore
if [ ! -x /opt/musescore/mscore ]; then
  cd /opt/musescore
  URL="https://github.com/musescore/MuseScore/releases/download/v4.7.6/MuseScore-Studio-4.7.6.261022093-x86_64.AppImage"
  curl -fL -o MuseScore.AppImage "$URL"
  chmod +x MuseScore.AppImage
  ./MuseScore.AppImage --appimage-extract >/dev/null
  ln -sf /opt/musescore/squashfs-root/AppRun /opt/musescore/mscore
  rm -f MuseScore.AppImage
fi
/opt/musescore/mscore --version 2>/dev/null | head -1 || true

echo "== 5/5 변환 프로그램"
install -d /opt/moduplay
if [ -d /opt/moduplay/.git ]; then git -C /opt/moduplay pull -q; else git clone -q https://github.com/BopsPower/moduplay.git /opt/moduplay; fi
cd /opt/moduplay/converter && npm install --omit=dev --silent

if [ ! -f /etc/moduplay-converter.env ]; then
  cat > /etc/moduplay-converter.env <<'EOF'
SUPABASE_URL=https://stnyjclifmcbxeorcoje.supabase.co
SUPABASE_SERVICE_KEY=여기에_서비스_키_붙여넣기
MSCORE=/opt/musescore/mscore
POLL_SECONDS=20
EOF
  chmod 600 /etc/moduplay-converter.env
fi

cat > /etc/systemd/system/moduplay-converter.service <<'EOF'
[Unit]
Description=ModuPlay score converter
After=network-online.target

[Service]
EnvironmentFile=/etc/moduplay-converter.env
WorkingDirectory=/opt/moduplay/converter
ExecStart=/usr/bin/node convert.mjs
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable moduplay-converter >/dev/null

echo
echo "설치 완료. 다음 한 줄만 남았어요:"
echo "  sudo nano /etc/moduplay-converter.env   ← SUPABASE_SERVICE_KEY 채우기"
echo "  sudo systemctl restart moduplay-converter && sudo journalctl -u moduplay-converter -f"
