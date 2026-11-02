#!/usr/bin/env bash
# 모두플레이 악기 나누기 서버 설치 (Ubuntu/Debian, 1회 실행)
# 사용: curl -fsSL https://raw.githubusercontent.com/BopsPower/moduplay/main/converter/stems/install-stems.sh | sudo bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

echo "== 1/5 기본 패키지"
apt-get update -qq
apt-get install -y -qq curl ca-certificates git ffmpeg python3 python3-venv python3-pip

echo "== 2/5 스왑 4GB (작은 서버에서 메모리 확보)"
if [ ! -f /swapfile ]; then
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "== 3/5 Demucs (CPU용 PyTorch)"
if [ ! -x /opt/stems-venv/bin/python ]; then python3 -m venv /opt/stems-venv; fi
/opt/stems-venv/bin/pip install -q --upgrade pip
/opt/stems-venv/bin/pip install -q torch torchaudio --index-url https://download.pytorch.org/whl/cpu
/opt/stems-venv/bin/pip install -q demucs lameenc soundfile
# 모델 미리 받아 두기 (첫 작업이 느려지지 않게)
/opt/stems-venv/bin/python -c "from demucs.pretrained import get_model; get_model('htdemucs_6s')" || true

echo "== 4/5 Node.js 20 + 프로그램"
if ! command -v node >/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
  apt-get install -y -qq nodejs
fi
install -d /opt/moduplay
if [ -d /opt/moduplay/.git ]; then git -C /opt/moduplay pull -q; else git clone -q https://github.com/BopsPower/moduplay.git /opt/moduplay; fi
cd /opt/moduplay/converter && npm install --omit=dev --silent

if [ ! -f /etc/moduplay-stems.env ]; then
  cat > /etc/moduplay-stems.env <<'EOF'
SUPABASE_URL=https://stnyjclifmcbxeorcoje.supabase.co
SUPABASE_SERVICE_KEY=여기에_서비스_키_붙여넣기
STEM_MODEL=htdemucs_6s
IDLE_MINUTES=10
EOF
  chmod 600 /etc/moduplay-stems.env
fi

echo "== 5/5 자동 실행 (켜질 때마다 최신 코드 받고 시작)"
cat > /etc/systemd/system/moduplay-stems.service <<'EOF'
[Unit]
Description=ModuPlay stem separation worker
After=network-online.target
Wants=network-online.target

[Service]
EnvironmentFile=/etc/moduplay-stems.env
WorkingDirectory=/opt/moduplay/converter
ExecStartPre=-/usr/bin/git -C /opt/moduplay pull -q
ExecStart=/usr/bin/node stems/worker.mjs
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable moduplay-stems >/dev/null

echo
echo "설치 완료. 다음 한 줄만 남았어요:"
echo "  sudo nano /etc/moduplay-stems.env   ← SUPABASE_SERVICE_KEY 채우기 (변환 서버와 같은 값)"
echo "  sudo systemctl restart moduplay-stems && sudo journalctl -u moduplay-stems -f"
