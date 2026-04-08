import { redirect } from 'next/navigation';

import { createDownloadUrl } from '@/features/uploads';
import { requireSession } from '@/lib/server/auth/session';
import {
  getExtensionReleaseFilename,
  getExtensionReleaseObjectKey,
} from '@/lib/server/extensions/release';

export const runtime = 'nodejs';

export async function GET() {
  await requireSession();

  const downloadUrl = await createDownloadUrl({
    contentType: 'application/zip',
    filename: getExtensionReleaseFilename(),
    objectKey: getExtensionReleaseObjectKey(),
  });

  redirect(downloadUrl);
}
