import { createRng, type Rng } from "./rng.ts"
import { FLEURY, interpolate } from "./sky.ts"

/**
 * The kinds of weather that come and go over the Meuse heights: anticyclonic clear spells, fair-weather cumulus, grey
 * overcast, winter fog that lies all day, drizzle, the rain of a passing front, and summer thunderstorms. Snow is rain
 * or drizzle when it is cold enough.
 */
export const WeatherPattern = {
  Clear: 0,
  Fair: 1,
  Overcast: 2,
  Fog: 3,
  Drizzle: 4,
  Rain: 5,
  Storm: 6
} as const
export type WeatherPattern = (typeof WeatherPattern)[keyof typeof WeatherPattern]

/** The weather at a moment. Every field is plain data, so it saves with the world and blends smoothly. */
export interface Weather {
  /** The pattern that is setting in, or holding. */
  readonly pattern: WeatherPattern
  /** Fraction of the sky under cloud, 0 to 1. */
  readonly cloudCover: number
  /** Rain or snow falling, in millimetres of water an hour. */
  readonly precipitation: number
  /** Fraction of the precipitation falling as snow, 0 to 1. */
  readonly snowFraction: number
  /** Air temperature near the ground, in °C. */
  readonly temperature: number
  /** How far large dark objects can be made out by day, in metres: fog, mist, haze, rain and snow. */
  readonly visibility: number
  /** Wind near the ground, in metres per second toward +x (east) and +z (north). */
  readonly wind: { readonly x: number; readonly z: number }
  /** How wet the ground is, from 0 (dry) to 1 (sodden): rain of the last few days, less what has dried. */
  readonly wetness: number
  /** Snow lying on the ground, in millimetres of water. */
  readonly snowCover: number
}

/**
 * Where the weather comes from, as plain data so it saves with the world. A cycle draws a plausible succession of
 * patterns for the season from a seed. A steady forecast holds one weather. Historical records, once sourced, become a
 * third kind here.
 */
export type ForecastSpec =
  | { readonly kind: "cycle"; readonly seed: number }
  | { readonly kind: "steady"; readonly weather: Weather }

export interface Forecast {
  readonly spec: ForecastSpec
  /** The weather at a moment, `utc` in milliseconds since 1970. The same moment always gives the same weather. */
  at(utc: number): Weather
}

const HOUR = 3_600_000
const DAY = 24 * HOUR

interface PatternTraits {
  readonly cloud: readonly [number, number]
  /** Millimetres an hour. */
  readonly precipitation: readonly [number, number]
  /** Metres, before rain, snow or morning fog. */
  readonly visibility: readonly [number, number]
  /** Metres per second near the ground. */
  readonly wind: readonly [number, number]
  /** Compass degrees the wind blows from, and how far either side it may swing. */
  readonly windFrom: readonly [number, number]
  /** How long a spell of it lasts, in hours. */
  readonly hours: readonly [number, number]
  /** Departure from the day's normal temperature in summer and in winter, °C. */
  readonly anomaly: readonly [number, number]
  /** How readily radiation fog forms in the small hours, 0 to 1: under clear, calm skies most of all. */
  readonly morningFog: number
}

/**
 * What each pattern is like at Verdun. Wind is the gentler wind at a man's height, about three quarters of the 10 m
 * wind. Westerlies and south-westerlies bring the rain; clear spells come with light easterlies.
 */
