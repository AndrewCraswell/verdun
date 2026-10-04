import { type EntityId, Side, type Simulation, type Squad, Weapon } from "@verdun/sim"

/**
 * Who the men of a squad are: name, rank, job and weapon. The simulation has no identities yet (the roster of named men
 * with hometowns and veterancy is a stage 3 feature, docs/design/progression-and-community.md#the-squad-roster), so the
 * HUD names them itself, steadily: a man keeps his name for as long as he's on the field, and no two men of a squad share
 * a surname.
 */

/** A soldier as the men around him know him. */
export interface SoldierName {
  /** His rank in his own army's words: "Caporal", "Gefreiter". */
  readonly rank: string
  readonly given: string
  readonly surname: string
}

/** The jobs in today's squads: its NCO in slot 1, a machine gunner where it has a gun, riflemen. */
export type Role = "leader" | "rifleman" | "gunner"

const ROLE_LABELS: Readonly<Record<Role, string>> = {
  leader: "Squad leader",
  rifleman: "Rifleman",
  gunner: "Machine gunner"
}

/** Splits a list written as words separated by spaces and line breaks. */
function words(list: string): readonly string[] {
  return list.split(/\s+/).filter((word) => word.length > 0)
}

/** Surnames common in the regiments that fought at Verdun, from both armies' recruiting regions. */
const SURNAMES: Readonly<Record<Side, readonly string[]>> = {
  [Side.French]: words(`
    Martin Bernard Dubois Durand Lefèvre Leroy Moreau Simon Laurent Michel Petit Roux Fournier Girard
    Bonnet Dupont Lambert Fontaine Rousseau Vincent Faure André Mercier Blanc Guérin Boyer Garnier
    Chevalier François Legrand Gauthier Perrin Robin Clément Morin Nicolas Henry Roussel Mathieu Masson
    Marchand Duval Denis Dumont Lemaire Noël Dufour Meunier Brun Blanchard Giraud Joly Rivière Lucas
    Brunet Gaillard Barbier Arnaud Gérard Roche Renard Roy Leroux Colin Caron Picard Roger Fabre Aubert
    Lemoine Renaud Dumas Lacroix Olivier Bourgeois Benoît Leclerc Rolland Guillaume Lecomte Dupuy
    Guillot Hubert Berger Carpentier Moulin Deschamps Vasseur Boucher Royer Jacquet Poirier Aubry Guyot
    Charpentier Ménard Maillard Baron Bertin Bailly Hervé Prévost Perrot Cousin Germain Breton Langlois
    Rémy Pelletier Lévêque Leblanc Lebrun Maréchal Boulanger Monnier Michaud Gillet Étienne Tessier
    Chauvin Humbert Barthélemy Cordier Lejeune Delaunay Pasquier Laporte
  `),
  [Side.German]: words(`
    Müller Schmidt Schneider Fischer Weber Meyer Wagner Becker Schulz Hoffmann Schäfer Koch Bauer
    Richter Klein Wolf Schröder Neumann Schwarz Zimmermann Braun Krüger Hartmann Lange Werner Schmitz
    Krause Meier Lehmann Schulze Köhler Herrmann König Walter Mayer Huber Kaiser Fuchs Peters Lang
    Scholz Möller Weiß Jung Hahn Schubert Vogel Friedrich Keller Günther Frank Berger Winkler Roth Beck
    Lorenz Baumann Franke Albrecht Schuster Ludwig Böhm Winter Kraus Schumacher Krämer Vogt Stein Jäger
    Otto Sommer Groß Seidel Heinrich Brandt Haas Schreiber Graf Schulte Dietrich Ziegler Kuhn Pohl
    Engel Horn Busch Bergmann Voigt Sauer Arnold Pfeiffer Kessler Hermann Thiele Schütz Ernst Brenner
    Reuter
  `)
}

/** Given names of men born in the 1880s and 1890s. */
const GIVEN_NAMES: Readonly<Record<Side, readonly string[]>> = {
  [Side.French]: words(`
    Louis Jean Pierre Joseph Marcel Henri André Paul Georges Émile Lucien Albert Eugène Fernand René
    Maurice Gaston Léon Auguste Camille Jules Charles Marius Alphonse Raymond Edmond Victor Alfred
    Ernest Gustave Octave Félix Adrien Désiré Firmin Alexandre Achille Théophile Clovis Aristide
  `),
  [Side.German]: words(`
    Karl Wilhelm Friedrich Heinrich Hermann Otto Paul Walter Ernst Fritz Hans Max August Richard Johann
    Georg Kurt Franz Josef Emil Alfred Gustav Albert Rudolf Erich Arthur Bruno Ludwig Anton Peter
    Konrad Jakob Theodor Robert Oskar Willi Alois Eduard Christian Gottfried
  `)
}

