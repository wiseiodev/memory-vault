import { z } from 'zod';

export const devicePlatformSchema = z.enum(['chrome_extension']);

export const deviceTokenListItemOutput = z.object({
  createdAt: z.string(),
  id: z.string(),
  label: z.string().nullable(),
  lastUsedAt: z.string().nullable(),
  platform: devicePlatformSchema,
  revokedAt: z.string().nullable(),
  spaceId: z.string(),
  tokenPrefix: z.string(),
});

export const listDeviceTokensOutput = z.array(deviceTokenListItemOutput);

export const revokeDeviceTokenInput = z.object({
  deviceTokenId: z.string().min(1, 'deviceTokenId is required.'),
});

export const revokeDeviceTokenOutput = z.object({
  revoked: z.literal(true),
});

export type DeviceTokenListItem = z.infer<typeof deviceTokenListItemOutput>;
