import Database from 'better-sqlite3';
import path from 'path';

const db = new Database(path.join(__dirname, '../../styleroom.db'));

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS generations (
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
  )
`);

export interface Generation {
  id: number;
  model_image: string;
  garment_image: string;
  background_image?: string;
  background_prompt?: string;
  result_image?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  replicate_id?: string;
  params: string;
  error?: string;
  created_at: string;
}

export interface GenerationParams {
  steps: number;
  guidance_scale: number;
  seed?: number;
}

export const createGeneration = (data: {
  model_image: string;
  garment_image: string;
  background_image?: string;
  background_prompt?: string;
  params: GenerationParams;
}): number => {
  const stmt = db.prepare(`
    INSERT INTO generations (model_image, garment_image, background_image, background_prompt, params)
    VALUES (?, ?, ?, ?, ?)
  `);
  
  const result = stmt.run(
    data.model_image,
    data.garment_image,
    data.background_image || null,
    data.background_prompt || null,
    JSON.stringify(data.params)
  );
  
  return result.lastInsertRowid as number;
};

export const updateGeneration = (id: number, data: {
  status?: string;
  result_image?: string;
  replicate_id?: string;
  error?: string;
}) => {
  const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
  const values = Object.values(data);
  
  const stmt = db.prepare(`UPDATE generations SET ${fields} WHERE id = ?`);
  stmt.run(...values, id);
};

export const getGeneration = (id: number): Generation | undefined => {
  const stmt = db.prepare('SELECT * FROM generations WHERE id = ?');
  return stmt.get(id) as Generation | undefined;
};

export const getHistory = (page: number = 1, limit: number = 20): { items: Generation[], total: number } => {
  const offset = (page - 1) * limit;
  
  const stmt = db.prepare('SELECT * FROM generations ORDER BY created_at DESC LIMIT ? OFFSET ?');
  const items = stmt.all(limit, offset) as Generation[];
  
  const countStmt = db.prepare('SELECT COUNT(*) as count FROM generations');
  const { count } = countStmt.get() as { count: number };
  
  return { items, total: count };
};

export const deleteGeneration = (id: number) => {
  const stmt = db.prepare('DELETE FROM generations WHERE id = ?');
  stmt.run(id);
};

export default db;
