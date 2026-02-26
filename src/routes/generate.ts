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
import { preprocessModelImage } from '../services/preprocess';

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
    const personDescription = req.body.person_description; // 새 필드

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

    // 전처리된 이미지 경로를 전달하기 위해 추가 데이터 저장
    // (간단하게 하기 위해 background_prompt에 person_description 추가)
    if (personDescription) {
      updateGeneration(generationId, { 
        background_prompt: backgroundPrompt 
          ? `${backgroundPrompt} [person: ${personDescription}]`
          : `[person: ${personDescription}]`
      });
    }

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

    // Convert images to data URIs for Replicate API
    const toDataUri = async (filePath: string): Promise<string> => {
      const data = await fs.readFile(path.resolve(filePath));
      const ext = path.extname(filePath).toLowerCase().replace('.', '');
      const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
      return `data:${mime};base64,${data.toString('base64')}`;
    };

    // person_description 추출 (background_prompt에서 파싱)
    let personDescription: string | undefined;
    let cleanBackgroundPrompt = generation.background_prompt;
    
    if (generation.background_prompt) {
      const match = generation.background_prompt.match(/\[person:\s*([^\]]+)\]/);
      if (match) {
        personDescription = match[1];
        cleanBackgroundPrompt = generation.background_prompt.replace(/\[person:\s*[^\]]+\]/, '').trim();
      }
    }

    // 전처리: 모델 이미지에서 사람 감지 및 크롭
    let processedModelImage: string;
    try {
      processedModelImage = await preprocessModelImage(generation.model_image, personDescription);
      console.log(`Preprocessed model image: ${processedModelImage}`);
    } catch (error) {
      // 전처리 실패 시 사용자 친화적 에러 메시지
      const errorMsg = error instanceof Error ? error.message : '이미지 전처리에 실패했습니다.';
      updateGeneration(id, { 
        status: 'failed',
        error: errorMsg,
      });
      return;
    }

    const modelImageUrl = await toDataUri(processedModelImage);
    const garmentImageUrl = await toDataUri(generation.garment_image);
    const backgroundImageUrl = generation.background_image 
      ? await toDataUri(generation.background_image) 
      : undefined;

    // Run VTON (cleanBackgroundPrompt 사용)
    const { id: replicateId } = await runVTON({
      modelImageUrl,
      garmentImageUrl,
      backgroundImageUrl,
      backgroundPrompt: cleanBackgroundPrompt || undefined,
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
        const errMsg = prediction.error?.toString() || 'Unknown error';
        let userMsg = errMsg;
        if (errMsg.includes('list index out of range')) {
          userMsg = '모델 사진에서 사람을 감지하지 못했습니다. 한 명의 사람이 잘 보이는 상반신/전신 사진을 사용해주세요.';
        }
        updateGeneration(id, { 
          status: 'failed',
          error: userMsg,
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
