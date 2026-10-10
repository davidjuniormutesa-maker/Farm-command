/**
 * Farm Command — curated Knowledge Hub reference articles (Task 3-b).
 *
 * These are seeded automatically the first time GET /api/knowledge runs against
 * an empty KnowledgeArticle table, so the Knowledge Hub is useful on day one.
 *
 * Sourcing policy:
 * - Zambia-first institutions (Ministry of Agriculture, ZARI, CFU, ZNFU…).
 * - Only well-known, stable topics. Content is short, educational and conservative.
 * - No invented statistics. Where numbers matter (seed rates, dosages, chemical
 *   use), the reader is pointed to their local extension officer / veterinarian.
 * - sourceUrl is only set for domains we are confident are the official portal
 *   (agriculture.gov.zm for the Zambia Ministry of Agriculture). Otherwise the
 *   institution is named without a URL.
 * - Every article ends with the GENERAL_GUIDANCE_LINE marker so the UI can show
 *   a "confirm locally" notice banner.
 */

export const GENERAL_GUIDANCE_LINE =
  "General guidance — confirm with your local agricultural extension officer.";

export const KNOWLEDGE_TOPICS = ["Crops", "Livestock", "Water", "Climate", "Business"] as const;
export type KnowledgeTopic = (typeof KNOWLEDGE_TOPICS)[number];

export interface CuratedArticle {
  title: string;
  topic: KnowledgeTopic;
  source: string;
  sourceUrl?: string;
  publishedDate?: string;
  summary: string;
  content: string;
}

function guidance(suffix?: string): string {
  return suffix ? `General guidance — confirm with your local ${suffix}.` : GENERAL_GUIDANCE_LINE;
}

