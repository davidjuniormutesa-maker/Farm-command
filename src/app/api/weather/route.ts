import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseSettings } from "@/lib/settings-schema";
import type { WeatherDataDTO, WeatherDayDTO } from "@/lib/farm";

export const dynamic = "force-dynamic";

/** WMO weather codes are mapped client-side; we pass them through untouched. */
export async function GET(req: NextRequest) {
  try {
    const settings = parseSettings(
      Object.fromEntries((await db.farmSetting.findMany()).map((r) => [r.key, r.value]))
    );
    const lat = Number(req.nextUrl.searchParams.get("lat") ?? settings.latitude ?? -15.3875);
    const lon = Number(req.nextUrl.searchParams.get("lon") ?? settings.longitude ?? 28.3228);
    const location = req.nextUrl.searchParams.get("location") ?? settings.location ?? "Farm";

    if (!isFinite(lat) || !isFinite(lon)) {
      return NextResponse.json({ error: "Set a valid farm location in Settings first." }, { status: 400 });
    }

    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,relative_humidity_2m_mean,wind_speed_10m_max` +
      `&forecast_days=5&timezone=auto`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let payload: {
      current?: Record<string, number>;
      daily?: {
        time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[];
        precipitation_sum: number[]; relative_humidity_2m_mean: number[]; wind_speed_10m_max: number[];
      };
    } | null = null;

    try {
      const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
      if (res.ok) payload = await res.json();
    } catch {
      payload = null;
    } finally {
      clearTimeout(timeout);
    }

    if (payload?.current && payload.daily) {
      const forecast: WeatherDayDTO[] = payload.daily.time.slice(0, 5).map((d, i) => ({
        date: d,
        tempMax: Math.round(payload!.daily!.temperature_2m_max[i]),
        tempMin: Math.round(payload!.daily!.temperature_2m_min[i]),
        rainMm: Math.round((payload!.daily!.precipitation_sum[i] ?? 0) * 10) / 10,
        humidity: Math.round(payload!.daily!.relative_humidity_2m_mean?.[i] ?? 0),
        windMax: Math.round(payload!.daily!.wind_speed_10m_max?.[i] ?? 0),
        code: payload!.daily!.weather_code[i],
      }));

      const data: WeatherDataDTO = {
        location,
        temperature: Math.round(payload.current.temperature_2m ?? 0),
        apparent: Math.round(payload.current.apparent_temperature ?? 0),
        humidity: Math.round(payload.current.relative_humidity_2m ?? 0),
        wind: Math.round(payload.current.wind_speed_10m ?? 0),
        rainMm: Math.round((payload.current.precipitation ?? 0) * 10) / 10,
        code: payload.current.weather_code ?? 0,
        forecast,
        fetchedAt: new Date().toISOString(),
        cached: false,
      };

      // Cache the snapshot (keep the newest per location)
      try {
        await db.weatherSnapshot.deleteMany({ where: { location } });
        await db.weatherSnapshot.create({ data: { location, payload: JSON.stringify(data) } });
      } catch (e) {
        console.error("Weather cache write failed", e);
      }

      return NextResponse.json(data);
    }

    // Provider unreachable → serve last cached snapshot, else 503
    const snap = await db.weatherSnapshot.findFirst({ where: { location }, orderBy: { fetchedAt: "desc" } });
    if (snap) {
      const data = JSON.parse(snap.payload) as WeatherDataDTO;
      return NextResponse.json({ ...data, cached: true, fetchedAt: snap.fetchedAt.toISOString() });
    }
    return NextResponse.json(
      { error: "Weather is unavailable right now. Use your saved local observations." },
      { status: 503 }
    );
  } catch (error) {
    console.error("GET /api/weather failed", error);
    return NextResponse.json({ error: "Weather service failed." }, { status: 500 });
  }
}
