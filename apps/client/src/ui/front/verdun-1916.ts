/**
 * What happened at Verdun in the week being fought, one line for the front door and the loading (S6 in
 * docs/design/interface.md), from docs/research/notes/history/verdun-1916.md. Lines say what was true of the battle
 * that week; the game's own battle may go otherwise.
 */

const DAY = 86_400_000

const EVENTS: readonly { readonly on: number; readonly text: string }[] = [
  {
    on: Date.UTC(1916, 0, 1),
    text: "The Verdun salient is quiet. Behind the German lines, guns and shells gather in the woods."
  },
  {
    on: Date.UTC(1916, 1, 12),
    text: "The German offensive, set for 12 February, waits on snow and fog; the French use the days to bring up men."
  },
  {
    on: Date.UTC(1916, 1, 21),
    text: "21 February: over a thousand German guns open on the salient, and their infantry goes forward at dusk."
  },
  {
    on: Date.UTC(1916, 1, 25),
    text: "Fort Douaumont, stripped of its guns and garrison, falls almost without a fight. Pétain takes command."
  },
  {
    on: Date.UTC(1916, 2, 6),
    text: "The Germans carry the attack to the left bank of the Meuse, against Le Mort-Homme and Hill 304."
  },
  {
    on: Date.UTC(1916, 2, 20),
    text: "On the one road up from Bar-le-Duc, a lorry passes every few seconds, day and night."
  },
  {
    on: Date.UTC(1916, 3, 10),
    text: "Pétain's order of the day ends with words the army will repeat: “Courage! On les aura!”"
  },
  {
    on: Date.UTC(1916, 4, 1),
    text: "Nivelle succeeds Pétain at the head of the Second Army, which holds Verdun."
  },
  {
    on: Date.UTC(1916, 4, 22),
    text: "Mangin's men break into Fort Douaumont, and are thrown out of it two days later."
  },
  {
    on: Date.UTC(1916, 4, 29),
    text: "The Germans take the crest of Le Mort-Homme, after Hill 304 earlier in the month."
  },
  {
    on: Date.UTC(1916, 5, 2),
    text: "The Germans close on Fort Vaux; its garrison fights them in the corridors underground."
  },
  {
    on: Date.UTC(1916, 5, 7),
    text: "Fort Vaux surrenders on 7 June, its garrison without water."
  },
  {
    on: Date.UTC(1916, 5, 23),
    text: "Behind a barrage of phosgene shells, the Germans take Thiaumont and Fleury and reach the slopes of Souville."
  },
  {
    on: Date.UTC(1916, 6, 1),
    text: "The Somme offensive opens; German guns and men begin to be drawn away from Verdun."
  },
  {
    on: Date.UTC(1916, 6, 11),
    text: "The last German attack on Fort Souville fails. The Germans go over to the defensive at Verdun."
  },
  {
    on: Date.UTC(1916, 7, 18),
    text: "Colonial infantry retake the ruins of Fleury."
  },
  {
    on: Date.UTC(1916, 7, 29),
    text: "Hindenburg replaces Falkenhayn at the head of the German army; within days the offensive is called off."
  },
  {
    on: Date.UTC(1916, 9, 24),
    text: "In fog, after a bombardment by 400 mm railway guns, the French retake Fort Douaumont."
  },
  {
    on: Date.UTC(1916, 10, 2),
    text: "The Germans abandon Fort Vaux, and the French walk back in."
  },
  {
    on: Date.UTC(1916, 11, 15),
    text: "A last French attack takes back Louvemont and Bezonvaux. The battle of Verdun ends on 18 December."
  }
]

/** How long after an event its line still stands for a week with nothing newer. */
const STANDS = 21 * DAY

/** The line for the week beginning `week` (00:00 UTC on its first day), or null for a week with nothing to say. */
export function weekAtVerdun(week: number): string | null {
  const end = week + 7 * DAY
  let latest: (typeof EVENTS)[number] | null = null
  for (const event of EVENTS) {
    if (event.on < end) {
      latest = event
    }
  }
  return latest && end - latest.on <= STANDS + 7 * DAY ? latest.text : null
}
