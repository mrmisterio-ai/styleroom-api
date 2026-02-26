#!/bin/bash

# StyleRoom API Deployment Script
# Deploys to Scanbery Server (15.165.125.120)

set -e

echo "🚀 StyleRoom API Deployment Started..."

# Configuration
REMOTE_USER="ubuntu"
REMOTE_HOST="15.165.125.120"
REMOTE_DIR="/home/ubuntu/projects/styleroom-api"
LOCAL_DIR="."

echo "📦 Building project..."
npm run build

echo "📤 Syncing files to remote server..."
rsync -avz --exclude 'node_modules' \
           --exclude '.git' \
           --exclude 'uploads' \
           --exclude 'results' \
           --exclude 'styleroom.db' \
           --exclude 'coverage' \
           --exclude '.env' \
           ${LOCAL_DIR}/ ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/

echo "🔧 Installing dependencies on remote server..."
ssh ${REMOTE_USER}@${REMOTE_HOST} "cd ${REMOTE_DIR} && npm install --production"

echo "♻️  Restarting PM2 service..."
ssh ${REMOTE_USER}@${REMOTE_HOST} "cd ${REMOTE_DIR} && pm2 restart styleroom-api || pm2 start dist/index.js --name styleroom-api --cwd ${REMOTE_DIR}"

echo "📊 Checking PM2 status..."
ssh ${REMOTE_USER}@${REMOTE_HOST} "pm2 status styleroom-api"

echo "✅ Deployment completed successfully!"
echo "🔍 View logs: ssh ${REMOTE_USER}@${REMOTE_HOST} 'pm2 logs styleroom-api'"
