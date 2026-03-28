export function buildSourceBlobObjectKey(input: {
  filename: string;
  sourceBlobId: string;
  sourceItemId: string;
  spaceId: string;
}) {
  const safeFilename = sanitizeFilename(input.filename);

  return `spaces/${input.spaceId}/sources/${input.sourceItemId}/blobs/${input.sourceBlobId}/${safeFilename}`;
}

function sanitizeFilename(filename: string) {
  const basename =
    filename
      .trim()
      .split(/[\\/]+/u)
      .pop() ?? '';
  const sanitized = basename
    .normalize('NFKC')
    .replace(/[^A-Za-z0-9._-]+/gu, '-')
    .replace(/-+/gu, '-')
    .replace(/^\.+/u, '')
    .replace(/^[-_.]+|[-_.]+$/gu, '');

  return sanitized || 'upload';
}
