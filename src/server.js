import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { config } from './config/index.js';
import chatRouter from './routes/chat.js';
import auditRouter from './routes/audit.js';
import profileRouter from './routes/profile.js';
import healthRouter from './routes/health.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(express.json({ limit: '256kb' }));
app.use(morgan(config.env === 'production' ? 'combined' : 'dev'));

app.use('/api/health', healthRouter);
app.use('/api/chat', chatRouter);
app.use('/api/audit', auditRouter);
app.use('/api/profile', profileRouter);

app.use((req, res) => {
  res.status(404).json({ error: 'not_found', path: req.path });
});

app.use(errorHandler);

const server = app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[zlaya] listening on http://localhost:${config.port}`);
  // eslint-disable-next-line no-console
  console.log(`[zlaya] active namespaces: ${config.activeNamespaces.join(', ')}`);
  // eslint-disable-next-line no-console
  console.log(`[zlaya] LLM provider: ${config.openai.apiKey ? 'openai' : 'local-fallback'}`);
});

function shutdown(signal) {
  // eslint-disable-next-line no-console
  console.log(`[zlaya] received ${signal}, shutting down`);
  server.close(() => process.exit(0));
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
