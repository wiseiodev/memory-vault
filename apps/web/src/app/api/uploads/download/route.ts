import { getApiSession } from '@/lib/server/auth/session';
import { getDownloadUrl, UploadFlowError } from '@/lib/server/uploads/service';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const session = await getApiSession(request.headers);

  if (!session) {
    return Response.json(
      {
        error: 'Authentication required.',
      },
      { status: 401 },
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const downloadUrl = await getDownloadUrl({
      sourceBlobId: searchParams.get('sourceBlobId') ?? '',
      userId: session.user.id,
    });

    return Response.redirect(downloadUrl, 307);
  } catch (error) {
    if (error instanceof UploadFlowError) {
      return Response.json(
        {
          error: error.message,
        },
        { status: error.statusCode },
      );
    }

    console.error('Download upload failed', error);

    return Response.json(
      {
        error: 'Unable to start download right now.',
      },
      { status: 500 },
    );
  }
}
