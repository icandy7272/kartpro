#!/bin/bash
# KartPro 部署脚本
# 用法: ./deploy.sh

set -e

SERVER="root@192.144.128.67"
APP_DIR="/opt/kartpro"

echo "1. 构建项目..."
npm run build

echo "2. 打包文件..."
tar czf /tmp/kartpro-deploy.tar.gz dist/ nginx.conf Dockerfile

echo "3. 上传到服务器..."
scp /tmp/kartpro-deploy.tar.gz $SERVER:/tmp/

echo "4. 在服务器上部署..."
ssh $SERVER << 'EOF'
  set -e
  mkdir -p /opt/kartpro
  cd /opt/kartpro
  tar xzf /tmp/kartpro-deploy.tar.gz

  # 停掉旧容器（如果有）
  docker stop kartpro 2>/dev/null || true
  docker rm kartpro 2>/dev/null || true

  # 构建并启动
  docker build -t kartpro .
  docker run -d --name kartpro --restart unless-stopped -p 8088:80 kartpro

  echo "部署完成！"
  docker ps | grep kartpro
EOF

echo ""
echo "部署成功！访问: http://192.144.128.67:8088"
rm /tmp/kartpro-deploy.tar.gz
