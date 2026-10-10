"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { BookOpen, CloudSun, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { apiGet, qk } from "@/lib/api";
import type { FarmSettingsData, WeatherDataDTO } from "@/lib/farm";
import { formatDate } from "@/lib/farm";
import { usePatchSettings } from "./settings-shared";

type WeatherCheck =
  | { kind: "ok"; data: WeatherDataDTO }
  | { kind: "error"; message: string }
  | null;

/**
 * Online services status — deliberately honest about what each service does,
 * what is cached and what happens when it is unavailable.
 */
export function OnlineServicesCard() {
  const { data: settings } = useQuery({ queryKey: qk.settings, queryFn: () => apiGet<FarmSettingsData>("/api/settings") });
  const patch = usePatchSettings();
  const [weatherCheck, setWeatherCheck] = useState<WeatherCheck>(null);
  const [checking, setChecking] = useState(false);

  const checkWeather = async () => {
    setChecking(true);
    try {
      const data = await apiGet<WeatherDataDTO>("/api/weather");
      setWeatherCheck({ kind: "ok", data });
    } catch (err) {
      const message = (err as Error).message || "Weather could not be fetched right now.";
      setWeatherCheck({ kind: "error", message });
    } finally {
      setChecking(false);
    }
  };

  const toggleAi = (enabled: boolean) => {
    patch.mutate(
      { aiEnabled: enabled },
      {
        onSuccess: () =>
          toast.success(enabled ? "AI assistant enabled." : "AI assistant turned off — the app is now fully offline."),
        onError: (err: Error) => toast.error(err.message || "The setting could not be saved."),
      }
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CloudSun className="size-4 text-primary" aria-hidden />
          Online services
        </CardTitle>
        <CardDescription>
          Enhancements that use the internet. Farm Command stays fully usable without them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* ---------- Weather ---------- */}
        <div className="space-y-2.5 rounded-lg border bg-muted/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">Weather service</p>
            <Badge variant="outline" className="text-xs">
              Open-Meteo
            </Badge>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Live weather via Open-Meteo when online; the last snapshot is cached on this device.
          </p>
          <Button variant="outline" className="min-h-11" disabled={checking} onClick={checkWeather}>
            {checking ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}
            Check weather
          </Button>
          {weatherCheck?.kind === "ok" && (
            <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>
                {weatherCheck.data.location} · updated {formatDate(weatherCheck.data.fetchedAt)}{" "}
                {new Date(weatherCheck.data.fetchedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
              </span>
              {weatherCheck.data.cached ? (
                <Badge variant="outline" className="bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                  Cached snapshot
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                  Live fetch
                </Badge>
              )}
            </p>
          )}
          {weatherCheck?.kind === "error" && (
            <p role="alert" className="text-xs font-medium text-destructive">
              {weatherCheck.message}
            </p>
          )}
        </div>

        {/* ---------- Knowledge source ---------- */}
        <div className="space-y-2.5 rounded-lg border bg-muted/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <BookOpen className="size-4 text-primary" aria-hidden />
              Knowledge source
            </p>
            <Badge variant="outline" className="text-xs">
              On device
            </Badge>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Zambia-first reference articles and your own notes, stored on this device and readable
            offline. No account, no internet needed to read them.
          </p>
        </div>

        {/* ---------- AI assistant toggle ---------- */}
        <div className="flex items-start justify-between gap-4 rounded-lg border bg-muted/20 p-4">
          <div className="space-y-1">
            <Label htmlFor="set-ai" className="flex items-center gap-1.5 text-sm font-medium">
              <Sparkles className="size-4 text-primary" aria-hidden />
              AI assistant
            </Label>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Adds an AI helper that can summarise your records and answer general farming questions
              online. Turn off for a fully offline farm tool.
            </p>
          </div>
          <Switch
            id="set-ai"
            checked={Boolean(settings?.aiEnabled)}
            disabled={!settings || patch.isPending}
            onCheckedChange={toggleAi}
            aria-label="Enable AI assistant"
          />
        </div>
      </CardContent>
    </Card>
  );
}