const PATTERNS: Readonly<Record<WeatherPattern, PatternTraits>> = {
  [WeatherPattern.Clear]: {
    cloud: [0, 0.15],
    precipitation: [0, 0],
    visibility: [20_000, 40_000],
    wind: [0.8, 3],
    windFrom: [60, 70],
    hours: [12, 60],
    anomaly: [2, -3],
    morningFog: 0.8
  },
  [WeatherPattern.Fair]: {
    cloud: [0.25, 0.55],
    precipitation: [0, 0],
    visibility: [15_000, 30_000],
    wind: [1.5, 4],
    windFrom: [260, 50],
    hours: [8, 36],
    anomaly: [1, -1],
    morningFog: 0.4
  },
  [WeatherPattern.Overcast]: {
    cloud: [0.85, 1],
    precipitation: [0, 0],
    visibility: [6000, 15_000],
    wind: [1.5, 5],
    windFrom: [240, 50],
    hours: [6, 36],
    anomaly: [-1, 1],
    morningFog: 0.2
  },
  [WeatherPattern.Fog]: {
    cloud: [1, 1],
    precipitation: [0, 0],
    visibility: [80, 400],
    wind: [0, 1],
    windFrom: [90, 90],
    hours: [4, 30],
    anomaly: [-1, -1],
    morningFog: 0
  },
  [WeatherPattern.Drizzle]: {
    cloud: [1, 1],
    precipitation: [0.1, 0.25],
    visibility: [3000, 6000],
    wind: [1.5, 4],
    windFrom: [230, 40],
    hours: [3, 12],
    anomaly: [-1.5, 0.5],
    morningFog: 0
  },
  [WeatherPattern.Rain]: {
    cloud: [1, 1],
    precipitation: [0.4, 1.6],
    visibility: [5000, 10_000],
    wind: [3, 7],
    windFrom: [230, 40],
    hours: [3, 14],
    anomaly: [-2, 0],
    morningFog: 0
  },
  [WeatherPattern.Storm]: {
    cloud: [0.9, 1],
    precipitation: [3, 8],
    visibility: [4000, 8000],
    wind: [5, 10],
    windFrom: [270, 60],
    hours: [1, 3],
    anomaly: [-4, -4],
    morningFog: 0
  }
}

type Weights = Partial<Record<WeatherPattern, number>>

/** What tends to follow what, before the season weighs in: fronts clear to fair skies, fair skies cloud over. */
const FOLLOWS: Readonly<Record<WeatherPattern, Weights>> = {
  [WeatherPattern.Clear]: {
    [WeatherPattern.Fair]: 4,
    [WeatherPattern.Overcast]: 1,
    [WeatherPattern.Fog]: 1,
    [WeatherPattern.Storm]: 0.8
  },
  [WeatherPattern.Fair]: {
    [WeatherPattern.Clear]: 2,
    [WeatherPattern.Overcast]: 3,
    [WeatherPattern.Drizzle]: 1,
    [WeatherPattern.Rain]: 1.5,
    [WeatherPattern.Storm]: 1
  },
  [WeatherPattern.Overcast]: {
    [WeatherPattern.Fair]: 2,
    [WeatherPattern.Drizzle]: 2,
    [WeatherPattern.Rain]: 3,
    [WeatherPattern.Fog]: 1,
    [WeatherPattern.Clear]: 0.5
  },
  [WeatherPattern.Fog]: { [WeatherPattern.Clear]: 2, [WeatherPattern.Overcast]: 2, [WeatherPattern.Fair]: 1 },
  [WeatherPattern.Drizzle]: { [WeatherPattern.Overcast]: 3, [WeatherPattern.Rain]: 2, [WeatherPattern.Fair]: 1 },
  [WeatherPattern.Rain]: {
    [WeatherPattern.Overcast]: 2,
    [WeatherPattern.Fair]: 3,
    [WeatherPattern.Drizzle]: 1.5,
    [WeatherPattern.Clear]: 0.5
  },
  [WeatherPattern.Storm]: { [WeatherPattern.Fair]: 3, [WeatherPattern.Overcast]: 1, [WeatherPattern.Clear]: 1 }
}

/** How much the season favours each pattern, from 0 in midwinter to 1 in midsummer. */
function seasonWeight(pattern: WeatherPattern, summer: number): number {
  const winter = 1 - summer
  switch (pattern) {
    case WeatherPattern.Storm:
      return 2 * summer ** 3
    case WeatherPattern.Fog:
      return 3 * winter ** 2
    case WeatherPattern.Drizzle:
      return 0.5 + winter
    case WeatherPattern.Clear:
      return 0.4 + 0.9 * summer
    case WeatherPattern.Overcast:
      return 1 + winter
    default:
      return 1
  }
}

/**
 * Normal mean daily temperature and day-to-night range at Verdun, °C, by month: cold, wet winters, warm summers, much
 * as at Metz and Nancy.
 */
