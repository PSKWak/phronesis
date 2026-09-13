import requests

DEFAULT_WEATHER = {"wind_speed_10m": 10.0, "visibility": 20000.0}


def get_weather(lat=40.7128, lon=-74.0060, timeout=5):
    try:
        resp = requests.get(
            "https://api.open-meteo.com/v1/forecast",
            params={"latitude": lat, "longitude": lon, "current": "wind_speed_10m,visibility"},
            timeout=timeout,
        )
        resp.raise_for_status()
        return resp.json()["current"]
    except Exception as exc:
        print(f"[weather] Open-Meteo call failed ({exc}); using calm-weather defaults.")
        return DEFAULT_WEATHER


def weather_to_scenario_knobs(weather):
    wind = weather.get("wind_speed_10m", DEFAULT_WEATHER["wind_speed_10m"])
    visibility = weather.get("visibility", DEFAULT_WEATHER["visibility"])
    margin = 0.12 + min(0.15, wind / 200.0)
    avoid_radius = 0.55 + min(0.25, (10000 - min(visibility, 10000)) / 20000)
    return {"wind_speed_10m": wind, "visibility": visibility, "margin": margin, "avoid_radius": avoid_radius}
