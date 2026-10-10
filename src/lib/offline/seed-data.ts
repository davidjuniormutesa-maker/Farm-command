/**
 * Farm Command — demo farm dataset generator (pure function, no database).
 *
 * Used by BOTH sides so offline seeding produces exactly the same demo farm
 * as the server seed route:
 *  - the client (offline facade) writes it into IndexedDB + the sync outbox;
 *  - the server /api/seed route writes it into Prisma/SQLite.
 *
 * Records carry client-generated ids and ISO date strings (the sync format).
 */

import { CURATED_ARTICLES } from "@/app/api/knowledge/seed-articles";
import { GENERAL_GUIDANCE_LINE } from "@/app/api/knowledge/seed-articles";
import { newId, nowIso, type SyncMeta } from "./db";
import type {
  GroupRow,
  AnimalRow,
  WeightRecordRow,
  HealthEventRow,
  VaccinationRow,
  FieldRow,
  CropRow,
  ActivityRow,
  TaskRow,
  TransactionRow,
  KnowledgeRow,
  RainfallRow,
} from "./db";

function d(offsetDays: number, base = new Date()): Date {
  const copy = new Date(base);
  copy.setHours(8, 0, 0, 0);
  copy.setDate(copy.getDate() + offsetDays);
  return copy;
}

function stamp<T>(body: Omit<T, keyof SyncMeta>): T {
  const now = nowIso();
  return { ...(body as object), createdAt: now, updatedAt: now } as T;
}

export interface SeedDataset {
  groups: GroupRow[];
  animals: AnimalRow[];
  weightRecords: WeightRecordRow[];
  healthEvents: HealthEventRow[];
  vaccinations: VaccinationRow[];
  tasks: TaskRow[];
  fields: FieldRow[];
  crops: CropRow[];
  activities: ActivityRow[];
  transactions: TransactionRow[];
  knowledge: KnowledgeRow[];
  rainfall: RainfallRow[];
}

