import { describe, expect, it } from 'vitest';
import { ENGINE_NAME } from './index.js';

describe('engine', () => {
  it('is importable', () => {
    expect(ENGINE_NAME).toBe('swantisserie-engine');
  });
});