export const CURATED_ARTICLES: CuratedArticle[] = [
  {
    title: "Maize production basics",
    topic: "Crops",
    source: "Zambia Ministry of Agriculture — E-Extension",
    sourceUrl: "https://www.agriculture.gov.zm",
    summary:
      "The essential cycle of a maize crop in Zambia: land preparation, planting with the first effective rains, timely weeding, and harvesting and storage that protects the grain.",
    content: `Maize is Zambia's staple crop, and most smallholder farms grow at least a field of it each rainy season. A good maize crop starts before the rains: clear and prepare the land early, decide where seed and fertiliser (or manure) will come from, and plan how you will weed while the crop is still young.

Plant when the first effective rains have settled the soil — usually from around November depending on your agro-ecological region. Extension officers recommend planting stations spaced evenly, with the seed depth kept uniform so plants emerge together. Where you use fertiliser, follow the recommendation given for your area rather than guessing, and place it where the roots will reach it without burning the seed.

Weed early. Maize loses yield to weeds most quickly in its first weeks, so an early, clean weeding does more for the harvest than any later effort. As the crop matures, watch for pests such as fall armyworm in the whorls and act early — scouting once or twice a week is usually enough to catch problems while they are small.

At harvest, dry the cobs properly before shelling, and store the grain off the ground in a dry, well-ventilated place or treated store. Poor storage causes more losses than many field problems. Ask your local extension officer about the varieties and fertiliser recommendations suited to your district, and about safe storage treatment for your area.

${guidance()}`,
  },
  {
    title: "Conservation farming & planting basins",
    topic: "Crops",
    source: "Zambia Conservation Farming Unit (CFU)",
    summary:
      "Minimum tillage, planting basins, mulch and rotation — the conservation farming practices widely promoted in Zambia to protect soil moisture and raise yields over time.",
    content: `Conservation farming is practised across Zambia through three linked principles: disturbing the soil as little as possible, keeping the soil covered, and rotating crops. On smallholder fields this is most visible as permanent planting basins or ripping lines opened in the dry season, rather than digging the whole field every year.

Basins are dug at a fixed spacing before the rains begin, so planting can start immediately with the first effective rain. Because each basin concentrates water, manure and seed in one spot, plants establish strongly even in a slow start to the season. Digging basins in the dry season also spreads labour — a little work each week instead of everything in a rush at planting time.

Keep the soil covered. Leftover crop stalks and other residues left on the surface protect the soil from sun and raindrop impact, feed soil life, and hold moisture through dry spells. A covered, untilled soil builds structure over the years, which is why conservation farming fields often cope better in drought seasons than ploughed fields.

Rotation completes the system: following maize with a legume such as groundnuts or soybeans feeds the soil and breaks pest and disease cycles. Basins are re-used in the same positions each year, so the work of season one is not repeated. Your local extension officer or the Conservation Farming Unit can show you the basin spacing and mulching practice recommended for your district.

${guidance("agricultural extension officer")}`,
  },
  {
    title: "Fall armyworm: monitoring and early action",
    topic: "Crops",
    source: "Zambia Agriculture Research Institute (ZARI)",
    summary:
      "How to recognise fall armyworm damage in maize whorls, scout the field regularly, and choose control steps early — with care for safe and approved products.",
    content: `Fall armyworm is a caterpillar pest that arrived in Zambia in the 2016/17 season and has stayed. The moth lays egg masses on maize leaves, and the young larvae move into the plant whorl where they feed on the young leaves. The classic signs are ragged, window-like holes in the whorl leaves and a heap of moist, sawdust-like droppings (frass) inside the whorl.

Scouting is the heart of control. Walk your maize field at least once or twice a week from emergence onwards, looking into the whorls of plants across the whole field, not only the edges. Record roughly how many plants out of every hundred show fresh damage. Catching the first waves of larvae while they are small is far more effective than waiting until damage is obvious everywhere.

Control options combine several approaches. Hand-picking and crushing egg masses and larvae in lightly affected fields, encouraging natural enemies by keeping field margins diverse, timely planting, and — where damage crosses the action threshold for your area — a registered control product applied correctly and in cool, calm conditions. Always read and follow the product label in full, and use only products approved for use in Zambia.

If damage is spreading despite your efforts, take photos and notes and speak to your local extension officer or a ZARI/agribusiness advisory contact before buying products — they can advise what is working in your district that season.

${guidance()}`,
  },
  {
    title: "Legumes & crop rotation: soybeans and groundnuts",
    topic: "Crops",
    source: "Zambia Ministry of Agriculture — E-Extension",
    sourceUrl: "https://www.agriculture.gov.zm",
    summary:
      "Why following maize with soybeans or groundnuts feeds the soil, breaks pest cycles and spreads risk — and how to give legumes the specific conditions they need.",
    content: `Legumes are crops that work with soil bacteria to fix nitrogen from the air in root nodules. When soybeans or groundnuts follow a cereal like maize in a rotation, they leave the soil in better condition and reduce the fertiliser burden on the next cereal crop. Rotation also breaks the life cycles of pests and diseases that specialise in one crop family.

Give legumes the small extras they need. Soybeans perform best when seeded with the right rhizobium inoculant for the variety, and groundnuts need a well-prepared, loose soil so the pegs can enter the ground after flowering. Both need clean seed of a variety suited to your region — ask your extension officer which varieties are performing well in your district.

Plan the rotation across your fields, for example maize one season followed by a legume the next, rather than growing maize on the same plot year after year. Where land is short, even alternating strips or splitting a field helps. Keep records of what was planted where — rotation only pays if you can remember the plan.

Harvest and market with the same care as maize: groundnuts must be dried properly to avoid aflatoxin, and soybeans fetch better prices when clean and well graded. Extension staff can advise on local market buyers and expected grades.

${guidance()}`,
  },
  {
    title: "Poultry keeping basics",
    topic: "Livestock",
    source: "Zambia Ministry of Fisheries and Livestock",
    summary:
      "Housing, clean water, feed, and simple biosecurity — the foundations of a healthy village or improved flock, and why vaccination plans belong with animal health staff.",
    content: `Poultry are often the fastest-moving part of a small farm: eggs and birds can be sold in small quantities, and the flock multiplies quickly when managed well. The foundations are simple and non-negotiable — a dry, ventilated house with space for all birds, clean water available at all times, and a feed plan that matches the birds' stage (chick, grower, layer or broiler).

Housing protects more than weather. A raised or well-drained floor, regular litter change, and perches or nest boxes kept clean reduce the two biggest flock problems: wetness and disease build-up. Wire or mesh against wild birds and rodents, a footbath or dedicated boots at the door, and keeping new birds in quarantine for a period before joining the flock are biosecurity habits that cost little and prevent most outbreaks.

Feed is the largest cost in poultry keeping, so record what you spend and what you collect. Weigh or count regularly: falling egg numbers or slow growth are early signals to check feed quality, water, heat or illness before losses grow. Do not guess at Newcastle or other disease prevention — vaccination schedules must come from a veterinarian or livestock officer, who will advise what is used in your area and when.

Record deaths, eggs collected, feed used and any medicines given. A small notebook per flock quickly shows which hatches and which houses perform best, and gives your vet or livestock officer the history they need to help you.

${guidance("veterinarian or livestock officer")}`,
  },
  {
    title: "Cattle deworming & tick control (general guidance)",
    topic: "Livestock",
    source: "Zambia Ministry of Fisheries and Livestock — Veterinary Services",
    summary:
      "Why internal worms and tick-borne diseases hurt cattle, the value of regular checks and dipping/spraying routines — and why products and dosages must come from a vet.",
    content: `Cattle in Zambia carry internal worms and face tick-borne diseases such as corridor disease and redwater, which can kill or permanently weaken animals. Signs to watch for and record include poor body condition despite feeding, rough coat, diarrhoea or constipation, swollen glands, high fever, or sudden weakness and red urine. Note which animals, when, and what you saw.

Dosing decisions belong with a professional. The correct dewormer, the right dose for the animal's weight, and how often to repeat it depend on the product, the parasites in your area and the animal's condition — a veterinarian or livestock officer should set this for your herd. Never guess dosages, and record every treatment: product, date, animal and who administered it. Observe any milk or meat withdrawal period on the label.

Tick control is routine work, not a one-off event. Dipping or spraying on a regular schedule advised for your area, keeping the crush pen and equipment in good order, and checking animals for ticks during handling all reduce disease risk. If you are losing animals to tick-borne disease, your vet can confirm the cause and help you adjust the control programme rather than simply using more chemical.

Good nutrition and clean water make every health measure work better. Body-condition scoring your herd monthly, and recording it, turns vague worry into a plan you can discuss with veterinary staff.

${guidance("veterinarian — this article never replaces one")}`,
  },
  {
    title: "Water & irrigation planning",
    topic: "Water",
    source: "Zambia Ministry of Agriculture — E-Extension",
    sourceUrl: "https://www.agriculture.gov.zm",
    summary:
      "Knowing your water source, matching irrigation to crop stage, and simple moisture-saving habits — planning water like a crop input rather than an emergency.",
    content: `Water decides a season. Before the rains end, take stock of what your farm can rely on in the dry months: a stream or dam, a borehole and pump, rooftop tanks, or dams/wells shared with neighbours. Note roughly how much you can draw, what powers the pump, and who else depends on the same source, so your dry-season plan is honest about what is available.

Match water to the crop's stage. Vegetables and seedlings need frequent, smaller applications; a maize crop needs water most critically around flowering and grain fill. Water early or late in the day to cut evaporation losses, and apply water to the root zone rather than flooding the whole surface. A simple schedule written per field — and recorded when you actually irrigate — turns irrigation from guesswork into management.

Save moisture before you need to. Mulch on vegetable beds, basins and ripping that let rain soak in instead of running off, and choosing drought-tolerant crops for drier fields all stretch the water you have. Windbreaks around gardens reduce drying winds. These practices cost little and make a visible difference in dry spells.

For anything beyond a garden — pump selection, canal scheduling, or a new dam or borehole — involve the district agricultural office and water authorities early. They can advise on permits, communal water rules and the technical options that fit your farm's size and budget.

${guidance()}`,
  },
  {
    title: "Farm records & why they matter",
    topic: "Business",
    source: "Zambia National Farmers' Union (ZNFU)",
    summary:
      "What to record on a small farm, how little time it really takes, and how records turn into better prices, easier loans and calmer decisions.",
    content: `A farm record is any note about what happened on the farm and what it cost or earned: animals added or lost, seed planted, spray or medicine given, bags sold, money paid for labour. Kept even roughly, these notes become the farm's memory — the difference between "I think maize made a profit" and knowing it.

Start small and stay regular. A notebook in the house or this app on the phone, updated the same day as the event, is enough. Record the date, what happened, which field or animals, quantities, and the amount in kwacha if money moved. Once a week, glance through: tasks that keep sliding, an animal that keeps needing treatment, a buyer who pays late — patterns are the point.

Records pay in three ways. They show profit: when income and expenses sit side by side, you can see which crop or animal earns its keep and which quietly loses money. They build credit: a lender or agribusiness buyer takes a farmer with orderly records far more seriously. And they protect you: treatment dates, withdrawal periods and warranty dates are all answers you can find instead of arguments you must remember.

Farm Command was built around this idea — every module (livestock, crops, tasks, finances) is a record-keeper first. Use the Reports page to see the patterns, and back up your data regularly from Settings so your memory is never lost with a phone.

${guidance("agricultural extension officer")}`,
  },
];

/** Titles of curated articles — used to flag user-added notes. */
export const CURATED_TITLES = new Set(CURATED_ARTICLES.map((a) => a.title));
