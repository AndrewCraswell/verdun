/** Numbers as the HUD writes them. */

/** Seconds as a soldier's watch shows a short wait: "0:42", "2:05". */
export function clockSeconds(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`
}

/** Metres, rounded the way a man would call them: "8 m", "40 m", "250 m". */
export function metres(distance: number): string {
  if (distance < 20) {
    return `${Math.round(distance)} m`
  }
  return `${Math.round(distance / (distance < 200 ? 5 : 10)) * (distance < 200 ? 5 : 10)} m`
}

/**
 * A time of day written "07:05" or "19:40", as the player reads the clock: unchanged by the 24-hour clock, "7:05 am"
 * and "7:40 pm" by the 12-hour. Times inside a longer text change too: "sunset 19:40".
 */
export function hourText(text: string, clock: "24" | "12"): string {
  if (clock === "24") {
    return text
  }
  return text.replace(/\b(\d{1,2}):(\d{2})\b/g, (_, hours: string, minutes: string) => {
    const hour = Number(hours) % 24
    return `${hour % 12 || 12}:${minutes} ${hour < 12 ? "am" : "pm"}`
  })
}
