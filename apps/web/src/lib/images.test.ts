import { describe, expect, it } from 'vitest';
import { photoTarget } from './images';

describe('photo resizing before upload', () => {
  it('shrinks big photos to a 2000px long edge, keeping the aspect ratio', () => {
    expect(photoTarget('image/jpeg', 4032, 3024)).toEqual({ width: 2000, height: 1500 });
    expect(photoTarget('image/jpeg', 3024, 4032)).toEqual({ width: 1500, height: 2000 });
  });

  it('leaves small photos and non-photos alone', () => {
    expect(photoTarget('image/jpeg', 2000, 1200)).toBeNull();
    expect(photoTarget('image/png', 5000, 3000)).toBeNull();
    expect(photoTarget('image/gif', 4000, 4000)).toBeNull();
    expect(photoTarget('application/pdf', 4000, 4000)).toBeNull();
  });

  it('converts HEIC to JPEG even when small, since only Safari shows it', () => {
    expect(photoTarget('image/heic', 1200, 900)).toEqual({ width: 1200, height: 900 });
    expect(photoTarget('image/heif', 4032, 3024)).toEqual({ width: 2000, height: 1500 });
  });
});
