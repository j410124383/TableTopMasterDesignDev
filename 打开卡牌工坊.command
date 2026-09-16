#!/bin/bash
cd "$(dirname "$0")"
ROOT="$(pwd)"
chmod +x "$0" 2>/dev/null || true

NODE_HOME="$ROOT/vendor/node"
NODE_BIN="$NODE_HOME/bin/node"
chmod +x "$NODE_BIN" "$NODE_HOME/bin/npm" "$NODE_HOME/bin/npx" "$NODE_HOME/bin/corepack" 2>/dev/null || true
export PATH="$NODE_HOME/bin:$PATH"

if [ ! -f "$NODE_BIN" ]; then
  echo "没找到内置 Node.js。请使用完整的 Mac 离线包（TMD-offline-mac.zip）。"
  read -r _
  exit 1
fi

if [ ! -d "$ROOT/node_modules" ]; then
  echo "第一次打开，正在安装依赖（国内镜像，不需要 VPN）…"
  npm install --registry=https://registry.npmmirror.com
  if [ $? -ne 0 ]; then
    echo "安装失败。请检查网络后重试。"
    read -r _
    exit 1
  fi
fi

echo
node "$ROOT/scripts/print-lan.mjs"
if [ -f "$ROOT/VERSION.txt" ]; then
  echo
  echo "版本文件：VERSION.txt"
fi
echo "不要关这个终端窗口。"
echo "请用 Chrome 或 Edge 打开，不要用 Safari。"
echo

(sleep 3; open "http://localhost:1420/") &
npm run start
status=$?
if [ $status -ne 0 ]; then
  echo
  echo "启动失败。常见原因：1420 端口被占用，或依赖没装完。"
  echo "可关掉其它终端后再试，或在 Chrome 打开 http://localhost:1420/"
  read -r _
fi
