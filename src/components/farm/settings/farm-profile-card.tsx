"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiGet, qk } from "@/lib/api";
import type { FarmSettingsData } from "@/lib/farm";
import { TIMEZONES, usePatchSettings } from "./settings-shared";

interface ProfileDraft {
  farmName: string;
  ownerName: string;
  location: string;
  latitude: string;
  longitude: string;
  timezone: string;
}

function toDraft(s: FarmSettingsData): ProfileDraft {
  // Round-tripped floats can pick up precision noise — display 6 dp max.
  const clean = (v: number | undefined): string =>
    typeof v === "number" && isFinite(v) ? String(Number(v.toFixed(6))) : "";
  return {
    farmName: s.farmName ?? "",
    ownerName: s.ownerName ?? "",
    location: s.location ?? "",
    latitude: clean(s.latitude),
    longitude: clean(s.longitude),
    timezone: s.timezone || "Africa/Lusaka",
  };
}

/** Farm profile — name, owner, location, coordinates (used for weather), timezone. */
export function FarmProfileCard() {
  const { data: settings } = useQuery({ queryKey: qk.settings, queryFn: () => apiGet<FarmSettingsData>("/api/settings") });
  const patch = usePatchSettings();
  const [draft, setDraft] = useState<ProfileDraft>({ farmName: "", ownerName: "", location: "", latitude: "", longitude: "", timezone: "Africa/Lusaka" });
  const [dirty, setDirty] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  // Hydrate the form once settings arrive — only when the user hasn't started
  // editing. setState runs inside a macrotask to stay lint-clean.
  useEffect(() => {
    if (!settings || dirty) return;
    const t = setTimeout(() => setDraft(toDraft(settings)));
    return () => clearTimeout(t);
  }, [settings, dirty]);

  const update = (p: Partial<ProfileDraft>) => {
    setDirty(true);
    setFieldError(null);
    setDraft((d) => ({ ...d, ...p }));
  };

  const save = () => {
    if (!settings) return;
    const latInput = draft.latitude.trim();
    const lonInput = draft.longitude.trim();
    // Empty field = "no change" (keep the current setting).
    const lat: number | undefined = latInput === "" ? settings.latitude : Number(latInput);
    const lon: number | undefined = lonInput === "" ? settings.longitude : Number(lonInput);
    if (latInput !== "" && (lat === undefined || !isFinite(lat) || lat < -90 || lat > 90)) {
      setFieldError("Latitude must be a number between -90 and 90 (negative south of the equator).");
      return;
    }
    if (lonInput !== "" && (lon === undefined || !isFinite(lon) || lon < -180 || lon > 180)) {
      setFieldError("Longitude must be a number between -180 and 180.");
      return;
    }
    patch.mutate(
      {
        farmName: draft.farmName.trim() || "My Farm",
        ownerName: draft.ownerName.trim() || "Farmer",
        location: draft.location.trim(),
        latitude: lat,
        longitude: lon,
        timezone: draft.timezone,
      },
      {
        onSuccess: () => {
          setDirty(false);
          toast.success("Farm profile saved.");
        },
        onError: (err: Error) => toast.error(err.message || "The profile could not be saved."),
      }
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="size-4 text-primary" aria-hidden />
          Farm profile
        </CardTitle>
        <CardDescription>
          Your farm&rsquo;s identity. Coordinates are used for the live weather feed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="set-farm-name">Farm name</Label>
            <Input id="set-farm-name" value={draft.farmName} onChange={(e) => update({ farmName: e.target.value })} placeholder="e.g. Chilenje Farm" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="set-owner">Owner / manager</Label>
            <Input id="set-owner" value={draft.ownerName} onChange={(e) => update({ ownerName: e.target.value })} placeholder="e.g. Dad" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="set-location">Location</Label>
          <Input id="set-location" value={draft.location} onChange={(e) => update({ location: e.target.value })} placeholder="e.g. Chisamba, Zambia" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="set-lat">Latitude</Label>
            <Input
              id="set-lat"
              type="number"
              step="any"
              inputMode="decimal"
              value={draft.latitude}
              onChange={(e) => update({ latitude: e.target.value })}
              placeholder="e.g. -15.39"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="set-lon">Longitude</Label>
            <Input
              id="set-lon"
              type="number"
              step="any"
              inputMode="decimal"
              value={draft.longitude}
              onChange={(e) => update({ longitude: e.target.value })}
              placeholder="e.g. 28.32"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="set-tz">Timezone</Label>
          <Select value={draft.timezone} onValueChange={(v) => update({ timezone: v })}>
            <SelectTrigger id="set-tz" className="min-h-11 w-full sm:w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((tz) => (
                <SelectItem key={tz} value={tz}>
                  {tz}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1.5 px-2.5 py-1">
            Currency: ZMW (Kwacha) — fixed
          </Badge>
          <Badge variant="outline" className="gap-1.5 px-2.5 py-1">
            Units: Metric — fixed
          </Badge>
        </div>

        {fieldError && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {fieldError}
          </p>
        )}

        <Button className="min-h-11" disabled={patch.isPending || !settings} onClick={save}>
          {patch.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Save farm profile
        </Button>
      </CardContent>
    </Card>
  );
}