const MEAN_TEMPERATURE = [1.8, 2.6, 6, 9, 13, 16.1, 18.3, 17.9, 14.4, 10.3, 5.5, 2.6] as const
const DAILY_RANGE = [5, 6.5, 8.5, 10.5, 11.5, 11.5, 12, 11.5, 10.5, 8.5, 6, 5] as const
/** Days a wet field takes to dry by a factor of e, in midwinter and midsummer. */
const DRYING_DAYS = [3, 1] as const
/** Hours of rain that count toward how wet the ground is now. */
const WETNESS_HOURS = 96
/** How long a change of weather takes to arrive, in hours: a front's leading edge. */
const BLEND_HOURS = 1.5
/** Steps of the gusts and the showers' ebb and flow, in minutes. */
const GUST_MINUTES = 10
const SHOWER_MINUTES = 25
/**
 * The cycle's first spell begins here, before the war: the forecast covers every week from August 1914 to the armistice.
 * Weather before it is the first spell's.
 */
const CYCLE_ORIGIN = Date.UTC(1914, 0, 1)

interface Spell {
  readonly start: number
  readonly end: number
  readonly pattern: WeatherPattern
  readonly cloud: number
  readonly precipitation: number
  readonly visibility: number
  readonly windSpeed: number
  /** Radians the wind blows toward, counter-clockwise from east, like the map's x and z. */
  readonly windToward: number
  readonly anomaly: number
  /** Whether mornings in this spell are foggy, from 0 to 1. */
  readonly morningFog: number
}

/** Mixes integers into a well-spread 32-bit hash, for noise that is a pure function of time. */
function hash(seed: number, value: number): number {
  let h = Math.imul(seed ^ 0x9e_37_79_b9, 0x85_eb_ca_6b) ^ Math.imul(value | 0, 0xc2_b2_ae_35)
  h = Math.imul(h ^ (h >>> 16), 0x7f_eb_35_2d)
  h = Math.imul(h ^ (h >>> 15), 0x84_6c_a6_8b)
  return (h ^ (h >>> 16)) >>> 0
}

/** Smooth noise between -1 and 1 over time, with a knot every `period` milliseconds. */
function smoothNoise(seed: number, utc: number, period: number): number {
  const position = utc / period
  const knot = Math.floor(position)
  const along = position - knot
  const eased = along * along * (3 - 2 * along)
  const a = hash(seed, knot) / 2_147_483_648 - 1
  const b = hash(seed, knot + 1) / 2_147_483_648 - 1
  return a + (b - a) * eased
}

function between(rng: Rng, [low, high]: readonly [number, number]): number {
  return low + (high - low) * rng.next()
}

/** Day of the year from 0, as a fraction. */
function dayOfYear(utc: number): number {
  const date = new Date(utc)
  return (utc - Date.UTC(date.getUTCFullYear(), 0, 1)) / DAY
}

/** 0 in midwinter (mid-January) to 1 in midsummer (mid-July). */
function summerness(utc: number): number {
  return (1 - Math.cos((2 * Math.PI * (dayOfYear(utc) - 15)) / 365)) / 2
}

/** A monthly normal for the moment, interpolated between mid-months. */
function monthly(values: readonly number[], utc: number): number {
  const month = (dayOfYear(utc) / 365) * 12 - 0.5
  const below = Math.floor(month)
  const along = month - below
  const at = (index: number) => values[(index + 12) % 12]!
  return at(below) + (at(below + 1) - at(below)) * along
}

function drawSpell(rng: Rng, start: number, pattern: WeatherPattern): Spell {
  const traits = PATTERNS[pattern]
  const summer = summerness(start)
  const [mean, swing] = traits.windFrom
  const from = mean + swing * (2 * rng.next() - 1)
  return {
    start,
    end: start + between(rng, traits.hours) * HOUR,
    pattern,
    cloud: between(rng, traits.cloud),
    precipitation: between(rng, traits.precipitation),
    visibility: between(rng, traits.visibility),
    windSpeed: between(rng, traits.wind),
    // Blowing from compass `from` (clockwise from north) is blowing toward `from + 180`.
    windToward: (Math.PI / 180) * (90 - (from + 180)),
    anomaly: traits.anomaly[0] * summer + traits.anomaly[1] * (1 - summer) + 2 * (2 * rng.next() - 1),
    morningFog: rng.next() < traits.morningFog * (0.3 + 0.7 * (1 - summer)) ? 0.5 + 0.5 * rng.next() : 0
  }
}

