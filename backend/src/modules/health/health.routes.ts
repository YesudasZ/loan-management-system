import { Router } from 'express';
import { getHealth } from './health.controller.js';

// Unversioned on purpose: the prompt and Render's health check use the fixed path /health.
export const healthRouter = Router();

healthRouter.get('/health', getHealth);
