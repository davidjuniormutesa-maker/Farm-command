import { db } from "@/lib/db";

/** Wipe all farm data (settings preserved unless includeSettings). */
export async function resetFarmData(includeSettings = false) {
  await db.weightRecord.deleteMany();
  await db.rainfallLog.deleteMany();
  await db.farmMapItem.deleteMany();
  await db.healthEvent.deleteMany();
  await db.vaccination.deleteMany();
  await db.task.deleteMany();
  await db.farmActivity.deleteMany();
  await db.financeTransaction.deleteMany();
  await db.cropCycle.deleteMany();
  await db.field.deleteMany();
  await db.animal.deleteMany();
  await db.livestockGroup.deleteMany();
  await db.knowledgeArticle.deleteMany();
  await db.weatherSnapshot.deleteMany();
  if (includeSettings) await db.farmSetting.deleteMany();
}

function d(offsetDays: number): Date {
  const base = new Date();
  base.setHours(8, 0, 0, 0);
  base.setDate(base.getDate() + offsetDays);
  return base;
}

/** Load a realistic Zambian mixed-farm demo dataset. */
export async function seedFarmData() {
  await resetFarmData(false);

  // ---- Groups ----
  const cattle = await db.livestockGroup.create({
    data: {
      name: "Main Cattle Herd", species: "Cattle", breed: "Local × Brahman", count: 18,
      location: "River paddock", acquisition: "Bred on-farm + purchases at Chisamba market",
      notes: "Main breeding herd. bulls rotated quarterly.",
    },
  });
  const goats = await db.livestockGroup.create({
    data: {
      name: "Village Goat Flock", species: "Goats", breed: "Small East African", count: 6,
      location: "Hill paddock", acquisition: "Local market", notes: "Hardy local breed, low input.",
    },
  });
  const poultry = await db.livestockGroup.create({
    data: {
      name: "Layer Flock", species: "Poultry", breed: "Black Rock", count: 32,
      location: "Poultry house", acquisition: "Hatched on-farm", notes: "Layers — collect eggs twice daily.",
    },
  });
  const pigs = await db.livestockGroup.create({
    data: {
      name: "Pig Pen A", species: "Pigs", breed: "Landrace cross", count: 2,
      location: "Pig sty", acquisition: "Purchased", notes: "Growing out for December sales.",
    },
  });

  // ---- Animals ----
  const cow1 = await db.animal.create({
    data: { tagId: "C-023", name: "Mama", species: "Cattle", breed: "Local × Brahman", sex: "female", birthDate: d(-1600), acquisition: "Born on farm", location: "River paddock", weightKg: 420, targetWeightKg: 480, groupId: cattle.id, notes: "Best milker in the herd. Calm temperament." },
  });
  const cow2 = await db.animal.create({
    data: { tagId: "C-024", name: "Nswana", species: "Cattle", breed: "Local × Brahman", sex: "female", birthDate: d(-900), acquisition: "Born on farm", location: "River paddock", weightKg: 350, groupId: cattle.id, notes: "Pregnant — due around next rains." },
  });
  const bull = await db.animal.create({
    data: { tagId: "C-031", name: "Bwana", species: "Cattle", breed: "Brahman", sex: "male", birthDate: d(-1300), acquisition: "Purchased — Chisamba", location: "Bull camp", weightKg: 560, targetWeightKg: 650, groupId: cattle.id },
  });
  const goat1 = await db.animal.create({
    data: { tagId: "G-014", name: "Chips", species: "Goats", sex: "female", birthDate: d(-420), location: "Hill paddock", weightKg: 38, groupId: goats.id },
  });
  const hen = await db.animal.create({
    data: { tagId: "P-007", name: "Bwalya", species: "Poultry", sex: "female", birthDate: d(-200), location: "Poultry house", groupId: poultry.id, notes: "Good layer, ~5 eggs/week." },
  });
  await db.animal.create({ data: { tagId: "P-008", name: "Mulenga", species: "Poultry", sex: "female", birthDate: d(-195), location: "Poultry house", groupId: poultry.id } });
  await db.animal.create({ data: { tagId: "G-015", species: "Goats", sex: "male", birthDate: d(-300), location: "Hill paddock", weightKg: 45, groupId: goats.id } });

  // ---- Vaccinations (with next-due → reminders created below) ----
  const vac1 = await db.vaccination.create({
    data: { animalId: cow1.id, vaccineName: "FMD (Foot & Mouth) booster", dateGiven: d(-170), nextDueDate: d(6), batchNumber: "FMD-ZM-2201", administeredBy: "Dr. Mwansa (vet)", notes: "No adverse reaction." },
  });
  const vac2 = await db.vaccination.create({
    data: { animalId: goat1.id, vaccineName: "PPR vaccine", dateGiven: d(-120), nextDueDate: d(-2), batchNumber: "PPR-114", administeredBy: "Self (with vet guidance)" },
  });
  const vac3 = await db.vaccination.create({
    data: { animalId: hen.id, vaccineName: "Newcastle disease", dateGiven: d(-60), nextDueDate: d(14), batchNumber: "NCD-88", administeredBy: "Self", notes: "Follow-up booster for the layer flock." },
  });
  await db.vaccination.create({
    data: { animalId: cow2.id, vaccineName: "Blackquarter (Blackleg) vaccine", dateGiven: d(-350), nextDueDate: d(-20), batchNumber: "BQ-45", administeredBy: "Dr. Mwansa (vet)" },
  });
  {
    const overdueVac = await db.vaccination.findFirst({ where: { vaccineName: "Blackquarter (Blackleg) vaccine" } });
    if (overdueVac) {
      const t = await db.task.create({
        data: {
          title: "Blackleg booster OVERDUE — C-024 Nswana",
          description: "Vaccination next-due reminder generated automatically from the vaccination record.",
          category: "health", dueDate: d(-20), priority: "high",
          repeatRule: "once", animalId: cow2.id, vaccinationId: overdueVac.id, leadTimeDays: 3,
        },
      });
      await db.vaccination.update({ where: { id: overdueVac.id }, data: { reminderTaskId: t.id } });
    }
  }

  // Reminder tasks generated from vaccination next-due dates (same logic as the health API)
  const vacTasks = [
    { vac: vac1, due: d(6), title: "FMD booster due — C-023 Mama" },
    { vac: vac2, due: d(-2), title: "PPR vaccination OVERDUE — G-014 Chips" },
    { vac: vac3, due: d(14), title: "Newcastle booster due — P-007 Bwalya" },
  ];
  for (const t of vacTasks) {
    const task = await db.task.create({
      data: {
        title: t.title, description: `Vaccination next-due reminder generated automatically from the vaccination record.`,
        category: "health", dueDate: t.due, priority: t.due.getTime() < Date.now() ? "high" : "medium",
        repeatRule: "once", animalId: t.vac.animalId, vaccinationId: t.vac.id, leadTimeDays: 3,
      },
    });
    await db.vaccination.update({ where: { id: t.vac.id }, data: { reminderTaskId: task.id } });
  }

  // ---- Health events ----
  await db.healthEvent.create({ data: { animalId: cow1.id, type: "treatment", title: "Dewormed", date: d(-40), administeredBy: "Self", medication: "Albendazole 10%", withdrawalDays: 14 } });
  await db.healthEvent.create({ data: { animalId: cow2.id, type: "breeding", title: "Served by Bwana", date: d(-150), details: "Natural mating · sire: Bwana (Bull camp)." } });
  await db.healthEvent.create({ data: { animalId: cow2.id, type: "pregnancy", title: "Pregnancy confirmed", date: d(-90), details: "Vet confirmed ~5 months pregnant." } });
  // A completed breeding cycle for the goat — bred → birth 150 days later.
  await db.healthEvent.create({ data: { animalId: goat1.id, type: "breeding", title: "Served by community buck", date: d(-320), details: "Natural mating." } });
  await db.healthEvent.create({ data: { animalId: goat1.id, type: "birth", title: "Kidded — 2 healthy kids", date: d(-170), details: "Twins, both standing and nursing within the hour." } });
  await db.healthEvent.create({ data: { animalId: hen.id, type: "observation", title: "Health check — healthy", date: d(-25), details: "Bright, alert, good comb colour. Eating well." } });
  await db.healthEvent.create({ data: { animalId: goat1.id, type: "vet_visit", title: "Vet visit — hoof trimming", date: d(-70), administeredBy: "Dr. Mwansa (vet)", details: "Minor overgrowth on rear hooves, trimmed." } });
  await db.healthEvent.create({ data: { animalId: cow1.id, type: "weight", title: "Weight recorded: 420 kg", date: d(-30) } });
  // Weight history — a steady growth curve for the demo growth chart (oldest → newest)
  await db.weightRecord.create({ data: { animalId: cow1.id, weightKg: 390, recordedAt: d(-255), note: "pre-calving" } });
  await db.weightRecord.create({ data: { animalId: cow1.id, weightKg: 398, recordedAt: d(-220) } });
  await db.weightRecord.create({ data: { animalId: cow1.id, weightKg: 405, recordedAt: d(-120) } });
  await db.weightRecord.create({ data: { animalId: cow1.id, weightKg: 420, recordedAt: d(-30) } });
  await db.weightRecord.create({ data: { animalId: cow2.id, weightKg: 335, recordedAt: d(-150) } });
  await db.weightRecord.create({ data: { animalId: cow2.id, weightKg: 350, recordedAt: d(-45) } });

  // ---- Rain gauge (dry-season showers — Zambia's rains run Nov–Apr) ----
  await db.rainfallLog.create({ data: { date: d(-2), mm: 4.2, note: "Evening shower — first drops in weeks" } });
  await db.rainfallLog.create({ data: { date: d(-3), mm: 0, note: "Checked the gauge — dry" } });
  await db.rainfallLog.create({ data: { date: d(-5), mm: 1.8, note: "Light overnight drizzle" } });
  await db.rainfallLog.create({ data: { date: d(-11), mm: 0.6 } });
  await db.rainfallLog.create({ data: { date: d(-20), mm: 2.4, note: "Short thundershower" } });

  // ---- Fields ----
  const fieldA = await db.field.create({ data: { name: "Big Field", areaHa: 2.0, location: "North of homestead", soilNotes: "Dark clay loam, retains moisture well", irrigation: "Rain-fed", notes: "Main maize field." } });
  const fieldB = await db.field.create({ data: { name: "Garden Plot", areaHa: 0.5, location: "Along the stream", soilNotes: "Sandy loam", irrigation: "Furrow irrigation from stream", notes: "Vegetables year-round." } });
  const fieldC = await db.field.create({ data: { name: "Soy Block", areaHa: 1.5, location: "East side near road", soilNotes: "Red sandy soil", irrigation: "Rain-fed" } });

  // ---- Crop cycles ----
  const maize = await db.cropCycle.create({ data: { crop: "Maize", variety: "ZMS 602 (early maturity)", fieldId: fieldA.id, plantingDate: d(-75), expectedHarvestDate: d(65), seedDetails: "20 kg certified seed, planted at 75×25 cm", status: "growing", notes: "Top-dressed with urea at knee height." } });
  const soy = await db.cropCycle.create({ data: { crop: "Soybeans", variety: "Santa Rosa", fieldId: fieldC.id, plantingDate: d(-60), expectedHarvestDate: d(50), status: "growing" } });
  const tomatoes = await db.cropCycle.create({ data: { crop: "Vegetables", variety: "Tomatoes — Money Maker", fieldId: fieldB.id, plantingDate: d(-30), expectedHarvestDate: d(40), status: "growing", notes: "Staked and mulched." } });
  await db.cropCycle.create({ data: { crop: "Maize", variety: "Local variety", fieldId: fieldA.id, plantingDate: d(-430), actualHarvestDate: d(-250), harvestQuantity: 38, harvestUnit: "bags (50kg)", saleAmount: 32000, status: "harvested", notes: "Sold 30 bags at FRA, kept 8 for home use." } });

  // ---- Activities ----
  await db.farmActivity.create({ data: { type: "planting", title: "Planted maize — Big Field", date: d(-75), details: "20 kg ZMS 602 seed", cropCycleId: maize.id, fieldId: fieldA.id, cost: 1250 } });
  await db.farmActivity.create({ data: { type: "fertilizer", title: "Basal dressing D — Big Field", date: d(-70), details: "Compound D, 100 kg", cropCycleId: maize.id, fieldId: fieldA.id, cost: 2400 } });
  await db.farmActivity.create({ data: { type: "fertilizer", title: "Top dressing urea — Big Field", date: d(-35), details: "50 kg urea", cropCycleId: maize.id, fieldId: fieldA.id, cost: 1450 } });
  await db.farmActivity.create({ data: { type: "weeding", title: "First weeding — Soy Block", date: d(-40), cropCycleId: soy.id, fieldId: fieldC.id, cost: 600 } });
  await db.farmActivity.create({ data: { type: "scouting", title: "Fall armyworm check — Big Field", date: d(-12), details: "Minor leaf damage on 2% of plants; no action needed yet.", cropCycleId: maize.id, fieldId: fieldA.id } });
  await db.farmActivity.create({ data: { type: "irrigation", title: "Watered tomato beds", date: d(-3), cropCycleId: tomatoes.id, fieldId: fieldB.id } });
  await db.farmActivity.create({ data: { type: "feeding", title: "Layer feed delivered", date: d(-5), details: "6 × 50 kg bags layers mash", groupId: poultry.id, cost: 2100 } });
  await db.farmActivity.create({ data: { type: "water", title: "Checked water troughs — River paddock", date: d(-2), groupId: cattle.id } });

  // ---- Tasks ----
  await db.task.create({ data: { title: "Feed livestock (cattle & goats)", description: "Morning feed: cattle supplement + goat browse check.", category: "livestock", dueDate: d(0), dueTime: "08:00", priority: "high", repeatRule: "daily", groupId: cattle.id } });
  await db.task.create({ data: { title: "Check water tanks & troughs", description: "All paddocks — dry season, evaporation is high.", category: "livestock", dueDate: d(0), dueTime: "10:00", priority: "high", repeatRule: "daily" } });
  await db.task.create({ data: { title: "Scout maize for fall armyworm", description: "Check 5 random spots in Big Field, look for 'window pane' leaf damage.", category: "crop", dueDate: d(0), dueTime: "15:00", priority: "medium", repeatRule: "weekly", cropCycleId: maize.id, fieldId: fieldA.id } });
  await db.task.create({ data: { title: "Collect & grade eggs", category: "livestock", dueDate: d(0), dueTime: "07:00", priority: "medium", repeatRule: "daily", groupId: poultry.id } });
  await db.task.create({ data: { title: "Repair fence — Hill paddock", description: "Two loose posts after the wind storm; keep goats in.", category: "maintenance", dueDate: d(-3), priority: "high" } });
  await db.task.create({ data: { title: "Buy layer feed (6 × 50 kg)", category: "finance", dueDate: d(4), priority: "medium", groupId: poultry.id, notes: "Agro-dealer in town — cash price ~K 2,100." } });
  await db.task.create({ data: { title: "Prepare seedbeds for cabbage transplanting", category: "crop", dueDate: d(9), priority: "low", fieldId: fieldB.id } });
  await db.task.create({ data: { title: "Pay helper wages", category: "finance", dueDate: d(-1), priority: "high", repeatRule: "monthly", notes: "Monthly wage — K 900." } });

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
  for (const f of fin) {
    await db.financeTransaction.create({
      data: { type: f.type, category: f.category, amount: f.amount, date: d(f.days), description: f.description, paymentMethod: f.method },
    });
  }
}

export const SEED_VERSION = "fc-demo-2";
