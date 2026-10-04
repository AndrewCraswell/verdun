# Progression and community

What keeps players coming back, and how they play together. Part of the [game design](overview.md). Mostly stage 3, when
accounts arrive.

## Principles

- **Progression unlocks responsibility and recognition, never power.** A veteran player has the same rifle as a new one.
  What they earn is the right to lead, and the record to show for it.
- **The war is the reward loop.** The daily communiqué, the moving front and the season's outcome are what bring people
  back, more than any unlock.
- **Respect the dead.** Over 700,000 men were killed, wounded or captured at Verdun. The game is about what they went
  through, and its rewards and tone should never make light of it.

## First session

- **A link click reaches gameplay in under 10 seconds** ([vision](../vision.md#platform-and-constraints)). No account,
  no menu: the first session drops the player into a bot sector on the French side, in a quiet hour, with a squad.
- **The first ten minutes teach by doing**: move and shoot, switch soldiers, order the squad, take a bay with grenades,
  then go over the top in a small operation behind a barrage. Short prompts, no separate tutorial level. The stage 1
  prototype battle is close to this already.
- An account is offered after the first operation, to keep the squad, the record and the side.

## The squad roster

Each player's squad is **eight named men** with a hometown, generated from period records of each side's recruitment
regions. The roster lasts the season.

- Men who survive operations gain **veterancy**, up to three marks: steadier morale, faster masking, a little better aim
  (at most 10% over a recruit). Small enough not to unbalance a sector; big enough that losing a three-mark corporal
  hurts.
- The fallen are replaced by recruits at the reserve line. Their names go into the squad's book, and into the season's
  memorial.
- Losing men costs veterancy, not progress: the player's own record keeps everything they earned.

This is the vision's "losing men costs something real" given a face.

## Service record

Every player has a service record per season and a lifetime total. It counts what the war values, not just kills:

- Days in the line and operations taken part in.
- Ground taken and held, trenches consolidated.
- Prisoners taken, wounded carried back, wire cut and laid.
- Kills, and men lost.
- Citations and decorations.

### Ranks

Rank is earned per season from the service record and resets each season (the lifetime record keeps the highest rank
reached). Each rank unlocks a responsibility:

| French          | German        | Unlocks                                                               |
| --------------- | ------------- | --------------------------------------------------------------------- |
| Soldat          | Soldat        | A rifle section                                                       |
| Caporal         | Gefreiter     | All squad types                                                       |
| Sergent         | Unteroffizier | Leading a platoon: orders to friends' squads and nearby bot squads    |
| Adjudant        | Feldwebel     | Forward observer: calls for fire beyond the personal ration           |
| Sous-lieutenant | Leutnant      | Planning raids for the side                                           |
| Lieutenant      | Oberleutnant  | Planning operations under the sector commander                        |
| Capitaine       | Hauptmann     | Standing as [sector commander](sector-battle.md#the-sector-commander) |

Responsibility can be taken away: a commander the side votes out loses the post, and a player who repeatedly shells
their own side loses observer rights.

### Citations and the communiqué

Each day's [communiqué](war-map-and-season.md#the-communiqué) mentions players and regiments in dispatches, chosen by
rules that reward what the war needed that day:

- The squad that held a trench under bombardment, or retook it.
- The most prisoners, the most wounded carried back, the most wire cut before an operation.
- The first into the enemy trench.

Citations accumulate into period decorations: the Croix de guerre with its palms and stars, the Médaille militaire for
the French; the Iron Cross second and first class for the Germans. Decorations are shown on the player's soldier and in
their record.

## Regiments

Players' groups are **regiments**, named after real regiments that fought at Verdun (the 151e régiment d'infanterie, the
Brandenburg 24th) or of their own naming within period rules.

- A regiment chooses its side for the season together and can ask the war map for the same sector, so its members fight
  side by side.
- It has its own chat, its own record in the communiqué and the season memorial, and its colours on the war map where it
  fought.
- Regiments are how a community forms and how veterans bring in new players; their tools come before any other social
  feature.

## Communication

- **Text chat** by squad, platoon, sector and side, with period-styled presentation.
- **Map pings** and markers: the fastest way to coordinate, and language-independent.
- **Whistles, flares and signal rockets** are communication as well as mechanics.
- **Voice** is not planned at launch; it costs moderation and a solo developer can't staff it. Players use their own
  regiment voice servers.

## Conduct

A persistent war game is vulnerable to griefing, spying and burnout. Rules that help:

- **Friendly fire stays on.** Shells and grenades kill friends, which is realistic and makes artillery a responsibility.
  The [fire rules](sector-battle.md#who-fires) (calls only on visible ground, small personal rations) keep it from being
  a griefing tool; deliberate team-killing is reported and costs ranks.
- **Side lock** per season (see [balance](balance.md#sides)) limits spying.
- **Commander votes**: a side can replace a human commander, and the AI is always ready to take over.
- **No war-crime mechanics.** Prisoners are walked to the rear and can't be harmed. Surrender exists because it happened
  and because it makes trench fighting about more than killing.
- **Burnout**: nothing is lost by missing a day. Quiet war is worth playing for twenty minutes; operations are announced
  in advance; the season ends on a date.

## Rewards that last beyond a season

Earned, period-authentic and cosmetic only: insignia, decorations, the fourragère for regiments cited often, helmet and
uniform variants of the right year, moustaches. Nothing changes a soldier's fighting strength.

How the game makes money (a one-off purchase, free with cosmetics, or a subscription) changes what can be sold but must
never break this rule. It is an [open question](../open-questions.md#product).
