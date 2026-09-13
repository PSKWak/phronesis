// Real-to-sim grounding: live weather conditions tune how cautious the scenario
// search and shield should be. Open-Meteo requires no API key.
export interface WeatherKnobs {
  windSpeed10m: number;
  visibility: number;
  margin: number;
  avoidRadius: number;
  source: "open-meteo" | "fallback";
}

const DEFAULT_WIND = 10.0;
const DEFAULT_VISIBILITY = 20000.0;

export async function getWeather(lat = 40.7128, lon = -74.006): Promise<{ wind: number; visibility: number; source: "open-meteo" | "fallback" }> {
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(lat));
    url.searchParams.set("longitude", String(lon));
    url.searchParams.set("current", "wind_speed_10m,visibility");
    const resp = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) throw new Error(`Open-Meteo returned ${resp.status}`);
    const data = await resp.json();
    return {
      wind: data.current?.wind_speed_10m ?? DEFAULT_WIND,
      visibility: data.current?.visibility ?? DEFAULT_VISIBILITY,
      source: "open-meteo",
    };
  } catch (exc) {
    console.error("[weather] Open-Meteo call failed; using calm-weather defaults.", exc);
    return { wind: DEFAULT_WIND, visibility: DEFAULT_VISIBILITY, source: "fallback" };
  }
}

export function weatherToKnobs(wind: number, visibility: number, source: "open-meteo" | "fallback"): WeatherKnobs {
  const margin = 0.1 + Math.min(0.15, wind / 200);
  const avoidRadius = 0.55 + Math.min(0.25, (10000 - Math.min(visibility, 10000)) / 20000);
  return { windSpeed10m: wind, visibility, margin, avoidRadius, source };
}
