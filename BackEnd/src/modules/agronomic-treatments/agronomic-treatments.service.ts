import { db } from '@/db/client';
import { agronomicTreatments } from '@/db/schema';
import { eq, and, gt } from 'drizzle-orm';
import { AppError } from '@/middleware/error.middleware';
import { runDecisionCycleForField } from '@/modules/decision-engine/engine-client.service';

export class AgronomicTreatmentsService {
  /**
   * Create a new agronomic treatment that will act as a DSS override.
   */
  async createTreatment(
    fieldId: string,
    data: {
      subBlockId?: string | null;
      cropCycleId?: string | null;
      treatmentType: string;
      productName: string;
      targetWaterLevelCm: number;
      activeDurationHours: number;
      notes?: string | null;
    },
    userId?: string
  ) {
    const overrideExpiresAt = new Date(Date.now() + data.activeDurationHours * 60 * 60 * 1000);

    const [treatment] = await db
      .insert(agronomicTreatments)
      .values({
        fieldId,
        subBlockId: data.subBlockId || null,
        cropCycleId: data.cropCycleId || null,
        treatmentType: data.treatmentType,
        productName: data.productName,
        targetWaterLevelCm: data.targetWaterLevelCm.toString(),
        activeDurationHours: data.activeDurationHours,
        overrideExpiresAt,
        reportedBy: userId || null,
        notes: data.notes || null,
      })
      .returning();

    // Trigger immediate AI re-evaluation so UI recommendations update instantly
    await runDecisionCycleForField(fieldId, 'normal').catch(err => {
      console.error('Failed to trigger real-time decision cycle on treatment creation:', err);
    });

    return treatment;
  }

  /**
   * Get active treatments for a field.
   */
  async getActiveTreatments(fieldId: string) {
    const now = new Date();
    return db
      .select()
      .from(agronomicTreatments)
      .where(
        and(
          eq(agronomicTreatments.fieldId, fieldId),
          gt(agronomicTreatments.overrideExpiresAt, now)
        )
      );
  }
}

export const agronomicTreatmentsService = new AgronomicTreatmentsService();
