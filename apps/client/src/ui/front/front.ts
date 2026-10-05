import type { Season } from "@verdun/sim"

/**
 * The Western Front as the war map shows it (S15 in docs/design/interface.md, docs/design/war-map-and-season.md): the
 * line from the North Sea to Switzerland in each season, the theatres each season opens, and Verdun's sectors, of which
 * Fleury is the one built.
 *
 * Positions are longitude and latitude in degrees. The lines are traced through the villages they ran by, from period
 * maps, accurate to a kilometre or two: right for a map of the whole front, not for a trench map.
 */

/** The war's seasons, as the simulation's calendar counts them; named here so the menus needn't load the simulation. */
export const SEASONS: readonly Season[] = [1914, 1915, 1916, 1917, 1918]

/** A point as longitude and latitude, in degrees. */
export type LonLat = readonly [number, number]

/** The line, north to south, from the Yser to Arras. Unchanged from late 1914 to the spring of 1918. */
const FLANDERS_AND_ARTOIS: readonly LonLat[] = [
  [2.74, 51.14], // Nieuport
  [2.8, 51.09],
  [2.84, 51.03], // Diksmuide
  [2.88, 50.92], // Steenstrate
  [2.9, 50.89], // Boezinge
  [2.95, 50.87], // Wieltje
  [2.96, 50.845], // Hooge
  [2.93, 50.82], // Hill 60
  [2.9, 50.81], // Saint-Éloi
  [2.87, 50.78],
  [2.89, 50.73], // Ploegsteert
  [2.92, 50.69], // Armentières
  [2.86, 50.62], // Fromelles
  [2.78, 50.58], // Neuve-Chapelle
  [2.74, 50.54], // Festubert
  [2.78, 50.47], // Loos
  [2.77, 50.4], // Souchez, Vimy
  [2.79, 50.32],
  [2.8, 50.29] // Arras
]

/** Arras to Soissons, before the Germans fell back to the Hindenburg Line in March 1917. */
const PICARDY_1915: readonly LonLat[] = [
  [2.73, 50.22], // Ransart
  [2.66, 50.14], // Hébuterne
  [2.66, 50.1], // Serre
  [2.68, 50.05], // Thiepval
  [2.71, 49.99], // Fricourt
  [2.79, 49.98], // Maricourt
  [2.83, 49.94], // Frise, on the Somme
  [2.8, 49.88], // Dompierre
  [2.77, 49.82], // Lihons
  [2.73, 49.73], // Andechy
  [2.8, 49.62], // Lassigny
  [2.93, 49.52], // Ribécourt
  [3.04, 49.46], // Tracy-le-Mont
  [3.2, 49.42], // Nouvron
  [3.33, 49.41] // Crouy, above Soissons
]

/** Arras to Laffaux along the Hindenburg Line, from March 1917. */
const HINDENBURG_LINE: readonly LonLat[] = [
  [2.86, 50.26], // Monchy-le-Preux
  [2.88, 50.2], // Croisilles
  [2.94, 50.18], // Bullecourt
  [3.03, 50.15], // Quéant
  [3.09, 50.1], // Havrincourt
  [3.15, 50.03], // Villers-Guislain
  [3.23, 49.96], // Bellicourt
  [3.24, 49.87], // Saint-Quentin
  [3.3, 49.78], // Moy
  [3.37, 49.65], // La Fère
  [3.4, 49.55], // Barisis
  [3.44, 49.46] // Laffaux
]

/** Along the Aisne below the Chemin des Dames, held by the Germans from September 1914. */
const AISNE_1914: readonly LonLat[] = [
  [3.52, 49.42], // Vailly
  [3.68, 49.43], // Troyon
  [3.79, 49.42], // below Craonne
  [3.9, 49.4] // Berry-au-Bac
]

/** On the Chemin des Dames ridge, taken by the French in 1917. */
const AISNE_1917: readonly LonLat[] = [
  [3.52, 49.455], // La Malmaison
  [3.68, 49.46], // Cerny
  [3.79, 49.445], // Craonne
  [3.9, 49.4] // Berry-au-Bac
]