function nextPattern(rng: Rng, previous: WeatherPattern, utc: number): WeatherPattern {
  const summer = summerness(utc)
  const options = Object.entries(FOLLOWS[previous]).flatMap(([key, weight]) => {
    const pattern = Object.values(WeatherPattern).find((value) => String(value) === key)
    return pattern === undefined ? [] : [{ pattern, weight: weight * seasonWeight(pattern, summer) }]
  })
  const total = options.reduce((sum, option) => sum + option.weight, 0)
  let pick = rng.next() * total
  for (const option of options) {
    pick -= option.weight
    if (pick < 0) {
      return option.pattern
    }
  }
  return options[options.length - 1]?.pattern ?? WeatherPattern.Fair
}

/**
 * How thick radiation fog lies at a moment, from 0 to 1: it forms in the small hours, is thickest about sunrise, and
 * burns off through the morning, later in winter. Sunrise comes from the sun's declination, near enough for fog.
 */
function morningFogAt(utc: number, latitude: number, longitude: number): number {
  const declination = 23.44 * Math.sin((2 * Math.PI * (dayOfYear(utc) - 81)) / 365)
  const radians = Math.PI / 180
  const cosine = -Math.tan(latitude * radians) * Math.tan(declination * radians)
  const halfDay = Math.acos(Math.min(1, Math.max(-1, cosine))) / (15 * radians)
  const sunrise = 12 - halfDay
  const solarHour = (((utc / HOUR + longitude / 15) % 24) + 24) % 24
  const lingers = 2 + 3 * (1 - summerness(utc))
  return interpolate(
    [
      [sunrise - 4, 0],
      [sunrise - 1, 0.8],
      [sunrise + 0.5, 1],
      [sunrise + lingers, 0]
    ],
    solarHour
  )
}

