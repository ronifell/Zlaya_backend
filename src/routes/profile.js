import { Router } from 'express';
import { listBands, resolveAge } from '../services/ageService.js';
import { config } from '../config/index.js';

const router = Router();

router.get('/bands', (_req, res) => {
  res.json({
    bands: listBands(),
    activeNamespaces: config.activeNamespaces,
  });
});

router.post('/resolve', (req, res) => {
  const age = resolveAge(req.body || {});
  res.json({
    ageDays: age.days,
    band: age.band,
    isActiveInPilot: age.band ? config.activeNamespaces.includes(age.band.id) : false,
  });
});

export default router;
