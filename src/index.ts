import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import generateRoutes from './routes/generate';
import historyRoutes from './routes/history';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/results', express.static(path.join(__dirname, '../results')));

// Routes
app.use('/api/generate', generateRoutes);
app.use('/api/history', historyRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`StyleRoom API running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