/**
 * Ranks by slot, in each army's own words: the squad's NCO in slot 1 (a French _caporal_ led the half-section's squad,
 * an _Unteroffizier_ the German _Gruppe_), his second in slot 2, and the rest private soldiers.
 */
const RANKS: Readonly<Record<Side, readonly [string, string, string]>> = {
  [Side.French]: ["Caporal", "Soldat de 1re classe", "Soldat"],
  [Side.German]: ["Unteroffizier", "Gefreiter", "Musketier"]
}

/** Each side's 1916 weapons, by kind (docs/design/soldier-and-squad.md#weapons). */
const WEAPON_NAMES: Readonly<Record<Side, Readonly<Record<Weapon, string>>>> = {
  [Side.French]: { [Weapon.Rifle]: "Lebel M1886", [Weapon.MachineGun]: "Hotchkiss M1914" },
  [Side.German]: { [Weapon.Rifle]: "Gewehr 98", [Weapon.MachineGun]: "MG 08" }
}

/** A well-mixed 32-bit hash of a whole number (the finaliser of MurmurHash3). */
function mix(value: number): number {
  let hash = Math.imul(value ^ (value >>> 16), 0x85ebca6b)
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35)
  return (hash ^ (hash >>> 16)) >>> 0
}

function pick<T>(list: readonly T[], seed: number): T {
  const chosen = list[mix(seed) % list.length]
  if (chosen === undefined) {
    throw new Error("Can't pick from an empty list")
  }
  return chosen
}

function sideOf(sim: Simulation, soldier: EntityId): Side {
  return sim.soldiers.side.value[soldier] === Side.German ? Side.German : Side.French
}

/** The names of the men in the field, given once each and kept. */
export interface SquadNames {
  /** A soldier's name and his rank by his slot in his squad. */
  nameOf(sim: Simulation, squad: Squad, soldier: EntityId): SoldierName
}

export function createSquadNames(): SquadNames {
  const named = new Map<EntityId, { readonly given: string; readonly surname: string }>()

  function christen(sim: Simulation, squad: Squad, soldier: EntityId) {
    const side = sideOf(sim, soldier)
    const taken = new Set(
      squad.members.flatMap((member) => {
        const name = named.get(member)
        return member !== soldier && name ? [name.surname] : []
      })
    )
    const surnames = SURNAMES[side]
    let surname = pick(surnames, soldier * 2 + 1)
    for (let attempt = 1; taken.has(surname) && attempt < surnames.length; attempt++) {
      surname = pick(surnames, soldier * 2 + 1 + attempt * 7919)
    }
    const name = { given: pick(GIVEN_NAMES[side], soldier * 2), surname }
    named.set(soldier, name)
    return name
  }

  return {
    nameOf(sim, squad, soldier) {
      const name = named.get(soldier) ?? christen(sim, squad, soldier)
      const slot = squad.members.indexOf(soldier)
      const ranks = RANKS[sideOf(sim, soldier)]
      return { rank: ranks[Math.min(Math.max(slot, 0), 2)] ?? ranks[2], ...name }
    }
  }
}

/** A soldier's job: slot 1 leads, a machine gun makes a gunner, everyone else carries a rifle. */
export function roleOf(sim: Simulation, squad: Squad, soldier: EntityId): Role {
  if (squad.members.indexOf(soldier) === 0) {
    return "leader"
  }
  return sim.soldiers.weapon.kind[soldier] === Weapon.MachineGun ? "gunner" : "rifleman"
}

export function roleLabel(role: Role): string {
  return ROLE_LABELS[role]
}

/** The weapon a soldier carries, by its period name: "Lebel M1886", "MG 08". */
export function weaponName(sim: Simulation, soldier: EntityId): string {
  const kind = sim.soldiers.weapon.kind[soldier] === Weapon.MachineGun ? Weapon.MachineGun : Weapon.Rifle
  return WEAPON_NAMES[sideOf(sim, soldier)][kind]
}
