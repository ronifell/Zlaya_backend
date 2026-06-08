import { Router } from 'express';
import { z } from 'zod';
import { processTurn } from '../services/zlayaPipeline.js';

const router = Router();

const chatSchema = z.object({
  conversationId: z.string().optional(),
  message: z.string().min(1, 'message is required').max(2000),
  babyProfile: z
    .object({
      babyName: z.string().optional(),
      motherName: z.string().optional(),
      ageDays: z.number().int().nonnegative().optional(),
      birthDate: z.string().optional(),
    })
    .optional(),
  conversation: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      }),
    )
    .max(20)
    .optional(),
});

router.post('/', async (req, res, next) => {
  try {
    const body = chatSchema.parse(req.body);
    const result = await processTurn(body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
