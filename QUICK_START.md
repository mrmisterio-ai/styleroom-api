# StyleRoom API - Quick Start Guide

## What's New? 🎉

### Image Preprocessing Pipeline (2024-02-26)
- **Multi-person photo support**: Automatically detects and crops the target person
- **Smart person selection**: Use `person_description` to choose which person to process
- **Better error messages**: Clear feedback when no person is detected

## Installation

```bash
# 1. Clone the repository
git clone https://github.com/mrmisterio-ai/styleroom-api.git
cd styleroom-api

# 2. Install dependencies
npm install

# 3. Create .env file
cat > .env << EOF
PORT=5000
REPLICATE_API_TOKEN=your_token_here
NODE_ENV=development
EOF

# 4. Build
npm run build

# 5. Run
npm start
```

## Quick Test

```bash
# Health check
curl http://localhost:5000/health

# Single person photo
curl -X POST http://localhost:5000/api/generate \
  -F "model_image=@person.jpg" \
  -F "garment_image=@shirt.jpg"

# Multi-person photo (select left person)
curl -X POST http://localhost:5000/api/generate \
  -F "model_image=@group.jpg" \
  -F "garment_image=@shirt.jpg" \
  -F "person_description=왼쪽"

# Check result
curl http://localhost:5000/api/generate/1
```

## Deploy to Production

```bash
# Automated deployment
./deploy.sh

# Manual deployment
# See DEPLOYMENT_GUIDE.md
```

## Project Structure

```
styleroom-api/
├── src/
│   ├── services/
│   │   ├── preprocess.ts      # 🆕 Person detection & cropping
│   │   └── replicate.ts       # VTON API integration
│   ├── routes/
│   │   ├── generate.ts        # ✨ Updated with preprocessing
│   │   └── history.ts         # History endpoints
│   ├── db/
│   │   └── index.ts           # ✨ Updated for preprocessing
│   └── index.ts               # Express app
├── deploy.sh                  # 🆕 Deployment script
├── DEPLOYMENT_GUIDE.md        # 🆕 Comprehensive guide
└── PREPROCESSING_COMPLETION_REPORT.md  # 🆕 Implementation details
```

## Key Features

### Preprocessing Pipeline
1. **YOLO Person Detection**: Uses Replicate's YOLOv8 to find persons in photos
2. **Auto-Cropping**: Extracts person region with 10% padding
3. **Smart Selection**: Chooses target person based on description or defaults to largest

### Person Selection Options

| Description | Result |
|------------|--------|
| (none) | Largest/most prominent person |
| "왼쪽" or "left" | Leftmost person |
| "오른쪽" or "right" | Rightmost person |
| "가운데" or "center" | Center person |
| "첫번째" or "first" | 1st person from left |
| "두번째" or "second" | 2nd person from left |

### Error Messages

| Scenario | Message |
|----------|---------|
| No person detected | "사진에서 사람을 찾을 수 없습니다. 한 명 이상의 사람이 잘 보이는 사진을 사용해주세요." |
| VTON model error | Detailed error from Replicate API |
| Preprocessing fails | "전처리 중 오류가 발생했습니다." |

## API Reference

### POST /api/generate

**New Fields**:
- `person_description` (string, optional) - Target person selection hint

**Full Parameters**:
```bash
-F "model_image=@photo.jpg"           # Required: Model photo
-F "garment_image=@shirt.jpg"         # Required: Garment photo
-F "person_description=왼쪽"          # Optional: Person selection
-F "background_prompt=beach scene"    # Optional: Background description
-F "steps=12"                         # Optional: Inference steps (default: 12)
-F "guidance_scale=2.5"               # Optional: Guidance scale (default: 2.5)
-F "seed=42"                          # Optional: Random seed
```

**Response**:
```json
{
  "id": 1,
  "status": "pending",
  "result_url": null,
  "params": {
    "steps": 12,
    "guidance_scale": 2.5
  },
  "created_at": "2024-02-26T04:00:00.000Z"
}
```

## Common Issues

### 1. Port already in use
```bash
lsof -ti:5000 | xargs kill -9
npm start
```

### 2. Replicate API authentication
```bash
# Check .env file
cat .env | grep REPLICATE_API_TOKEN

# Test token
curl -H "Authorization: Token YOUR_TOKEN" \
  https://api.replicate.com/v1/models
```

### 3. Sharp installation issues
```bash
npm rebuild sharp
# or
npm install sharp --build-from-source=false
```

## Monitoring

```bash
# PM2 (Production)
pm2 logs styleroom-api
pm2 status
pm2 monit

# Direct logs (Development)
npm run dev
```

## Performance

- **Person detection**: ~10-15 seconds (YOLO)
- **VTON processing**: ~30-60 seconds (IDM-VTON)
- **Total**: ~40-75 seconds per generation
- **Cost**: ~$0.051 per generation (Replicate API)

## Next Steps

1. ✅ Clone and install
2. ✅ Configure `.env` with Replicate token
3. ✅ Test locally with single-person photo
4. ✅ Test with multi-person photo
5. ✅ Deploy to production using `./deploy.sh`
6. ✅ Monitor logs and verify functionality

## Support

- **Logs**: Check PM2 logs or console output
- **Docs**: See `DEPLOYMENT_GUIDE.md` for detailed troubleshooting
- **Report**: See `PREPROCESSING_COMPLETION_REPORT.md` for implementation details

---

**Last Updated**: 2024-02-26  
**Version**: 1.1.0 (with preprocessing pipeline)
