/**
 * Crops & Fields module — response shapes that extend the shared DTOs.
 * Dates cross the API boundary as ISO strings.
 */
import type { CropCycleDTO, FarmActivityDTO, FieldDTO } from "@/lib/farm";

/** GET /api/fields response — field with its active (planned/growing) crop cycles. */
export interface FieldWithCycles extends FieldDTO {
  cropCycles: {
    id: string;
    crop: string;
    variety: string | null;
    status: string;
    plantingDate: string | null;
    expectedHarvestDate: string | null;
  }[];
}

/** GET /api/crops response — crop cycle with its field. */
export interface CropCycleWithField extends CropCycleDTO {
  field?: { id: string; name: string } | null;
}

/** GET /api/activities response — activity with linked entity names. */
export interface FarmActivityWithNames extends FarmActivityDTO {
  cropCycle?: { id: string; crop: string; variety: string | null } | null;
  field?: { id: string; name: string } | null;
  animal?: { id: string; tagId: string; name: string | null } | null;
  group?: { id: string; name: string } | null;
}

/** POST /api/crops/[id]/harvest response. */
export interface HarvestResponse {
  crop: CropCycleWithField;
  transaction: { id: string; amount: number; category: string; description: string } | null;
}

/** Activity link context used by LogActivityDialog. */
export interface ActivityLinkContext {
  cropCycleId?: string | null;
  fieldId?: string | null;
  animalId?: string | null;
  groupId?: string | null;
}
