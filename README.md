# StyleRoom API

AI Virtual Fitting Service Backend - Transform model photos with AI-powered garment try-on.

## Features

- 🎨 AI-powered virtual try-on using Replicate (IDM-VTON model)
- 📸 Multi-image upload support (model, garment, background)
- 🧠 Intelligent person detection and auto-cropping (YOLO)
- 👥 Multi-person photo support with smart selection
- 💾 SQLite database for generation history
- 🔄 Background processing with status polling
- 📊 Pagination and history management
- 🧪 Comprehensive test coverage

## Tech Stack

- **Runtime**: Node.js + TypeScript
- **Framework**: Express.js
- **AI**: Replicate API (IDM-VTON)
- **Database**: SQLite + better-sqlite3
- **File Upload**: Multer
- **Testing**: Jest + Supertest
- **Deployment**: PM2

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
Create `.env` file:
```env
PORT=5000
REPLICATE_API_TOKEN=your_replicate_token_here
NODE_ENV=development
```

Get your Replicate API token from: https://replicate.com/account/api-tokens

### 3. Build
```bash
npm run build
```

### 4. Run
```bash
# Development
npm run dev

# Production
npm start
```

## API Endpoints

### POST /api/generate
Create a new virtual try-on generation.

**Request**: `multipart/form-data`
- `model_image` (file, required) - Model photo (supports multi-person photos)
- `garment_image` (file, required) - Garment photo
- `background_image` (file, optional) - Background photo
- `background_prompt` (string, optional) - Background description
- `person_description` (string, optional) - Target person selection hint (e.g., "왼쪽", "오른쪽", "가운데", "첫번째")
- `steps` (number, default: 12) - Inference steps
- `guidance_scale` (number, default: 2.5) - Guidance scale
- `seed` (number, optional) - Random seed

**Person Selection**:
- Single person: Automatically detected and cropped
- Multiple persons: 
  - Default: Largest/most prominent person
  - With `person_description`:
    - "왼쪽" or "left" → Leftmost person
    - "오른쪽" or "right" → Rightmost person
    - "가운데" or "center" → Center person
    - "첫번째" or "first" → First person from left
    - "두번째" or "second" → Second person from left
- No person detected: Returns friendly error message

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
  "created_at": "2024-01-01T00:00:00.000Z"
}
```

### GET /api/generate/:id
Get generation status and result.

**Response**:
```json
{
  "id": 1,
  "status": "completed",
  "result_url": "/results/1-1234567890.png",
  "params": {
    "steps": 12,
    "guidance_scale": 2.5
  }
}
```

Status values: `pending`, `processing`, `completed`, `failed`

### GET /api/history
Get generation history with pagination.

**Query params**:
- `page` (number, default: 1)
- `limit` (number, default: 20)

**Response**:
```json
{
  "items": [...],
  "total": 100,
  "page": 1,
  "limit": 20,
  "pages": 5
}
```

### POST /api/generate/:id/retry
Retry generation with different parameters.

**Request body**:
```json
{
  "steps": 20,
  "guidance_scale": 3.0,
  "seed": 123
}
```

### DELETE /api/history/:id
Delete a generation and its associated files.

### GET /health
Health check endpoint.

## Testing

```bash
npm test
```

## Deployment with PM2

```bash
# Build
npm run build

# Start with PM2
pm2 start dist/index.js --name styleroom-api

# Monitor
pm2 logs styleroom-api
pm2 status

# Stop
pm2 stop styleroom-api
```

## Database Schema

```sql
CREATE TABLE generations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model_image TEXT NOT NULL,
  garment_image TEXT NOT NULL,
  background_image TEXT,
  background_prompt TEXT,
  result_image TEXT,
  status TEXT DEFAULT 'pending',
  replicate_id TEXT,
  params TEXT,
  error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## File Structure

```
styleroom-api/
├── src/
│   ├── db/
│   │   └── index.ts          # Database operations
│   ├── services/
│   │   ├── replicate.ts      # Replicate API integration
│   │   └── preprocess.ts     # Image preprocessing (YOLO person detection)
│   ├── routes/
│   │   ├── generate.ts       # Generation endpoints
│   │   └── history.ts        # History endpoints
│   ├── __tests__/
│   │   ├── api.test.ts       # API tests
│   │   └── preprocess.test.ts # Preprocessing tests
│   └── index.ts              # Express app
├── uploads/                  # Uploaded images
├── results/                  # Generated results
├── styleroom.db             # SQLite database
└── dist/                    # Compiled JS
```

## License

ISC
