import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { 
  createGeneration, 
  getGeneration, 
  updateGeneration, 
  getHistory, 
  deleteGeneration,
  GenerationParams 
} from '../db';
import { runVTON, getPrediction, downloadImage } from '../services/replicate';

const router = Router();

// Setup multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    let folder = 'uploads/';
    if (file.fieldname === 'model_image') folder += 'model/';
    else if (file.fieldname === 'garment_image') folder += 'garment/';
    else if (file.fieldname === 'background_image') folder += 'background/';
    
    await fs.mkdir(folder, { recursive: true });
    cb(null, folder);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// POST /api/generate - Create new generation
router.post('/', upload.fields([
  { name: 'model_image', maxCount: 1 },
  { name: 'garment_image', maxCount: 1 },
  { name: 'background_image', maxCount: 1 }
]), async (req: Request, res: Response) => {
  try {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    
    if (!files.model_image || !files.garment_image) {
      return res.status(400).json({ error: 'model_image and garment_image are required' });
    }

    const modelImage = files.model_image[0].path;
    const garmentImage = files.garment_image[0].path;
    const backgroundImage = files.background_image?.[0]?.path;
    const backgroundPrompt = req.body.background_prompt;

    const params: GenerationParams = {
      steps: parseInt(req.body.steps) || 12,
      guidance_scale: parseFloat(req.body.guidance_scale) || 2.5,
      seed: req.body.seed ? parseInt(req.body.seed) : undefined,
    };

    // Create DB record
    const generationId = createGeneration({
      model_image: modelImage,
      garment_image: garmentImage,
      background_image: backgroundImage,
      background_prompt: backgroundPrompt,
      params,
    });

    // Start async processing
    processGeneration(generationId).catch(console.error);

    const generation = getGeneration(generationId);
    
    res.json({
      id: generation!.id,
      status: generation!.status,
      result_url: generation!.result_image || null,
      params: JSON.parse(generation!.params),
      created_at: generation!.created_at,
    });
  } catch (error) {
    console.error('Generate error:', error);
    res.status(500).json({ error: 'Failed to create generation' });
  }
});

// GET /api/generate/:id - Get generation status
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const generation = getGeneration(id);
    
    if (!generation) {
      return res.status(404).json({ error: 'Generation not found' });
    }

    res.json({
      id: generation.id,
      status: generation.status,
      result_url: generation.result_image || null,
      params: JSON.parse(generation.params),
      error: generation.error,
    });
  } catch (error) {
    console.error('Get generation error:', error);
    res.status(500).json({ error: 'Failed to get generation' });
  }
});

// POST /api/generate/:id/retry - Retry with different params
router.post('/:id/retry', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const generation = getGeneration(id);
    
    if (!generation) {
      return res.status(404).json({ error: 'Generation not found' });
    }

    const oldParams = JSON.parse(generation.params);
    const newParams: GenerationParams = {
      steps: parseInt(req.body.steps) || oldParams.steps,
      guidance_scale: parseFloat(req.body.guidance_scale) || oldParams.guidance_scale,
      seed: req.body.seed ? parseInt(req.body.seed) : oldParams.seed,
    };

    // Create new generation with same images but new params
    const newId = createGeneration({
      model_image: generation.model_image,
      garment_image: generation.garment_image,
      background_image: generation.background_image || undefined,
      background_prompt: generation.background_prompt || undefined,
      params: newParams,
    });

    // Start async processing
    processGeneration(newId).catch(console.error);

    const newGeneration = getGeneration(newId);
    
    res.json({
      id: newGeneration!.id,
      status: newGeneration!.status,
      result_url: newGeneration!.result_image || null,
      params: JSON.parse(newGeneration!.params),
      created_at: newGeneration!.created_at,
    });
  } catch (error) {
    console.error('Retry error:', error);
    res.status(500).json({ error: 'Failed to retry generation' });
  }
});

// Background processing function
async function processGeneration(id: number) {
  try {
    const generation = getGeneration(id);
    if (!generation) return;

    updateGeneration(id, { status: 'processing' });

    const params = JSON.parse(generation.params) as GenerationParams;

    // Get public URLs for the images (in production, use actual URLs)
    // For now, using file:// URLs (Replicate supports file uploads)
    const modelImageUrl = `file://${path.resolve(generation.model_image)}`;
    const garmentImageUrl = `file://${path.resolve(generation.garment_image)}`;
    const backgroundImageUrl = generation.background_image 
      ? `file://${path.resolve(generation.background_image)}` 
      : undefined;

    // Run VTON
    const { id: replicateId } = await runVTON({
      modelImageUrl,
      garmentImageUrl,
      backgroundImageUrl,
      backgroundPrompt: generation.background_prompt || undefined,
      params,
    });

    updateGeneration(id, { replicate_id: replicateId });

    // Poll for completion
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes with 5s intervals
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const prediction = await getPrediction(replicateId);
      
      if (prediction.status === 'succeeded' && prediction.output) {
        // Download result image
        await fs.mkdir('results', { recursive: true });
        const resultPath = `results/${id}-${Date.now()}.png`;
        
        const outputUrl = Array.isArray(prediction.output) 
          ? prediction.output[0] 
          : prediction.output;
        
        await downloadImage(outputUrl, resultPath);
        
        updateGeneration(id, { 
          status: 'completed',
          result_image: resultPath,
        });
        break;
      } else if (prediction.status === 'failed') {
        updateGeneration(id, { 
          status: 'failed',
          error: prediction.error?.toString() || 'Unknown error',
        });
        break;
      }
      
      attempts++;
    }
    
    if (attempts >= maxAttempts) {
      updateGeneration(id, { 
        status: 'failed',
        error: 'Timeout waiting for result',
      });
    }
  } catch (error) {
    console.error('Processing error:', error);
    updateGeneration(id, { 
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export default router;
