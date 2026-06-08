import OpenAI from 'openai';
import { config, useOpenAI } from '../config/index.js';

let _client = null;

export function getOpenAI() {
  if (!useOpenAI) return null;
  if (_client) return _client;
  _client = new OpenAI({ apiKey: config.openai.apiKey });
  return _client;
}