/** Reims and Champagne to the Argonne. */
const CHAMPAGNE: readonly LonLat[] = [
  [3.98, 49.33], // facing Brimont
  [4.05, 49.3], // La Neuvillette
  [4.12, 49.22], // La Pompelle
  [4.27, 49.2], // Prosnes
  [4.42, 49.2], // Auberive
  [4.55, 49.21], // Souain, Perthes
  [4.72, 49.19], // Massiges
  [4.83, 49.19], // Ville-sur-Tourbe
  [4.93, 49.21], // Four-de-Paris, in the Argonne
  [5.02, 49.22], // Boureuilles
  [5.07, 49.2], // Vauquois
  [5.13, 49.21] // Avocourt
]

/** Verdun's front before the German offensive of 21 February 1916. */
const VERDUN_FEBRUARY_1916: readonly LonLat[] = [
  [5.17, 49.24], // Malancourt
  [5.24, 49.26], // Béthincourt
  [5.29, 49.29], // Forges
  [5.33, 49.29], // Brabant, on the Meuse
  [5.37, 49.3], // Haumont
  [5.4, 49.285], // Bois des Caures
  [5.45, 49.28], // Herbebois
  [5.48, 49.25], // Ornes
  [5.54, 49.22], // Fromezey
  [5.6, 49.17], // Eix
  [5.62, 49.13] // Manheulles
]

/** Verdun's front at the end of June 1916, with Fleury taken and Fort Vaux fallen. */
const VERDUN_JUNE_1916: readonly LonLat[] = [
  [5.21, 49.21], // below Hill 304
  [5.27, 49.215], // below Le Mort-Homme
  [5.31, 49.225], // Cumières
  [5.36, 49.23], // Côte du Poivre
  [5.4, 49.212], // Froideterre
  [5.425, 49.197], // Fleury
  [5.45, 49.193], // Bois Fumin
  [5.47, 49.19], // below Fort Vaux
  [5.5, 49.19], // Damloup
  [5.55, 49.17], // Eix
  [5.62, 49.13] // Manheulles
]

/** Verdun's front after the French took back the forts in late 1916 and the heights in August 1917. */
const VERDUN_1917: readonly LonLat[] = [
  [5.19, 49.235], // Hill 304
  [5.27, 49.24], // Le Mort-Homme
  [5.33, 49.255], // Samogneux
  [5.37, 49.255], // Côte 344
  [5.4, 49.245], // Louvemont
  [5.47, 49.235], // Bezonvaux
  [5.52, 49.21],
  [5.57, 49.16],
  [5.62, 49.13] // Manheulles
]

/** Les Éparges round the Saint-Mihiel salient, across Lorraine and down the Vosges to Switzerland. */
const LORRAINE_AND_VOSGES: readonly LonLat[] = [
  [5.6, 49.07], // Les Éparges
  [5.57, 49.01], // Tranchée de Calonne
  [5.54, 48.92], // Chauvoncourt, at Saint-Mihiel
  [5.56, 48.88], // Ailly
  [5.62, 48.87], // Apremont
  [5.79, 48.87], // Seicheprey
  [5.85, 48.88], // Flirey
  [5.98, 48.91], // Bois-le-Prêtre
  [6.06, 48.92], // above Pont-à-Mousson
  [6.2, 48.87], // Nomeny
  [6.35, 48.8], // Moncel
  [6.53, 48.73], // Arracourt
  [6.7, 48.63], // Domèvre
  [6.85, 48.55],
  [6.9, 48.48], // Badonviller
  [7.02, 48.37], // Ban-de-Sapt
  [7.1, 48.17], // Col du Bonhomme
  [7.14, 48.07], // Le Linge
  [7.12, 47.95], // Metzeral
  [7.15, 47.86], // Hartmannswillerkopf
  [7.1, 47.79], // Thann
  [7.16, 47.69], // Burnhaupt
  [7.15, 47.58],
  [7.16, 47.49] // the Swiss border at Pfetterhouse
]

/** The front in a season, north to south, and what moment of the year it shows. */
export interface FrontLine {
  readonly caption: string
  readonly points: readonly LonLat[]
}

