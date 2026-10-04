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
