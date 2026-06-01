// src/embedding_service.js
import { env } from 'process';
import { pipeline } from '@xenova/transformers'; // lightweight transformer library for Node

// Choose model based on config or env var EMBED_MODEL (bge-large or bge-small)
const DEFAULT_MODEL = 'BAAI/bge-large-en';
const MODEL_MAP = {
  'bge-large': 'BAAI/bge-large-en',
  'bge-small': 'BAAI/bge-small-en-v1.5'
};

let embedPipeline = null;

export async function initEmbedding() {
  const modelKey = env.EMBED_MODEL || 'bge-large';
  const modelName = MODEL_MAP[modelKey] || DEFAULT_MODEL;
  console.log(`[Embedding] Loading model ${modelName}...`);
  embedPipeline = await pipeline('feature-extraction', modelName, {
    // Use cpu; no GPU in this environment
    quantized: true,
    // Reduce memory overhead
    device: 'cpu'
  });
  console.log('[Embedding] Model loaded.');
}

export async function getEmbedding(text) {
  if (!embedPipeline) {
    await initEmbedding();
  }
  // The BGE models expect a single string; they return a Float32Array
  const embeddings = await embedPipeline(text);
  // embeddings is a 2‑D array [[...]]; flatten to 1‑D
  const flat = embeddings[0];
  return Array.from(flat);
}