const LINE_1915 = [
  ...FLANDERS_AND_ARTOIS,
  ...PICARDY_1915,
  ...AISNE_1914,
  ...CHAMPAGNE,
  ...VERDUN_FEBRUARY_1916,
  ...LORRAINE_AND_VOSGES
]
const LINE_1917 = [
  ...FLANDERS_AND_ARTOIS,
  ...HINDENBURG_LINE,
  ...AISNE_1917,
  ...CHAMPAGNE,
  ...VERDUN_1917,
  ...LORRAINE_AND_VOSGES
]

export const FRONT_LINES: Readonly<Record<Season, FrontLine>> = {
  1914: { caption: "The line as it set in December 1914", points: LINE_1915 },
  1915: { caption: "The line through 1915", points: LINE_1915 },
  1916: {
    caption: "The line in June 1916",
    points: [
      ...FLANDERS_AND_ARTOIS,
      ...PICARDY_1915,
      ...AISNE_1914,
      ...CHAMPAGNE,
      ...VERDUN_JUNE_1916,
      ...LORRAINE_AND_VOSGES
    ]
  },
  1917: { caption: "The line in late 1917, after the Hindenburg withdrawal", points: LINE_1917 },
  1918: { caption: "The line at the start of 1918, before the spring offensives", points: LINE_1917 }
}

/** Verdun's line before the battle, drawn faintly on the Verdun map in 1916 to show the ground the battle took. */
export const VERDUN_BEFORE_THE_BATTLE: readonly LonLat[] = [
  CHAMPAGNE[CHAMPAGNE.length - 1]!,
  ...VERDUN_FEBRUARY_1916,
  LORRAINE_AND_VOSGES[0]!
]

/** One of Verdun's sectors: a sector battle of its own on the war map. */
export interface Sector {
  readonly id: string
  readonly name: string
  readonly at: LonLat
  readonly bank: "right" | "left"
  readonly keyPoints: string
  readonly character: string
  /** Whether it can be played now: only Fleury is built. */
  readonly open: boolean
}

/** Verdun's sectors (docs/design/war-map-and-season.md#the-war-map), north to south, the right bank first. */
export const VERDUN_SECTORS: readonly Sector[] = [
  {
    id: "bois-des-caures",
    name: "Bois des Caures",
    at: [5.405, 49.282],
    bank: "right",
    keyPoints: "The wood, Driant's redoubts",
    character: "Woods and broken sight lines, where the battle opened on 21 February 1916",
    open: false
  },
  {
    id: "douaumont",
    name: "Douaumont",
    at: [5.439, 49.217],
    bank: "right",
    keyPoints: "Fort Douaumont, the village",
    character: "The great fort on the crest: shelter and observation over the whole field",
    open: false
  },
  {
    id: "thiaumont",
    name: "Thiaumont–Froideterre",
    at: [5.41, 49.209],
    bank: "right",
    keyPoints: "The Thiaumont work, the Froideterre ridge",
    character: "Concrete shelters on open ridges, taken and retaken through the summer",
    open: false
  },
  {
    id: "vaux",
    name: "Vaux",
    at: [5.471, 49.2],
    bank: "right",
    keyPoints: "Fort Vaux, the village, the pond",
    character: "A smaller fort with ravines on either side; it fell on 7 June 1916 for want of water",
    open: false
  },
  {
    id: "fleury",
    name: "Fleury",
    at: [5.427, 49.196],
    bank: "right",
    keyPoints: "The village, the crossroads, Ravin de la Dame",
    character: "Ruins where the lines close: the village changed hands sixteen times",
    open: true
  },
  {
    id: "souville",
    name: "Souville",
    at: [5.437, 49.183],
    bank: "right",
    keyPoints: "Fort Souville",
    character: "The last ridge before Verdun, where the German offensive was stopped in July 1916",
    open: false
  },
  {
    id: "mort-homme",
    name: "Le Mort-Homme",
    at: [5.259, 49.228],
    bank: "left",
    keyPoints: "The twin crests of the hill",
    character: "Bare chalk heights over the Meuse, fought for from March to May 1916",
    open: false
  },
  {
    id: "hill-304",
    name: "Hill 304",
    at: [5.217, 49.222],
    bank: "left",
    keyPoints: "The crest",
    character: "Shelled so hard the hill lost several metres of height",
    open: false
  }
]