/** Visibility through falling rain or snow, in metres: about 10 km in light rain, 1 km in a cloudburst or light snow. */
function precipitationVisibility(precipitation: number, snowFraction: number): number {
  if (precipitation <= 0) {
    return Infinity
  }
  const rain = 11_000 * precipitation ** -0.7
  const snow = 1200 * precipitation ** -0.7
  return Math.exp(Math.log(rain) * (1 - snowFraction) + Math.log(snow) * snowFraction)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * Weather part way, `t` from 0 to 1, from one weather to another: for easing between dates when the sky's date jumps.
 * Visibility blends on a log scale, as fog thins; the pattern switches half way.
 */
export function blendWeather(from: Weather, to: Weather, t: number): Weather {
  return {
    pattern: t < 0.5 ? from.pattern : to.pattern,
    cloudCover: lerp(from.cloudCover, to.cloudCover, t),
    precipitation: lerp(from.precipitation, to.precipitation, t),
    snowFraction: lerp(from.snowFraction, to.snowFraction, t),
    temperature: lerp(from.temperature, to.temperature, t),
    visibility: Math.exp(lerp(Math.log(from.visibility), Math.log(to.visibility), t)),
    wind: { x: lerp(from.wind.x, to.wind.x, t), z: lerp(from.wind.z, to.wind.z, t) },
    wetness: lerp(from.wetness, to.wetness, t),
    snowCover: lerp(from.snowCover, to.snowCover, t)
  }
}

/**
 * A forecast that cycles through the weather patterns, each spell drawn from the season and from what came before.
 * The same seed always gives the same weather on the same day, from New Year 1914 to the end of the war and beyond,
 * whenever the battle starts.
 */
function createCycleForecast(spec: { readonly kind: "cycle"; readonly seed: number }): Forecast {
  const rng = createRng(spec.seed)
  const spells = [drawSpell(rng, CYCLE_ORIGIN, WeatherPattern.Overcast)]
  const spellAt = (utc: number): number => {
    let last = spells[spells.length - 1]!
    while (last.end <= utc) {
      last = drawSpell(rng, last.end, nextPattern(rng, last.pattern, last.end))
      spells.push(last)
    }
    let low = 0
    let high = spells.length - 1
    while (low < high) {
      const middle = (low + high + 1) >> 1
      if (spells[middle]!.start <= utc) {
        low = middle
      } else {
        high = middle - 1
      }
    }
    return low
  }

  /** Everything but the ground, which needs the weather of the days before. */
  const airAt = (utc: number): Omit<Weather, "wetness" | "snowCover"> => {
    const index = spellAt(utc)
    const spell = spells[index]!
    const previous = spells[index - 1] ?? spell
    const t = Math.min(1, (utc - spell.start) / (BLEND_HOURS * HOUR))
    const arrived = t * t * (3 - 2 * t)
    const cloudCover = lerp(previous.cloud, spell.cloud, arrived)
    // Rain comes and goes in showers; a thunderstorm builds and spends itself.
    const surge =
      spell.pattern === WeatherPattern.Storm
        ? 2 * Math.sin((Math.PI * (utc - spell.start)) / (spell.end - spell.start))
        : 1 + 0.6 * smoothNoise(spec.seed + 1, utc, SHOWER_MINUTES * 60_000)
    const precipitation = lerp(previous.precipitation, spell.precipitation, arrived) * Math.max(0, surge)
    const daily = monthly(DAILY_RANGE, utc) * (1 - 0.7 * cloudCover)
    const solarHour = utc / HOUR + FLEURY.longitude / 15
    const temperature =
      monthly(MEAN_TEMPERATURE, utc) +
      lerp(previous.anomaly, spell.anomaly, arrived) +
      (daily / 2) * Math.cos((2 * Math.PI * (solarHour - 15)) / 24)
    const snowFraction = Math.min(1, Math.max(0, (1.5 - temperature) / 1.5))
    const fog =
      lerp(previous.morningFog, spell.morningFog, arrived) * morningFogAt(utc, FLEURY.latitude, FLEURY.longitude)
    const clearAir = Math.exp(lerp(Math.log(previous.visibility), Math.log(spell.visibility), arrived))
    const visibility = Math.min(
      Math.exp(lerp(Math.log(clearAir), Math.log(120), fog)),
      precipitationVisibility(precipitation, snowFraction)
    )
    const gust = spell.pattern === WeatherPattern.Storm ? 0.5 : 0.3
    const speed =
      lerp(previous.windSpeed, spell.windSpeed, arrived) *
      (1 + gust * smoothNoise(spec.seed + 2, utc, GUST_MINUTES * 60_000))
    const toward =
      Math.atan2(
        lerp(Math.sin(previous.windToward), Math.sin(spell.windToward), arrived),
        lerp(Math.cos(previous.windToward), Math.cos(spell.windToward), arrived)
      ) +
      0.35 * smoothNoise(spec.seed + 3, utc, GUST_MINUTES * 60_000)
    return {
      pattern: spell.pattern,
      cloudCover,
      precipitation,
      snowFraction,
      temperature,
      visibility,
      wind: { x: speed * Math.cos(toward), z: speed * Math.sin(toward) }
    }
  }

  return {
    spec,
    at(utc) {
      // Walk the last few days forward an hour at a time: rain wets the ground, sun and wind dry it, snow lies until
      // it thaws.
      const summer = summerness(utc)
      const dryingHours = 24 * lerp(DRYING_DAYS[0], DRYING_DAYS[1], summer)
      let water = 0
      let snow = 0
      for (let hoursAgo = WETNESS_HOURS; hoursAgo >= 1; hoursAgo--) {
        const past = airAt(utc - hoursAgo * HOUR)
        water = water * Math.exp(-1 / dryingHours) + past.precipitation * (1 - past.snowFraction)
        const thaw = Math.max(0, past.temperature) * 0.15
        snow = Math.max(0, snow + past.precipitation * past.snowFraction - thaw)
        if (past.temperature > 0) {
          water += Math.min(snow, thaw)
        }
      }
      return { ...airAt(utc), wetness: 1 - Math.exp(-water / 6), snowCover: snow }
    }
  }
}

/** Typical weather of a pattern on a June day, for holding the weather steady. */
export function typicalWeather(pattern: WeatherPattern, wind: { readonly x: number; readonly z: number }): Weather {
  const traits = PATTERNS[pattern]
  const middle = ([low, high]: readonly [number, number]) => (low + high) / 2
  const precipitation = middle(traits.precipitation)
  const wet = precipitation > 0
  return {
    pattern,
    cloudCover: middle(traits.cloud),
    precipitation,
    snowFraction: 0,
    temperature: 17 + traits.anomaly[0],
    visibility: Math.min(middle(traits.visibility), precipitationVisibility(precipitation, 0)),
    wind: { x: wind.x, z: wind.z },
    wetness: wet ? 0.7 : 0.15,
    snowCover: 0
  }
}

export function createForecast(spec: ForecastSpec): Forecast {
  if (spec.kind === "cycle") {
    return createCycleForecast(spec)
  }
  const weather = { ...spec.weather, wind: { ...spec.weather.wind } }
  return { spec, at: () => weather }
}
