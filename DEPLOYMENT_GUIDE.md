# StyleRoom API Deployment Guide

## Prerequisites

### Local Environment
- Node.js v18+ installed
- SSH access to deployment server (15.165.125.120)
- SSH key configured for passwordless login

### Remote Server (15.165.125.120)
- PM2 installed globally
- Node.js v18+ installed
- Directory: `/home/ubuntu/projects/styleroom-api`
- Port 5000 available

## Environment Variables

Create `.env` file on the remote server:

```env
PORT=5000
REPLICATE_API_TOKEN=your_replicate_token_here
NODE_ENV=production
```

**Important**: Never commit `.env` to Git!

## Deployment Methods

### Method 1: Automated Deployment (Recommended)

Use the deployment script:

```bash
./deploy.sh
```

This script will:
1. Build the project locally
2. Sync files to remote server (excluding node_modules, uploads, etc.)
3. Install production dependencies on remote
4. Restart PM2 service
5. Show deployment status

### Method 2: Manual Deployment

#### Step 1: Build Locally
```bash
npm run build
```

#### Step 2: Sync Files
```bash
rsync -avz --exclude 'node_modules' \
           --exclude '.git' \
           --exclude 'uploads' \
           --exclude 'results' \
           --exclude 'styleroom.db' \
           --exclude 'coverage' \
           --exclude '.env' \
           ./ ubuntu@15.165.125.120:/home/ubuntu/projects/styleroom-api/
```

#### Step 3: SSH to Server
```bash
ssh ubuntu@15.165.125.120
```

#### Step 4: Install Dependencies
```bash
cd /home/ubuntu/projects/styleroom-api
npm install --production
```

#### Step 5: Install Sharp (Required for Image Processing)
```bash
npm install sharp
```

#### Step 6: Restart PM2
```bash
pm2 restart styleroom-api
# Or if not running yet:
pm2 start dist/index.js --name styleroom-api --cwd /home/ubuntu/projects/styleroom-api
```

#### Step 7: Verify Deployment
```bash
pm2 status styleroom-api
pm2 logs styleroom-api --lines 50
```

## Post-Deployment Checks

### 1. Health Check
```bash
curl http://15.165.125.120:5000/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### 2. Test Image Upload
```bash
curl -X POST http://15.165.125.120:5000/api/generate \
  -F "model_image=@test-model.jpg" \
  -F "garment_image=@test-garment.jpg" \
  -F "steps=12"
```

### 3. Monitor Logs
```bash
pm2 logs styleroom-api --lines 100
```

### 4. Check Process Status
```bash
pm2 status
pm2 info styleroom-api
```

## Preprocessing Feature Testing

Test the new person detection and cropping feature:

### Single Person Photo
```bash
curl -X POST http://15.165.125.120:5000/api/generate \
  -F "model_image=@single-person.jpg" \
  -F "garment_image=@shirt.jpg"
```

### Multi-Person Photo (Default: Largest Person)
```bash
curl -X POST http://15.165.125.120:5000/api/generate \
  -F "model_image=@multi-person.jpg" \
  -F "garment_image=@shirt.jpg"
```

### Multi-Person Photo (Select Left Person)
```bash
curl -X POST http://15.165.125.120:5000/api/generate \
  -F "model_image=@multi-person.jpg" \
  -F "garment_image=@shirt.jpg" \
  -F "person_description=왼쪽"
```

### Multi-Person Photo (Select Right Person)
```bash
curl -X POST http://15.165.125.120:5000/api/generate \
  -F "model_image=@multi-person.jpg" \
  -F "garment_image=@shirt.jpg" \
  -F "person_description=오른쪽"
```

## Troubleshooting

### Issue: Port 5000 already in use
```bash
pm2 stop styleroom-api
# Or kill the process:
lsof -ti:5000 | xargs kill -9
pm2 start dist/index.js --name styleroom-api
```

### Issue: Sharp installation fails
```bash
npm rebuild sharp
# Or force reinstall:
npm uninstall sharp
npm install sharp --build-from-source=false
```

### Issue: Replicate API authentication error
- Verify `.env` file exists on server
- Check `REPLICATE_API_TOKEN` is correct
- Test token: `curl -H "Authorization: Token $REPLICATE_API_TOKEN" https://api.replicate.com/v1/models`

### Issue: Image preprocessing fails
- Check YOLO model availability on Replicate
- Verify Replicate API quota
- Check logs: `pm2 logs styleroom-api`
- Test with single-person photo first

### Issue: Out of disk space
```bash
# Clean old results
rm -rf /home/ubuntu/projects/styleroom-api/results/*
# Clean old uploads
find /home/ubuntu/projects/styleroom-api/uploads -mtime +7 -delete
```

## Rollback Procedure

If deployment fails:

### Method 1: PM2 Rollback
```bash
pm2 stop styleroom-api
git checkout <previous-commit>
npm run build
pm2 restart styleroom-api
```

### Method 2: Keep Previous Build
Before deploying, backup:
```bash
ssh ubuntu@15.165.125.120 "cd /home/ubuntu/projects/styleroom-api && tar -czf backup-$(date +%Y%m%d-%H%M%S).tar.gz dist/"
```

Restore:
```bash
ssh ubuntu@15.165.125.120 "cd /home/ubuntu/projects/styleroom-api && tar -xzf backup-YYYYMMDD-HHMMSS.tar.gz"
pm2 restart styleroom-api
```

## Performance Monitoring

### PM2 Monitoring
```bash
pm2 monit
```

### Resource Usage
```bash
pm2 show styleroom-api
```

### Database Size
```bash
ls -lh /home/ubuntu/projects/styleroom-api/styleroom.db
```

## Maintenance

### Clean Old Files (Weekly)
```bash
# Clean uploads older than 7 days
find /home/ubuntu/projects/styleroom-api/uploads -mtime +7 -delete

# Clean results older than 7 days
find /home/ubuntu/projects/styleroom-api/results -mtime +7 -delete

# Vacuum database
sqlite3 /home/ubuntu/projects/styleroom-api/styleroom.db "VACUUM;"
```

### PM2 Startup (Auto-restart on reboot)
```bash
pm2 startup
pm2 save
```

## Changelog

### 2024-02-26: Preprocessing Pipeline Added
- ✅ YOLO-based person detection
- ✅ Auto-cropping for single/multi-person photos
- ✅ Person selection via `person_description` field
- ✅ Sharp package for image manipulation
- ✅ Improved error messages

### Previous: Initial Deployment
- ✅ IDM-VTON integration
- ✅ Basic API endpoints
- ✅ SQLite database
- ✅ PM2 process management

## Support

- **Logs**: `pm2 logs styleroom-api`
- **Status**: `pm2 status`
- **Restart**: `pm2 restart styleroom-api`
- **Stop**: `pm2 stop styleroom-api`
- **Delete**: `pm2 delete styleroom-api`

For issues, check:
1. PM2 logs first
2. System resources (disk, memory)
3. Replicate API status
4. Network connectivity
