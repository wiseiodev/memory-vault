import { z } from 'zod';

export const listSpacesOutput = z.array(
  z.object({
    description: z.string().nullable(),
    id: z.string(),
    isDefault: z.boolean(),
    itemCount: z.number().int().nonnegative(),
    memoryCount: z.number().int().nonnegative(),
    name: z.string(),
  }),
);

export const getSpaceInput = z.object({
  spaceId: z.string().trim().min(1),
});

export const spaceDetail = z.object({
  createdAt: z.string(),
  description: z.string().nullable(),
  id: z.string(),
  isDefault: z.boolean(),
  itemCount: z.number().int().nonnegative(),
  memoryCount: z.number().int().nonnegative(),
  name: z.string(),
});

export type SpaceListItem = z.infer<typeof listSpacesOutput>[number];
export type SpaceDetail = z.infer<typeof spaceDetail>;
