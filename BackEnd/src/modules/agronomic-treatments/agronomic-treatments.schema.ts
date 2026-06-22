import { z } from 'zod';

export const createTreatmentSchema = z.object({
  body: z.object({
    subBlockId: z.string().uuid().optional(),
    cropCycleId: z.string().uuid().optional(),
    treatmentType: z.enum(['fertilizer', 'pesticide', 'herbicide']),
    productName: z.string().min(1, 'Product name is required'),
    targetWaterLevelCm: z.number(),
    activeDurationHours: z.number().int().positive('Duration must be positive'),
    notes: z.string().optional(),
  }),
  params: z.object({
    fieldId: z.string().uuid(),
  }),
});
