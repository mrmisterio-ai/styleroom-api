import Replicate from 'replicate';
import { GenerationParams } from '../db';

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN || '',
});

// Using IDM-VTON as it's more reliably available
const MODEL_VERSION = 'cuuupid/idm-vton:c871bb9b046607b680449ecbae55fd8c6d945e0a1948644bf2361b3d021d3ff4';

export interface VTONInput {
  modelImageUrl: string;
  garmentImageUrl: string;
  backgroundImageUrl?: string;
  backgroundPrompt?: string;
  params: GenerationParams;
}

export const runVTON = async (input: VTONInput): Promise<{ id: string; output?: string }> => {
  try {
    const replicateInput: any = {
      garm_img: input.garmentImageUrl,
      human_img: input.modelImageUrl,
      garment_des: input.backgroundPrompt || 'A garment',
      is_checked: true,
      is_checked_crop: false,
      denoise_steps: input.params.steps,
      seed: input.params.seed || 42,
    };

    const prediction = await replicate.predictions.create({
      version: MODEL_VERSION.split(':')[1],
      input: replicateInput,
    });

    return {
      id: prediction.id,
      output: prediction.output as string | undefined,
    };
  } catch (error) {
    console.error('Replicate API error:', error);
    throw error;
  }
};

export const getPrediction = async (id: string) => {
  try {
    const prediction = await replicate.predictions.get(id);
    return {
      status: prediction.status,
      output: prediction.output,
      error: prediction.error,
    };
  } catch (error) {
    console.error('Replicate get prediction error:', error);
    throw error;
  }
};

export const downloadImage = async (url: string, outputPath: string): Promise<void> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download image: ${response.statusText}`);
  
  const fs = await import('fs/promises');
  const buffer = await response.arrayBuffer();
  await fs.writeFile(outputPath, Buffer.from(buffer));
};
