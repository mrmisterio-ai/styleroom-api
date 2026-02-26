import request from 'supertest';
import app from '../index';
import path from 'path';
import fs from 'fs';

describe('StyleRoom API', () => {
  describe('GET /health', () => {
    it('should return health status', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });

  describe('POST /api/generate', () => {
    it('should reject request without required images', async () => {
      const res = await request(app)
        .post('/api/generate')
        .field('steps', '12');
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBeTruthy();
    });

    it('should accept valid generation request', async () => {
      // Create dummy test images
      const testDir = path.join(__dirname, '../../test-images');
      fs.mkdirSync(testDir, { recursive: true });
      
      const dummyImage = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64'
      );
      
      const modelPath = path.join(testDir, 'model.png');
      const garmentPath = path.join(testDir, 'garment.png');
      
      fs.writeFileSync(modelPath, dummyImage);
      fs.writeFileSync(garmentPath, dummyImage);

      const res = await request(app)
        .post('/api/generate')
        .attach('model_image', modelPath)
        .attach('garment_image', garmentPath)
        .field('steps', '12')
        .field('guidance_scale', '2.5');

      expect(res.status).toBe(200);
      expect(res.body.id).toBeDefined();
      expect(['pending', 'processing']).toContain(res.body.status);
      expect(res.body.params).toEqual({
        steps: 12,
        guidance_scale: 2.5
      });

      // Cleanup
      fs.unlinkSync(modelPath);
      fs.unlinkSync(garmentPath);
      fs.rmdirSync(testDir);
    });
  });

  describe('GET /api/generate/:id', () => {
    it('should return 404 for non-existent generation', async () => {
      const res = await request(app).get('/api/generate/999999');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/history', () => {
    it('should return history list', async () => {
      const res = await request(app).get('/api/history');
      expect(res.status).toBe(200);
      expect(res.body.items).toBeDefined();
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.total).toBeDefined();
      expect(res.body.page).toBe(1);
    });

    it('should support pagination', async () => {
      const res = await request(app).get('/api/history?page=2&limit=10');
      expect(res.status).toBe(200);
      expect(res.body.page).toBe(2);
      expect(res.body.limit).toBe(10);
    });
  });

  describe('DELETE /api/history/:id', () => {
    it('should return 404 for non-existent generation', async () => {
      const res = await request(app).delete('/api/history/999999');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/generate/:id/retry', () => {
    it('should return 404 for non-existent generation', async () => {
      const res = await request(app)
        .post('/api/generate/999999/retry')
        .send({ steps: 20 });
      
      expect(res.status).toBe(404);
    });
  });
});