/** Build the full demo dataset relative to "now" (base defaults to today). */
export function buildSeedDataset(base = new Date()): SeedDataset {
  const ts = (days: number) => d(days, base).toISOString();

  // ---- Groups ----
  const cattle = stamp<GroupRow>({
    id: newId(),
    name: "Main Cattle Herd", species: "Cattle", breed: "Local × Brahman", count: 18,
    location: "River paddock", acquisition: "Bred on-farm + purchases at Chisamba market",
    notes: "Main breeding herd. bulls rotated quarterly.", status: "active",
  });
  const goats = stamp<GroupRow>({
    id: newId(),
    name: "Village Goat Flock", species: "Goats", breed: "Small East African", count: 6,
    location: "Hill paddock", acquisition: "Local market", notes: "Hardy local breed, low input.", status: "active",
  });
  const poultry = stamp<GroupRow>({
    id: newId(),
    name: "Layer Flock", species: "Poultry", breed: "Black Rock", count: 32,
    location: "Poultry house", acquisition: "Hatched on-farm", notes: "Layers — collect eggs twice daily.", status: "active",
  });
  const pigs = stamp<GroupRow>({
    id: newId(),
    name: "Pig Pen A", species: "Pigs", breed: "Landrace cross", count: 2,
    location: "Pig sty", acquisition: "Purchased", notes: "Growing out for December sales.", status: "active",
  });
  const groups = [cattle, goats, poultry, pigs];

  // ---- Animals ----
  const cow1 = stamp<AnimalRow>({ id: newId(), tagId: "C-023", name: "Mama", species: "Cattle", breed: "Local × Brahman", sex: "female", birthDate: ts(-1600), acquisition: "Born on farm", location: "River paddock", weightKg: 420, targetWeightKg: 480, groupId: cattle.id, notes: "Best milker in the herd. Calm temperament.", status: "active" });
  const cow2 = stamp<AnimalRow>({ id: newId(), tagId: "C-024", name: "Nswana", species: "Cattle", breed: "Local × Brahman", sex: "female", birthDate: ts(-900), acquisition: "Born on farm", location: "River paddock", weightKg: 350, groupId: cattle.id, notes: "Pregnant — due around next rains.", status: "active" });
  const bull = stamp<AnimalRow>({ id: newId(), tagId: "C-031", name: "Bwana", species: "Cattle", breed: "Brahman", sex: "male", birthDate: ts(-1300), acquisition: "Purchased — Chisamba", location: "Bull camp", weightKg: 560, targetWeightKg: 650, groupId: cattle.id, status: "active" });
  const goat1 = stamp<AnimalRow>({ id: newId(), tagId: "G-014", name: "Chips", species: "Goats", sex: "female", birthDate: ts(-420), location: "Hill paddock", weightKg: 38, groupId: goats.id, status: "active" });
  const hen = stamp<AnimalRow>({ id: newId(), tagId: "P-007", name: "Bwalya", species: "Poultry", sex: "female", birthDate: ts(-200), location: "Poultry house", groupId: poultry.id, notes: "Good layer, ~5 eggs/week.", status: "active" });
  const hen2 = stamp<AnimalRow>({ id: newId(), tagId: "P-008", name: "Mulenga", species: "Poultry", sex: "female", birthDate: ts(-195), location: "Poultry house", groupId: poultry.id, status: "active" });
  const goat2 = stamp<AnimalRow>({ id: newId(), tagId: "G-015", species: "Goats", sex: "male", birthDate: ts(-300), location: "Hill paddock", weightKg: 45, groupId: goats.id, status: "active" });
  const animals = [cow1, cow2, bull, goat1, hen, hen2, goat2];

  // ---- Vaccinations (+ generated reminder tasks) ----
  const vac1 = stamp<VaccinationRow>({ id: newId(), animalId: cow1.id, vaccineName: "FMD (Foot & Mouth) booster", dateGiven: ts(-170), nextDueDate: ts(6), batchNumber: "FMD-ZM-2201", administeredBy: "Dr. Mwansa (vet)", notes: "No adverse reaction.", reminderTaskId: null });
  const vac2 = stamp<VaccinationRow>({ id: newId(), animalId: goat1.id, vaccineName: "PPR vaccine", dateGiven: ts(-120), nextDueDate: ts(-2), batchNumber: "PPR-114", administeredBy: "Self (with vet guidance)", reminderTaskId: null });
  const vac3 = stamp<VaccinationRow>({ id: newId(), animalId: hen.id, vaccineName: "Newcastle disease", dateGiven: ts(-60), nextDueDate: ts(14), batchNumber: "NCD-88", administeredBy: "Self", notes: "Follow-up booster for the layer flock.", reminderTaskId: null });
  const vac4 = stamp<VaccinationRow>({ id: newId(), animalId: cow2.id, vaccineName: "Blackquarter (Blackleg) vaccine", dateGiven: ts(-350), nextDueDate: ts(-20), batchNumber: "BQ-45", administeredBy: "Dr. Mwansa (vet)", reminderTaskId: null });

  const vacTaskBody = (vac: VaccinationRow, title: string): TaskRow =>
    stamp<TaskRow>({
      id: newId(),
      title,
      description: "Vaccination next-due reminder generated automatically from the vaccination record.",
      category: "health",
      dueDate: vac.nextDueDate!,
      priority: Date.parse(vac.nextDueDate!) < Date.now() ? "high" : "medium",
      repeatRule: "once",
      leadTimeDays: 3,
      animalId: vac.animalId,
      groupId: vac.groupId,
      vaccinationId: vac.id,
      status: "open",
    });

  const vacTask1 = vacTaskBody(vac1, "FMD booster due — C-023 Mama");
  const vacTask2 = vacTaskBody(vac2, "PPR vaccination OVERDUE — G-014 Chips");
  const vacTask3 = vacTaskBody(vac3, "Newcastle booster due — P-007 Bwalya");
  const vacTask4 = vacTaskBody(vac4, "Blackleg booster OVERDUE — C-024 Nswana");
  vac1.reminderTaskId = vacTask1.id;
  vac2.reminderTaskId = vacTask2.id;
  vac3.reminderTaskId = vacTask3.id;
  vac4.reminderTaskId = vacTask4.id;
  const vaccinations = [vac1, vac2, vac3, vac4];

  // ---- Health events ----
  const healthEvents: HealthEventRow[] = [
    stamp<HealthEventRow>({ id: newId(), animalId: cow1.id, type: "treatment", title: "Dewormed", date: ts(-40), administeredBy: "Self", medication: "Albendazole 10%", withdrawalDays: 14 }),
    stamp<HealthEventRow>({ id: newId(), animalId: cow2.id, type: "breeding", title: "Served by Bwana", date: ts(-150), details: "Natural mating · sire: Bwana (Bull camp)." }),
    stamp<HealthEventRow>({ id: newId(), animalId: cow2.id, type: "pregnancy", title: "Pregnancy confirmed", date: ts(-90), details: "Vet confirmed ~5 months pregnant." }),
    stamp<HealthEventRow>({ id: newId(), animalId: goat1.id, type: "breeding", title: "Served by community buck", date: ts(-320), details: "Natural mating." }),
    stamp<HealthEventRow>({ id: newId(), animalId: goat1.id, type: "birth", title: "Kidded — 2 healthy kids", date: ts(-170), details: "Twins, both standing and nursing within the hour." }),
    stamp<HealthEventRow>({ id: newId(), animalId: hen.id, type: "observation", title: "Health check — healthy", date: ts(-25), details: "Bright, alert, good comb colour. Eating well." }),
    stamp<HealthEventRow>({ id: newId(), animalId: goat1.id, type: "vet_visit", title: "Vet visit — hoof trimming", date: ts(-70), administeredBy: "Dr. Mwansa (vet)", details: "Minor overgrowth on rear hooves, trimmed." }),
    stamp<HealthEventRow>({ id: newId(), animalId: cow1.id, type: "note", title: "Weight recorded: 420 kg", date: ts(-30) }),
  ];

  // ---- Weight history ----
  const weightRecords: WeightRecordRow[] = [
    stamp<WeightRecordRow>({ id: newId(), animalId: cow1.id, weightKg: 390, recordedAt: ts(-255), note: "pre-calving" }),
    stamp<WeightRecordRow>({ id: newId(), animalId: cow1.id, weightKg: 398, recordedAt: ts(-220) }),
    stamp<WeightRecordRow>({ id: newId(), animalId: cow1.id, weightKg: 405, recordedAt: ts(-120) }),
    stamp<WeightRecordRow>({ id: newId(), animalId: cow1.id, weightKg: 420, recordedAt: ts(-30) }),
    stamp<WeightRecordRow>({ id: newId(), animalId: cow2.id, weightKg: 335, recordedAt: ts(-150) }),
    stamp<WeightRecordRow>({ id: newId(), animalId: cow2.id, weightKg: 350, recordedAt: ts(-45) }),
  ];

  // ---- Rain gauge ----
  const rainfall: RainfallRow[] = [
    stamp<RainfallRow>({ id: newId(), date: ts(-2), mm: 4.2, note: "Evening shower — first drops in weeks" }),
    stamp<RainfallRow>({ id: newId(), date: ts(-3), mm: 0, note: "Checked the gauge — dry" }),
    stamp<RainfallRow>({ id: newId(), date: ts(-5), mm: 1.8, note: "Light overnight drizzle" }),
    stamp<RainfallRow>({ id: newId(), date: ts(-11), mm: 0.6 }),
    stamp<RainfallRow>({ id: newId(), date: ts(-20), mm: 2.4, note: "Short thundershower" }),
  ];

  // ---- Fields ----
  const fieldA = stamp<FieldRow>({ id: newId(), name: "Big Field", areaHa: 2.0, location: "North of homestead", soilNotes: "Dark clay loam, retains moisture well", irrigation: "Rain-fed", notes: "Main maize field." });
  const fieldB = stamp<FieldRow>({ id: newId(), name: "Garden Plot", areaHa: 0.5, location: "Along the stream", soilNotes: "Sandy loam", irrigation: "Furrow irrigation from stream", notes: "Vegetables year-round." });
  const fieldC = stamp<FieldRow>({ id: newId(), name: "Soy Block", areaHa: 1.5, location: "East side near road", soilNotes: "Red sandy soil", irrigation: "Rain-fed" });
  const fields = [fieldA, fieldB, fieldC];

  // ---- Crop cycles ----
  const maize = stamp<CropRow>({ id: newId(), crop: "Maize", variety: "ZMS 602 (early maturity)", fieldId: fieldA.id, plantingDate: ts(-75), expectedHarvestDate: ts(65), seedDetails: "20 kg certified seed, planted at 75×25 cm", status: "growing", notes: "Top-dressed with urea at knee height." });
  const soy = stamp<CropRow>({ id: newId(), crop: "Soybeans", variety: "Santa Rosa", fieldId: fieldC.id, plantingDate: ts(-60), expectedHarvestDate: ts(50), status: "growing" });
  const tomatoes = stamp<CropRow>({ id: newId(), crop: "Vegetables", variety: "Tomatoes — Money Maker", fieldId: fieldB.id, plantingDate: ts(-30), expectedHarvestDate: ts(40), status: "growing", notes: "Staked and mulched." });
  const oldMaize = stamp<CropRow>({ id: newId(), crop: "Maize", variety: "Local variety", fieldId: fieldA.id, plantingDate: ts(-430), actualHarvestDate: ts(-250), harvestQuantity: 38, harvestUnit: "bags (50kg)", saleAmount: 32000, status: "harvested", notes: "Sold 30 bags at FRA, kept 8 for home use." });
  const crops = [maize, soy, tomatoes, oldMaize];

  // ---- Activities ----
  const activities: ActivityRow[] = [
    stamp<ActivityRow>({ id: newId(), type: "planting", title: "Planted maize — Big Field", date: ts(-75), details: "20 kg ZMS 602 seed", cropCycleId: maize.id, fieldId: fieldA.id, cost: 1250 }),
    stamp<ActivityRow>({ id: newId(), type: "fertilizer", title: "Basal dressing D — Big Field", date: ts(-70), details: "Compound D, 100 kg", cropCycleId: maize.id, fieldId: fieldA.id, cost: 2400 }),
    stamp<ActivityRow>({ id: newId(), type: "fertilizer", title: "Top dressing urea — Big Field", date: ts(-35), details: "50 kg urea", cropCycleId: maize.id, fieldId: fieldA.id, cost: 1450 }),
    stamp<ActivityRow>({ id: newId(), type: "weeding", title: "First weeding — Soy Block", date: ts(-40), cropCycleId: soy.id, fieldId: fieldC.id, cost: 600 }),
    stamp<ActivityRow>({ id: newId(), type: "scouting", title: "Fall armyworm check — Big Field", date: ts(-12), details: "Minor leaf damage on 2% of plants; no action needed yet.", cropCycleId: maize.id, fieldId: fieldA.id }),
    stamp<ActivityRow>({ id: newId(), type: "irrigation", title: "Watered tomato beds", date: ts(-3), cropCycleId: tomatoes.id, fieldId: fieldB.id }),
    stamp<ActivityRow>({ id: newId(), type: "feeding", title: "Layer feed delivered", date: ts(-5), details: "6 × 50 kg bags layers mash", groupId: poultry.id, cost: 2100 }),
    stamp<ActivityRow>({ id: newId(), type: "water", title: "Checked water troughs — River paddock", date: ts(-2), groupId: cattle.id }),
  ];

  // ---- Tasks ----
  const tasks: TaskRow[] = [
    vacTask1, vacTask2, vacTask3, vacTask4,
    stamp<TaskRow>({ id: newId(), title: "Feed livestock (cattle & goats)", description: "Morning feed: cattle supplement + goat browse check.", category: "livestock", dueDate: ts(0), dueTime: "08:00", priority: "high", repeatRule: "daily", leadTimeDays: 0, groupId: cattle.id, status: "open" }),
    stamp<TaskRow>({ id: newId(), title: "Check water tanks & troughs", description: "All paddocks — dry season, evaporation is high.", category: "livestock", dueDate: ts(0), dueTime: "10:00", priority: "high", repeatRule: "daily", leadTimeDays: 0, status: "open" }),
    stamp<TaskRow>({ id: newId(), title: "Scout maize for fall armyworm", description: "Check 5 random spots in Big Field, look for 'window pane' leaf damage.", category: "crop", dueDate: ts(0), dueTime: "15:00", priority: "medium", repeatRule: "weekly", leadTimeDays: 0, cropCycleId: maize.id, fieldId: fieldA.id, status: "open" }),
    stamp<TaskRow>({ id: newId(), title: "Collect & grade eggs", category: "livestock", dueDate: ts(0), dueTime: "07:00", priority: "medium", repeatRule: "daily", leadTimeDays: 0, groupId: poultry.id, status: "open" }),
    stamp<TaskRow>({ id: newId(), title: "Repair fence — Hill paddock", description: "Two loose posts after the wind storm; keep goats in.", category: "maintenance", dueDate: ts(-3), priority: "high", repeatRule: "once", leadTimeDays: 0, status: "open" }),
    stamp<TaskRow>({ id: newId(), title: "Buy layer feed (6 × 50 kg)", category: "finance", dueDate: ts(4), priority: "medium", repeatRule: "once", leadTimeDays: 0, groupId: poultry.id, notes: "Agro-dealer in town — cash price ~K 2,100.", status: "open" }),
    stamp<TaskRow>({ id: newId(), title: "Prepare seedbeds for cabbage transplanting", category: "crop", dueDate: ts(9), priority: "low", repeatRule: "once", leadTimeDays: 0, fieldId: fieldB.id, status: "open" }),
    stamp<TaskRow>({ id: newId(), title: "Pay helper wages", category: "finance", dueDate: ts(-1), priority: "high", repeatRule: "monthly", leadTimeDays: 0, notes: "Monthly wage — K 900.", status: "open" }),
  ];

  // ---- Finances ----
  const fin = [
    { type: "income", category: "Milk/Eggs/Produce", amount: 1850, days: -20, description: "Egg sales — roadside crate sales", method: "Cash" },
    { type: "income", category: "Milk/Eggs/Produce", amount: 2100, days: -8, description: "Egg sales — Kabwata market", method: "Cash" },
    { type: "income", category: "Crop sales", amount: 12500, days: -15, description: "Sold 10 × 50 kg bags maize to FRA", method: "Bank transfer" },
    { type: "expense", category: "Feed", amount: 2100, days: -5, description: "6 bags layers mash", method: "Cash" },
    { type: "expense", category: "Fertilizer", amount: 3850, days: -70, description: "Compound D 100 kg + urea 50 kg", method: "Cash" },
    { type: "expense", category: "Seed", amount: 1250, days: -76, description: "ZMS 602 maize seed 20 kg", method: "Cash" },
    { type: "expense", category: "Veterinary", amount: 650, days: -40, description: "Dewormer + vaccination service fee", method: "Cash" },
    { type: "expense", category: "Labour", amount: 900, days: -30, description: "Monthly helper wage", method: "Cash" },
    { type: "expense", category: "Fuel", amount: 800, days: -10, description: "Diesel for water pump", method: "Cash" },
    { type: "expense", category: "Transport", amount: 450, days: -15, description: "Maize delivery to FRA depot", method: "Cash" },
  ] as const;
  const transactions: TransactionRow[] = fin.map((f) =>
    stamp<TransactionRow>({ id: newId(), type: f.type, category: f.category, amount: f.amount, date: ts(f.days), description: f.description, paymentMethod: f.method })
  );

  // ---- Knowledge (curated Zambia-first articles) ----
  const knowledge: KnowledgeRow[] = CURATED_ARTICLES.map((a) =>
    stamp<KnowledgeRow>({
      id: newId(),
      title: a.title,
      topic: a.topic,
      source: a.source,
      sourceUrl: a.sourceUrl ?? null,
      publishedDate: a.publishedDate ?? null,
      retrievedDate: new Date().toISOString(),
      summary: a.summary,
      content: a.content.endsWith(GENERAL_GUIDANCE_LINE) || a.content.includes(GENERAL_GUIDANCE_LINE)
        ? a.content
        : `${a.content}\n\n${GENERAL_GUIDANCE_LINE}`,
    })
  );

  return { groups, animals, weightRecords, healthEvents, vaccinations, tasks, fields, crops, activities, transactions, knowledge, rainfall };
}
