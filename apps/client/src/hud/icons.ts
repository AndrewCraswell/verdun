/**
 * The HUD's icon set: one family, drawn on a 24-unit grid with a 1.75-unit stroke, round joins, mostly line with a few
 * solid parts, so every icon reads at 16 px and holds up at 48. Each is a symbol in one sprite injected into the page
 * once; `icon(name)` draws one. Colour comes from the CSS `color` of whatever holds it.
 *
 * To redraw an icon, change its markup here: every element that uses it follows. Solid parts are written with
 * `class="f"`, turned into a fill when the sprite is built.
 */
const ICONS = {
  // Spirit: a brass diamond, cracked as morale goes.
  steady: `<path d="M12 2.8 20.2 12 12 21.2 3.8 12Z"/><path class="f" d="M12 8.2 15.8 12 12 15.8 8.2 12Z"/>`,
  shaken: `<path d="M12 2.8 20.2 12 12 21.2 3.8 12Z"/><path d="M7.6 12.6l2.2-2.4 2.6 3.4 2.2-2.6 1.8 1.6"/>`,
  broken: `<path d="M10.6 4.4 3.8 12l6.8 7.6M13.4 4.4l6.8 7.6-6.8 7.6"/><path d="M12 3.6 10.8 8l2.2 3-2 3.4 1.2 5.6"/>`,
  // Fire: rounds striking close; pressed into the ground.
  "under-fire": `<circle cx="8.5" cy="14.5" r="4.2"/><path d="M14.5 4.5l-1.6 3.6M18.8 7l-3.4 2.8M21 11.6l-4 .9"/>`,
  pinned: `<path d="M12 2.8v9.6M7.8 8.2 12 12.4l4.2-4.2"/><path d="M3.5 16.5h17M6.5 20.5h11"/>`,
  // Gas: the M2 mask's lenses and canister; the cloud.
  mask: `<path d="M5.8 9.6C5.8 5.8 8.6 3 12 3s6.2 2.8 6.2 6.6v2.6c0 3.2-1.9 5.4-4 6.8H9.8c-2.1-1.4-4-3.6-4-6.8Z"/><circle cx="9.3" cy="10" r="1.9"/><circle cx="14.7" cy="10" r="1.9"/><path d="M10.2 19v2.4h3.6V19"/>`,
  gas: `<path d="M7.2 15.4a3.9 3.9 0 1 1 1.1-7.6 5.2 5.2 0 0 1 9.8 1.9 3 3 0 0 1-.6 5.7Z"/><path d="M5 19.6c1.6-1.2 3.2-1.2 4.8 0s3.2 1.2 4.8 0 3.2-1.2 4.8 0"/>`,
  // Breath: a pair of lungs.
  breath: `<path d="M12 3.5v6.8M12 8.6c-.8 1.9-2.4 2.4-3.6 2.4M12 8.6c.8 1.9 2.4 2.4 3.6 2.4"/><path d="M8.6 6.8c-3 0-5 4.2-5 8.6 0 3 1.4 4.2 3.4 4.2 2.4 0 3.1-1.8 3.1-3.9V9Z"/><path d="M15.4 6.8c3 0 5 4.2 5 8.6 0 3-1.4 4.2-3.4 4.2-2.4 0-3.1-1.8-3.1-3.9V9Z"/>`,
  // Wounds and their fates.
  wound: `<path d="M5.6 14.9 14.9 5.6a3 3 0 0 1 4.3 4.3l-9.3 9.3a3 3 0 0 1-4.3-4.3Z"/><circle class="f" cx="11" cy="11" r=".75"/><circle class="f" cx="13" cy="11" r=".75"/><circle class="f" cx="11" cy="13" r=".75"/><circle class="f" cx="13" cy="13" r=".75"/>`,
  stretcher: `<circle cx="6.6" cy="10" r="1.9"/><path d="M9.4 11.6h9.2v2M2.6 14.2h18.8M5.4 14.2v3.4M18.6 14.2v3.4"/>`,
  carried: `<circle cx="6.6" cy="12" r="1.9"/><path d="M9.4 13.6h9.2v2M2.6 16.2h18.8M5.4 16.2v3.2M18.6 16.2v3.2M12.5 5.5h7M17 3l2.5 2.5L17 8"/>`,
  "aid-post": `<path d="M2.5 20.5h19M5 20.5v-7a7 7 0 0 1 14 0v7"/><path d="M12 10.2v6.6M8.7 13.5h6.6"/>`,
  returned: `<path d="M5.2 12a6.8 6.8 0 1 0 2-4.8"/><path d="M5 3.6v4h4"/><path d="M12 9.4v5.2M9.4 12h5.2"/>`,
  hospital: `<path d="M3.5 12h14M13.2 7l5 5-5 5"/><path d="M5.5 4.2v4.4M3.3 6.4h4.4"/>`,
  killed: `<path d="M12 2.8v18.4M7.4 8h9.2"/>`,
  captured: `<path d="M6 21.2V2.8"/><path d="M6 4h10.6l-2.6 3.6 2.6 3.6H6"/>`,
  // Posture.
  standing: `<circle cx="12" cy="4.4" r="2"/><path d="M12 7v7.2M12 14.2l-3.2 6.6M12 14.2l3.2 6.6M8.4 10h7.2"/>`,
  crouching: `<circle cx="10.4" cy="6.6" r="2"/><path d="M10.8 9.2l1.8 5.6h4.2l-.8 5.4M12.6 14.8l-4.4 1.2-.8 4.4M8 11.6h7.4"/>`,
  prone: `<circle cx="5.2" cy="13.2" r="2"/><path d="M7.8 15h12.6M12.4 15l2.8-4.2h5.4"/>`,
  dugout: `<path d="M2.8 19.4h18.4M6 19.4v-6a6 6 0 0 1 12 0v6"/><path d="M9.4 19.4v-2h2v-2h2"/>`,
  "climbing-out": `<path d="M2.8 19.4h18.4M6 19.4v-6a6 6 0 0 1 12 0v6"/><path d="M12 17v-8M9 11.8l3-3 3 3"/>`,
  parapet: `<path d="M2.5 17h19"/><path d="M4.8 11.2c2.6-3.8 11.8-3.8 14.4 0-2.6 3.8-11.8 3.8-14.4 0Z"/><circle class="f" cx="12" cy="11.2" r="1.7"/>`,
  // Roles: each army's helmet for the men, the caporal's two stripes, the gun.
  "helmet-french": `<path class="f" d="M2.4 16.6c1.3-.9 2.8-1.3 4.2-1.4.2-4.6 2.5-7.7 5.4-7.7s5.2 3.1 5.4 7.7c1.4.1 2.9.5 4.2 1.4-2.8 1.3-16.4 1.3-19.2 0Z"/><path d="M8.4 9.2c.9-3.9 6.3-3.9 7.2 0" stroke-width="1.6"/>`,
  "helmet-german": `<path class="f" d="M3.6 15.4c0-5.4 3.6-9.4 8.6-9.4 4.6 0 7.8 3.6 7.8 8.2v1.4c0 1.2.9 2.2 2.2 2.6h-5c-1.1 0-1.7-.8-1.7-1.9v-.9Z"/>`,
  leader: `<path d="M5 15.5l8-8M9.5 20l8-8" stroke-width="2.6"/>`,
  rifle: `<path d="M2.6 16.8 19.4 6.6M19.4 6.6l2.2-1.1M14.6 9.6l1.9 3.1M2.6 16.8l-.4 2.9 3.8-1.6 1-2.4"/>`,
  "machine-gun": `<path d="M2.8 9.4h12.4M15.2 7.8h5.6v3.2h-5.6ZM6.2 9.4v2.2M11 9.4 8 20.4M11 9.4l3 11M9.2 15.4h3.6"/>`,
  grenade: `<path d="M17.4 14.2a5.4 6.4 0 1 1-10.8 0 5.4 6.4 0 0 1 10.8 0Z"/><path d="M6.6 14.2h10.8M12 7.8v12.8M10 7.8V5.2h4v2.6M14 5.2l3.4 2.4"/>`,
  // Orders.
  follow: `<circle cx="12" cy="4.8" r="2"/><path d="M12 7.4v5.8M9 9.8h6"/><circle class="f" cx="7.6" cy="17.6" r="1.25"/><circle class="f" cx="12" cy="19.4" r="1.25"/><circle class="f" cx="16.4" cy="17.6" r="1.25"/>`,
  hold: `<path d="M12 2.8l7 2.9v5.8c0 4.4-3 7.6-7 9.4-4-1.8-7-5-7-9.4V5.7Z"/><path d="M12 7v9.6"/>`,
  advance: `<path d="M4 20 15.6 8.4M10 8.2h5.8V14"/><circle cx="18.6" cy="5.4" r="2"/>`,
  creep: `<path d="M2.6 16c2.4-3 4.6-3 7 0s4.6 3 7 0 3.6-2.4 4.8-1.2"/><path d="M12 12V3.2M9 6.2l3-3 3 3"/>`,
  raid: `<path d="M4 19.6 14.6 9M9.6 8.8h5.2V14"/><path d="M20.4 13.4a4.2 4.2 0 1 1-3.6-7 3.4 3.4 0 0 0 3.6 7Z"/>`,
  // The guns.
  bombard: `<path d="M6 3v9.4M12 3v11.4M18 3v9.4"/><path d="M4.4 10.6 6 13l1.6-2.4M10.4 12.6 12 15l1.6-2.4M16.4 10.6 18 13l1.6-2.4"/><path d="M2.8 19.6h18.4"/>`,
  "fire-mission": `<circle cx="12" cy="12" r="6.8"/><path d="M12 2.4v4M12 17.6v4M2.4 12h4M17.6 12h4"/><circle class="f" cx="12" cy="12" r="1.6"/>`,
  "gas-shoot": `<path d="M7.4 2.8v6.4M5.4 7.4l2 2.6 2-2.6"/><path d="M9.2 19.6a3.6 3.6 0 1 1 1-7 4.8 4.8 0 0 1 9 1.7 2.8 2.8 0 0 1-.6 5.3Z"/>`,
  whistle: `<path d="M2.6 8.8h10.2M2.6 8.8v4h6.6"/><path d="M12.8 8.8h2.4a5.6 5.6 0 1 1-6 5.6"/><path d="M12.2 5.4l1.4 2.6"/><circle class="f" cx="15" cy="14.4" r="1.6"/>`,
  rocket: `<path d="M12 2.6l2.6 4v7.2H9.4V6.6Z"/><path d="M12 13.8v7.6M9 18.4l3 3 3-3"/>`,
  shell: `<path d="M9 21.2v-9.6c0-4.2 1.4-7.2 3-8.4 1.6 1.2 3 4.2 3 8.4v9.6ZM9 17.2h6"/>`,
  "shell-heavy": `<path d="M7.4 21.2v-9c0-5 2.4-8.4 4.6-9.6 2.2 1.2 4.6 4.6 4.6 9.6v9ZM7.4 16.4h9.2M7.4 18.6h9.2"/>`,
  shrapnel: `<path d="M6.4 21.2v-9.6c0-4.2 1.4-7.2 3-8.4 1.6 1.2 3 4.2 3 8.4v9.6ZM6.4 17.2h6"/><circle class="f" cx="18" cy="6.4" r="1.1"/><circle class="f" cx="20.2" cy="10.6" r="1.1"/><circle class="f" cx="17.2" cy="13.6" r="1.1"/>`,
  // Ground, light and weather acting on a man.
  mud: `<path d="M2.8 17.6c2-1.4 4-1.4 6 0s4 1.4 6 0 4-1.4 6 0M2.8 21c2-1.4 4-1.4 6 0s4 1.4 6 0 4-1.4 6 0"/><path d="M10 13.6c-1.6-2-1.2-8 1.6-9 2.1-.6 3.2 1 3.2 3.2 0 2.6-1.6 3.9-1.6 5.8Z"/>`,
  snow: `<path d="M12 2.8v18.4M4 7.4l16 9.2M4 16.6l16-9.2M9.4 4.4l2.6 2 2.6-2M9.4 19.6l2.6-2 2.6 2"/>`,
  wire: `<path d="M2.2 12.4c3.3-1.2 6.5 1.2 9.8 0s6.5-1.2 9.8 0"/><path d="M5.6 9.2l2.4 6M8 9.2l-2.4 6M16 9.2l2.4 6M18.4 9.2l-2.4 6"/>`,
  moon: `<path d="M15.6 3.4a8.6 8.6 0 1 0 5 13.4 7 7 0 0 1-5-13.4Z"/>`,
  sun: `<circle cx="12" cy="12" r="4"/><path d="M12 2.4v2.4M12 19.2v2.4M2.4 12h2.4M19.2 12h2.4M5.2 5.2l1.7 1.7M17.1 17.1l1.7 1.7M5.2 18.8l1.7-1.7M17.1 6.9l1.7-1.7"/>`,
  horizon: `<path d="M2.4 17.2h19.2M6.8 20.6h10.4"/><path d="M7 17.2a5 5 0 0 1 10 0"/><path d="M12 6.4v2.4M5.2 10.2l1.6 1.6M18.8 10.2l-1.6 1.6M2.8 14h1.6M19.6 14h1.6"/>`,
  fair: `<path d="M8 2.6v1.6M2.6 8h1.6M4.4 4.4l1.1 1.1M11.6 4.4l-1.1 1.1"/><path d="M5.4 9.8A2.8 2.8 0 1 1 10.6 7"/><path d="M8.6 19.6a3.5 3.5 0 1 1 1-6.8 4.6 4.6 0 0 1 8.6 1.4 2.8 2.8 0 0 1-.6 5.4Z"/>`,
  overcast: `<path d="M7 18.8a4.6 4.6 0 1 1 1.4-9 5.8 5.8 0 0 1 10.8 2 3.6 3.6 0 0 1-.6 7Z"/>`,
  fog: `<path d="M3 7.6h18M5.4 11.6h13.2M3 15.6h18M7.2 19.6h9.6"/>`,
  drizzle: `<path d="M7 14.6a4.2 4.2 0 1 1 1.3-8.2 5.4 5.4 0 0 1 10 1.8 3.2 3.2 0 0 1-.6 6.4Z"/><circle class="f" cx="8.6" cy="19" r=".95"/><circle class="f" cx="12.6" cy="20.4" r=".95"/><circle class="f" cx="16.6" cy="19" r=".95"/>`,
  rain: `<path d="M7 14.6a4.2 4.2 0 1 1 1.3-8.2 5.4 5.4 0 0 1 10 1.8 3.2 3.2 0 0 1-.6 6.4Z"/><path d="M8.6 17.4 7.2 21M12.6 17.4 11.2 21M16.6 17.4 15.2 21"/>`,
  storm: `<path d="M7 14.6a4.2 4.2 0 1 1 1.3-8.2 5.4 5.4 0 0 1 10 1.8 3.2 3.2 0 0 1-.6 6.4Z"/><path d="M12.8 13.6l-2.6 4h3.2l-2 4"/>`,
  snowfall: `<path d="M7 14.6a4.2 4.2 0 1 1 1.3-8.2 5.4 5.4 0 0 1 10 1.8 3.2 3.2 0 0 1-.6 6.4Z"/><path d="M8.6 17.4v3.2M7 19h3.2M15.4 17.4v3.2M13.8 19H17"/>`,
  flare: `<path d="M6.2 8.2a5.8 5.8 0 0 1 11.6 0Z"/><path d="M6.2 8.2l5.8 6 5.8-6M12 8.2v6"/><circle class="f" cx="12" cy="16.8" r="2"/><path d="M12 20.2v1.6M8.8 18.8l-1.4 1.4M15.2 18.8l1.4 1.4"/>`,
  cold: `<path d="M10 14.6V5a2 2 0 0 1 4 0v9.6a4 4 0 1 1-4 0Z"/><circle class="f" cx="12" cy="17.8" r="1.6"/>`,
  // The battle log's kinds, the sector and its strength.
  alarm: `<path d="M12 3.2 21.6 20H2.4Z"/><path d="M12 9.2v5"/><circle class="f" cx="12" cy="17" r="1.1"/>`,
  pennant: `<path d="M6 21.2V2.8M6 4l12 4.6-12 4.6"/>`,
  burst: `<path d="M12 2.4l1.9 5.6 5.6-2.6-2.7 5.4 5.8 1.9-5.8 1.9 2.7 5.4-5.6-2.6-1.9 5.6-1.9-5.6-5.6 2.6 2.7-5.4-5.8-1.9 5.8-1.9-2.7-5.4 5.6 2.6Z"/>`,
  men: `<circle cx="6" cy="9" r="2.1"/><circle cx="12" cy="7.6" r="2.1"/><circle cx="18" cy="9" r="2.1"/><path d="M2.8 18.4c0-3 1.4-5.2 3.2-5.2s3.2 2.2 3.2 5.2M8.8 17c0-3 1.4-5.4 3.2-5.4s3.2 2.4 3.2 5.4M14.8 18.4c0-3 1.4-5.2 3.2-5.2s3.2 2.2 3.2 5.2"/>`,
  arrow: `<path d="M12 20.4V3.6M6.6 9 12 3.6 17.4 9"/>`,
  clock: `<circle cx="12" cy="12" r="8.6"/><path d="M12 6.8V12l3.4 2.2"/>`
} as const