/** A theatre of the war: a stretch of the front where a season's battles are fought. */
export interface Theatre {
  readonly id: string
  readonly name: string
  readonly at: LonLat
  /** The seasons it is open in. */
  readonly seasons: readonly Season[]
  readonly summary: string
  /** Its sectors, where they have been drawn up. */
  readonly sectors?: readonly Sector[]
}

export const THEATRES: readonly Theatre[] = [
  {
    id: "marne",
    name: "The Marne",
    at: [3.55, 48.95],
    seasons: [1914, 1918],
    summary: "Where the German advance on Paris was turned in September 1914, and again in July 1918"
  },
  {
    id: "aisne",
    name: "The Aisne",
    at: [3.55, 49.4],
    seasons: [1914],
    summary: "Where the retreating Germans turned and dug in above the river: the first trenches of the war"
  },
  {
    id: "artois",
    name: "Artois",
    at: [2.77, 50.38],
    seasons: [1915],
    summary: "The French offensives against Vimy Ridge and Notre-Dame-de-Lorette, May and September 1915"
  },
  {
    id: "champagne",
    name: "Champagne",
    at: [4.55, 49.2],
    seasons: [1915],
    summary: "Chalk downs east of Reims: the French winter and autumn offensives of 1915"
  },
  {
    id: "argonne",
    name: "The Argonne",
    at: [4.97, 49.22],
    seasons: [1914, 1915, 1918],
    summary: "A dense forest where the lines lay yards apart: mines, grenades and flamethrowers"
  },
  {
    id: "eparges",
    name: "Les Éparges",
    at: [5.6, 49.07],
    seasons: [1915],
    summary: "A ridge over the Woëvre plain, torn open by mines through 1915"
  },
  {
    id: "verdun",
    name: "Verdun",
    at: [5.39, 49.2],
    seasons: [1914, 1916, 1917],
    summary: "The fortress on the Meuse: the German offensive of February 1916, and ten months of battle",
    sectors: VERDUN_SECTORS
  },
  {
    id: "somme",
    name: "The Somme",
    at: [2.76, 49.96],
    seasons: [1916],
    summary: "The Franco-British offensive from 1 July 1916, which drew German guns and men away from Verdun"
  },
  {
    id: "chemin-des-dames",
    name: "The Chemin des Dames",
    at: [3.7, 49.44],
    seasons: [1917, 1918],
    summary: "The ridge where the Nivelle offensive failed in April 1917, and the Germans broke through in May 1918"
  },
  {
    id: "malmaison",
    name: "La Malmaison",
    at: [3.47, 49.47],
    seasons: [1917],
    summary: "Pétain's limited attack of October 1917: the ridge taken behind a crushing bombardment"
  }
]

/** Towns to find the way by. `occupied` towns lay behind the German lines all war. */
export interface Town {
  readonly name: string
  readonly at: LonLat
  readonly occupied?: boolean
  /** Which maps show it: the front's (the default), Verdun's, or both. */
  readonly maps?: "front" | "verdun" | "both"
  readonly capital?: boolean
}

export const TOWNS: readonly Town[] = [
  { name: "Paris", at: [2.35, 48.86], capital: true },
  { name: "Calais", at: [1.86, 50.95] },
  { name: "Ypres", at: [2.89, 50.85] },
  { name: "Lille", at: [3.06, 50.63], occupied: true },
  { name: "Arras", at: [2.78, 50.29] },
  { name: "Amiens", at: [2.3, 49.89] },
  { name: "Saint-Quentin", at: [3.29, 49.85], occupied: true },
  { name: "Compiègne", at: [2.83, 49.42] },
  { name: "Soissons", at: [3.32, 49.38] },
  { name: "Reims", at: [4.03, 49.26] },
  { name: "Châlons", at: [4.36, 48.96] },
  { name: "Bar-le-Duc", at: [5.16, 48.77], maps: "both" },
  // Named by its theatre on the front's map.
  { name: "Verdun", at: [5.385, 49.16], maps: "verdun" },
  { name: "Saint-Mihiel", at: [5.54, 48.89], occupied: true },
  { name: "Metz", at: [6.18, 49.12], occupied: true },
  { name: "Nancy", at: [6.18, 48.69] },
  { name: "Strasbourg", at: [7.75, 48.58], occupied: true },
  { name: "Belfort", at: [6.86, 47.64] },
  { name: "Brussels", at: [4.35, 50.85], occupied: true },
  { name: "Luxembourg", at: [6.13, 49.61], occupied: true }
]

