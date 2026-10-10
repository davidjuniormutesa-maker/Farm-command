import type { FarmSettingsData } from "@/lib/farm";

/** Settings keys persisted in FarmSetting table. */
export const SETTING_KEYS = [
  "farmName",
  "ownerName",
  "location",
  "latitude",
  "longitude",
  "currency",
  "units",
  "timezone",
  "onboarded",
  "notificationsEnabled",
  "reminderLeadDays",
  "quietHoursStart",
  "quietHoursEnd",
  "showBirthdayGreeting",
  "aiEnabled",
  "expenseBudgets",
] as const;

export const DEFAULT_SETTINGS: FarmSettingsData = {
  farmName: "My Farm",
  ownerName: "Farmer",
  location: "Lusaka, Zambia",
  latitude: -15.3875,
  longitude: 28.3228,
  currency: "ZMW",
  units: "metric",
  timezone: "Africa/Lusaka",
  onboarded: false,
  notificationsEnabled: false,
  reminderLeadDays: 3,
  quietHoursStart: "20:00",
  quietHoursEnd: "06:00",
  showBirthdayGreeting: true,
  aiEnabled: false,
  expenseBudgets: {},
};

export function parseSettings(map: Record<string, string>): FarmSettingsData {
  const num = (v: string | undefined): number | undefined => {
    if (v === undefined || v === "") return undefined;
    const n = Number(v);
    return isFinite(n) ? n : undefined;
  };
  return {
    farmName: map.farmName?.trim() || DEFAULT_SETTINGS.farmName,
    ownerName: map.ownerName?.trim() || DEFAULT_SETTINGS.ownerName,
    location: map.location?.trim() || DEFAULT_SETTINGS.location,
    latitude: num(map.latitude) ?? DEFAULT_SETTINGS.latitude,
    longitude: num(map.longitude) ?? DEFAULT_SETTINGS.longitude,
    currency: map.currency || DEFAULT_SETTINGS.currency,
    units: map.units || DEFAULT_SETTINGS.units,
    timezone: map.timezone || DEFAULT_SETTINGS.timezone,
    onboarded: map.onboarded === "true",
    notificationsEnabled: map.notificationsEnabled === "true",
    reminderLeadDays: num(map.reminderLeadDays) ?? DEFAULT_SETTINGS.reminderLeadDays,
    quietHoursStart: map.quietHoursStart || DEFAULT_SETTINGS.quietHoursStart,
    quietHoursEnd: map.quietHoursEnd || DEFAULT_SETTINGS.quietHoursEnd,
    showBirthdayGreeting: map.showBirthdayGreeting !== "false",
    aiEnabled: map.aiEnabled === "true",
    expenseBudgets: parseBudgets(map.expenseBudgets),
  };
}

/** Safe parse of the JSON budgets blob — never throws, drops junk entries. */
function parseBudgets(raw: string | undefined): Record<string, number> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const n = Number(value);
      if (key.trim() && Number.isFinite(n) && n > 0) out[key.trim()] = n;
    }
    return out;
  } catch {
    return {};
  }
}
