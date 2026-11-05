import { describe, expect, it } from 'vitest';
import { frontFace } from './card-faces.js';

describe('frontFace', () => {
  it('names a multi-face card by its front face', () => {
    expect(frontFace('Spring // Autumn')).toBe('Spring');
  });

  it('names a single-faced card by its whole name', () => {
    expect(frontFace('Vex, the Quiet')).toBe('Vex, the Quiet');
  });

  it('leaves a name with a lone slash whole', () => {
    expect(frontFace('Who/What')).toBe('Who/What');
  });
});