export type IconName = keyof typeof ICONS

const SVG = "http://www.w3.org/2000/svg"
const SPRITE_ID = "hud-icon-sprite"

/** Puts the sprite in the page, once: every `icon()` refers to its symbols. */
export function installIcons(parent: HTMLElement): void {
  if (document.getElementById(SPRITE_ID)) {
    return
  }
  const sprite = document.createElementNS(SVG, "svg")
  sprite.id = SPRITE_ID
  sprite.setAttribute("aria-hidden", "true")
  sprite.style.position = "absolute"
  sprite.style.width = "0"
  sprite.style.height = "0"
  sprite.style.overflow = "hidden"
  sprite.innerHTML = Object.entries(ICONS)
    .map(
      ([name, markup]) =>
        `<symbol id="hud-i-${name}" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.75" ` +
        `stroke-linecap="round" stroke-linejoin="round">${markup.replaceAll('class="f"', 'fill="currentColor" stroke="none"')}</g></symbol>`
    )
    .join("")
  parent.prepend(sprite)
}

/** One icon, drawn from the sprite at the size of its font unless CSS says otherwise. */
export function icon(name: IconName, className = ""): SVGSVGElement {
  const svg = document.createElementNS(SVG, "svg")
  svg.setAttribute("class", `hud-icon ${className}`.trim())
  svg.setAttribute("aria-hidden", "true")
  const use = document.createElementNS(SVG, "use")
  use.setAttribute("href", `#hud-i-${name}`)
  svg.append(use)
  return svg
}

/** Points an icon already drawn at another symbol. */
export function setIcon(svg: SVGSVGElement, name: IconName): void {
  const use = svg.firstElementChild
  const href = `#hud-i-${name}`
  if (use && use.getAttribute("href") !== href) {
    use.setAttribute("href", href)
  }
}
