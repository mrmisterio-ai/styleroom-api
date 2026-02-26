# StyleRoom API Setup Guide

## Current Status ✅

The StyleRoom API backend is fully implemented and deployed!

- ✅ All API endpoints implemented
- ✅ Database schema created
- ✅ Image upload handling configured
- ✅ Background processing with Replicate API integration
- ✅ All tests passing (8/8)
- ✅ PM2 deployment running on port 5000
- ✅ Git repository created and pushed to GitHub
- ✅ Health check endpoint working

## Quick Test

```bash
curl http://localhost:5000/health
# {"status":"ok","timestamp":"2026-02-26T01:44:04.498Z"}
```

## Replicate API Token Setup ⚠️

The API is fully functional but requires a valid Replicate API token to process virtual try-on requests.

### Get Your Token

1. Go to https://replicate.com/account/api-tokens
2. Sign up or log in
3. Create a new API token
4. Copy the token (starts with `r8_...`)

### Add Token to Environment

```bash
cd /home/ubuntu/projects/styleroom-api
nano .env
```

Update the `.env` file:
```env
PORT=5000
REPLICATE_API_TOKEN=r8_your_actual_token_here
NODE_ENV=development
```

Then restart PM2:
```bash
pm2 restart styleroom-api
```

## Testing the API

### 1. Health Check
```bash
curl http://localhost:5000/health
```

### 2. Create Generation
```bash
curl -X POST http://localhost:5000/api/generate \
  -F "model_image=@/path/to/model.jpg" \
  -F "garment_image=@/path/to/garment.jpg" \
  -F "steps=12" \
  -F "guidance_scale=2.5"
```

### 3. Check Status
```bash
curl http://localhost:5000/api/generate/1
```

### 4. Get History
```bash
curl http://localhost:5000/api/history?page=1&limit=20
```

## PM2 Commands

```bash
# Check status
pm2 status styleroom-api

# View logs
pm2 logs styleroom-api

# Restart
pm2 restart styleroom-api

# Stop
pm2 stop styleroom-api

# Remove from PM2
pm2 delete styleroom-api
```

## Development

```bash
# Install dependencies
npm install

# Development mode (auto-reload)
npm run dev

# Build TypeScript
npm run build

# Run tests
npm test

# Production start
npm start
```

## Repository

- **GitHub**: https://github.com/mrmisterio-ai/styleroom-api
- **Commit**: 87a4100 - "feat: initial StyleRoom API implementation"

## File Structure

```
styleroom-api/
├── src/
│   ├── db/index.ts           # SQLite database operations
│   ├── services/
│   │   └── replicate.ts      # Replicate API integration
│   ├── routes/
│   │   ├── generate.ts       # Generation endpoints
│   │   └── history.ts        # History endpoints
│   ├── __tests__/
│   │   └── api.test.ts       # API tests (8 tests, all passing)
│   └── index.ts              # Express app entry point
├── dist/                     # Compiled JavaScript (built)
├── uploads/                  # Uploaded images (auto-created)
├── results/                  # Generated results (auto-created)
├── styleroom.db             # SQLite database
└── package.json

```

## Next Steps

1. **Add Replicate API token** to `.env` file
2. **Test with real images** using curl or Postman
3. **Frontend integration** - point to `http://localhost:5000/api`
4. **Production deployment** considerations:
   - Use cloud storage (S3/GCS) for images instead of local filesystem
   - Add authentication middleware
   - Set up proper CORS configuration
   - Use PostgreSQL instead of SQLite for better concurrency
   - Add rate limiting
   - Set up monitoring and error tracking

## Acceptance Criteria ✅

- [x] POST /api/generate — Image upload + Replicate API integration ✅
- [x] GET /api/generate/:id — Status polling ✅
- [x] GET /api/history — Paginated history ✅
- [x] POST /api/generate/:id/retry — Parameter retry ✅
- [x] DELETE /api/history/:id — Delete generation ✅
- [x] SQLite DB schema ✅
- [x] Image upload/storage ✅
- [x] PM2 deployment (port 5000) ✅
- [x] npm test passing ✅
- [x] Git + GitHub push ✅

All acceptance criteria met! 🎉
