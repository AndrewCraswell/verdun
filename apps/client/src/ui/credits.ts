import { h } from "../hud/dom.ts"
import type { MenuPage } from "./page.ts"

/** Who made what the game is built from (docs/assets/register.md), with the credit each licence asks for. */
const CREDITS: readonly { readonly heading: string; readonly lines: readonly string[] }[] = [
  {
    heading: "The ground",
    lines: [
      "Terrain of the Fleury sector: © IGN, LiDAR HD, under the Licence Ouverte 2.0.",
      "The map of the front: Natural Earth, in the public domain; the 1871 border and the Aisne sketched from period maps."
    ]
  },
  {
    heading: "The weather of 1914–1918",
    lines: [
      "NOAA-CIRES-DOE 20th Century Reanalysis version 3, under CC-BY 4.0. Support for the Twentieth Century Reanalysis Project version 3 dataset is provided by the U.S. Department of Energy, Office of Science Biological and Environmental Research (BER), by the National Oceanic and Atmospheric Administration Climate Program Office, and by the NOAA Earth System Research Laboratory Physical Sciences Laboratory.",
      "Corrected with Météo-France daily station records, under the Licence Ouverte 2.0."
    ]
  },
  {
    heading: "Type",
    lines: [
      "Archivo, © 2020 The Archivo Project Authors, and Bodoni Moda, © 2020 The Bodoni Moda Project Authors, both under the SIL Open Font License 1.1."
    ]
  },
  {
    heading: "Art and sound",
    lines: [
      "Models and textures from Synty Studios' POLYGON packs; soldiers' animations from polyperfect's Low Poly War Pack.",
      "Sounds from BOOM Library, Pole Position Production, Super Thump and the Sonniss GDC bundles; soldiers' shouts voiced with ElevenLabs."
    ]
  },
  {
    heading: "Built with",
    lines: ["Babylon.js, bitECS, Vite and TypeScript."]
  }
]

/** The credits page, from the menu. */
export function createCreditsPage(): MenuPage {
  const root = h("div", "ui-credits")
  for (const { heading, lines } of CREDITS) {
    root.append(
      h(
        "section",
        "ui-settings-section",
        h("h3", "ui-settings-heading", heading),
        ...lines.map((line) => h("p", "ui-credit", line))
      )
    )
  }
  root.append(
    h(
      "p",
      "ui-credit ui-credit--memorial",
      "Over 700,000 men were killed, wounded or captured at Verdun in 1916. This game is made in their memory."
    )
  )
  return { id: "credits", title: "Credits", root }
}
