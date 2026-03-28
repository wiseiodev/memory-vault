import { getApiSession } from '@/lib/server/auth/session';
import { reserveUpload, UploadFlowError } from '@/lib/server/uploads/service';

export const runtime = 'nodejs';

export async function POST(request: Request) {
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
    const body = await request.json();
    const reservedUpload = await reserveUpload({
      byteSize: body.byteSize,
      contentType: body.contentType,
      filename: body.filename,
      spaceId: body.spaceId,
      userId: session.user.id,
    });

    return Response.json(reservedUpload);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json(
        {
          error: 'Request body must be valid JSON.',
        },
        { status: 400 },
      );
    }

    if (error instanceof UploadFlowError) {
      return Response.json(
        {
          error: error.message,
        },
        { status: error.statusCode },
      );
    }

    console.error('Reserve upload failed', error);

    return Response.json(
      {
        error: 'Unable to reserve upload right now.',
      },
      { status: 500 },
    );
  }
}
