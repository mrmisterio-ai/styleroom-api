import { Router, Request, Response } from 'express';
import { getHistory, deleteGeneration, getGeneration } from '../db';
import fs from 'fs/promises';

const router = Router();

// GET /api/history - Get generation history
router.get('/', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const { items, total } = getHistory(page, limit);

    const formattedItems = items.map(item => ({
      id: item.id,
      status: item.status,
      result_url: item.result_image || null,
      params: JSON.parse(item.params),
      created_at: item.created_at,
      error: item.error,
    }));

    res.json({
      items: formattedItems,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('History error:', error);
    res.status(500).json({ error: 'Failed to get history' });
  }
});

// DELETE /api/history/:id - Delete generation
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const generation = getGeneration(id);

    if (!generation) {
      return res.status(404).json({ error: 'Generation not found' });
    }

    // Delete associated files
    const filesToDelete = [
      generation.model_image,
      generation.garment_image,
      generation.background_image,
      generation.result_image,
    ].filter(Boolean) as string[];

    await Promise.all(
      filesToDelete.map(file => 
        fs.unlink(file).catch(err => console.error(`Failed to delete ${file}:`, err))
      )
    );

    // Delete from DB
    deleteGeneration(id);

    res.json({ success: true });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Failed to delete generation' });
  }
});

export default router;
