import test from 'node:test';
import assert from 'node:assert/strict';
import { chatCompletionsUrl, hasInferenceConfig, readInferenceConfig } from '../src/lib/inference.ts';

test('base terminada en /v1 añade /chat/completions', () => {
  assert.equal(
    chatCompletionsUrl('https://api.openai.com/v1'),
    'https://api.openai.com/v1/chat/completions',
  );
});

test('base con barra final no duplica barras', () => {
  assert.equal(
    chatCompletionsUrl('https://host.example/v1///'),
    'https://host.example/v1/chat/completions',
  );
});

test('URL completa de chat/completions se respeta', () => {
  assert.equal(
    chatCompletionsUrl('https://host.example/v1/chat/completions'),
    'https://host.example/v1/chat/completions',
  );
});

test('configuración incompleta lista las variables que faltan', () => {
  const saved = {
    base: process.env.INFERENCE_BASE_URL,
    key: process.env.INFERENCE_API_KEY,
    model: process.env.INFERENCE_MODEL,
  };
  delete process.env.INFERENCE_BASE_URL;
  delete process.env.INFERENCE_API_KEY;
  process.env.INFERENCE_MODEL = 'm';
  try {
    const result = readInferenceConfig();
    assert.equal(result.ok, false);
    if (!result.ok) assert.deepEqual(result.missing, ['INFERENCE_BASE_URL', 'INFERENCE_API_KEY']);
    assert.equal(hasInferenceConfig(), false);
  } finally {
    if (saved.base !== undefined) process.env.INFERENCE_BASE_URL = saved.base;
    else delete process.env.INFERENCE_BASE_URL;
    if (saved.key !== undefined) process.env.INFERENCE_API_KEY = saved.key;
    else delete process.env.INFERENCE_API_KEY;
    if (saved.model !== undefined) process.env.INFERENCE_MODEL = saved.model;
    else delete process.env.INFERENCE_MODEL;
  }
});

test('configuración completa devuelve base/key/model', () => {
  const saved = {
    base: process.env.INFERENCE_BASE_URL,
    key: process.env.INFERENCE_API_KEY,
    model: process.env.INFERENCE_MODEL,
  };
  process.env.INFERENCE_BASE_URL = 'https://host.example/v1';
  process.env.INFERENCE_API_KEY = 'k';
  process.env.INFERENCE_MODEL = 'm';
  try {
    const result = readInferenceConfig();
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.config.baseUrl, 'https://host.example/v1');
      assert.equal(result.config.model, 'm');
    }
  } finally {
    if (saved.base !== undefined) process.env.INFERENCE_BASE_URL = saved.base;
    else delete process.env.INFERENCE_BASE_URL;
    if (saved.key !== undefined) process.env.INFERENCE_API_KEY = saved.key;
    else delete process.env.INFERENCE_API_KEY;
    if (saved.model !== undefined) process.env.INFERENCE_MODEL = saved.model;
    else delete process.env.INFERENCE_MODEL;
  }
});
