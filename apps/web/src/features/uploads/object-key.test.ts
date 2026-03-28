import { describe, expect, it } from 'vitest';

import { buildSourceBlobObjectKey } from './object-key';

describe('buildSourceBlobObjectKey', () => {
  it('builds the stable object-key layout for a source blob upload', () => {
    expect(
      buildSourceBlobObjectKey({
        filename: 'Quarterly Notes.pdf',
        sourceBlobId: 'blob_01HQXYZ',
        sourceItemId: 'src_01HQXYZ',
        spaceId: 'spc_01HQXYZ',
      }),
    ).toBe(
      'spaces/spc_01HQXYZ/sources/src_01HQXYZ/blobs/blob_01HQXYZ/Quarterly-Notes.pdf',
    );
  });

  it('sanitizes path separators and unsupported characters', () => {
    expect(
      buildSourceBlobObjectKey({
        filename: '../bad /// file (final).txt',
        sourceBlobId: 'blob_01HQXYZ',
        sourceItemId: 'src_01HQXYZ',
        spaceId: 'spc_01HQXYZ',
      }),
    ).toBe(
      'spaces/spc_01HQXYZ/sources/src_01HQXYZ/blobs/blob_01HQXYZ/file-final-.txt',
    );
  });

  it('falls back to a generic filename when nothing safe remains', () => {
    expect(
      buildSourceBlobObjectKey({
        filename: '////',
        sourceBlobId: 'blob_01HQXYZ',
        sourceItemId: 'src_01HQXYZ',
        spaceId: 'spc_01HQXYZ',
      }),
    ).toBe('spaces/spc_01HQXYZ/sources/src_01HQXYZ/blobs/blob_01HQXYZ/upload');
  });
});