/** The forts and villages round Verdun, shown on its map. */
export const VERDUN_PLACES: readonly { readonly name: string; readonly at: LonLat; readonly fort?: boolean }[] = [
  { name: "Fort Douaumont", at: [5.4388, 49.2165], fort: true },
  { name: "Fort Vaux", at: [5.4707, 49.2003], fort: true },
  { name: "Fort Souville", at: [5.4375, 49.1867], fort: true },
  { name: "Fort Tavannes", at: [5.468, 49.177], fort: true },
  { name: "Fort Moulainville", at: [5.5, 49.165], fort: true },
  { name: "Fort Belleville", at: [5.39, 49.18], fort: true },
  { name: "Samogneux", at: [5.335, 49.256] },
  { name: "Beaumont", at: [5.41, 49.265] },
  { name: "Ornes", at: [5.476, 49.25] },
  { name: "Louvemont", at: [5.4, 49.245] },
  { name: "Bezonvaux", at: [5.47, 49.235] },
  { name: "Bras", at: [5.37, 49.21] },
  { name: "Cumières", at: [5.29, 49.235] },
  { name: "Esnes", at: [5.21, 49.205] },
  { name: "Charny", at: [5.35, 49.2] },
  { name: "Eix", at: [5.55, 49.17] }
]

/** What each season is, as the war map tells it (docs/design/war-map-and-season.md#the-years). */
export const SEASON_NOTES: Readonly<Record<Season, string>> = {
  1914: "The war of movement ends in the first trenches: shallow, with little wire, and no gas masks yet.",
  1915: "French offensives against German lines that dig deeper each month. Gas arrives in April, the steel helmet in the autumn.",
  1916: "Verdun: the German offensive from February, the forts and Fleury in June, the French counter-offensive in the autumn.",
  1917: "The Germans fall back to the Hindenburg Line. The Nivelle offensive fails in April, and the French army mutinies.",
  1918: "Storm troops break the line and reach the Marne; from July the French and the Americans push them back."
}

/** The 1916 arc: how the pressure on each side shifts through the year (docs/design/war-map-and-season.md#the-1916-arc). */
const ARC_1916: readonly { readonly until: number; readonly months: string; readonly text: string }[] = [
  { until: 7, months: "January–February", text: "The quiet before Verdun: raids and wiring, the German build-up" },
  { until: 17, months: "February–April", text: "The German offensive, on a huge stockpile of shells" },
  { until: 26, months: "May–June", text: "The battle for the forts and Fleury; phosgene arrives" },
  { until: 39, months: "July–September", text: "The Somme draws German guns and men away" },
  { until: 52, months: "October–December", text: "The French counter-offensive, with the heavy guns" }
]

/** Where the season's arc stands in a turn of it: "May–June: the battle for the forts and Fleury". Null outside 1916. */
export function seasonPhase(season: Season, turn: number): string | null {
  if (season !== 1916) {
    return null
  }
  const phase = ARC_1916.find((each) => turn <= each.until) ?? ARC_1916[ARC_1916.length - 1]!
  return `${phase.months}: ${phase.text.charAt(0).toLowerCase()}${phase.text.slice(1)}`
}

/** The theatres open in a season. */
export function theatresOf(season: Season): Theatre[] {
  return THEATRES.filter((theatre) => theatre.seasons.includes(season))
}

/** The sector that can be played now. */
export const OPEN_SECTOR: Sector = VERDUN_SECTORS.find((sector) => sector.open)!
