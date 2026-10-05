# Historical maps

Where a sector's trench lines come from: the trench maps of 1916, traced over the real ground. This page lists the
sources found so far, what each may be used for, and how a sector is traced from them. The lines go into the sector's
Tiled file ([sector files](level-design.md#sector-files)).

**Status:** found by web search on 2026-10-05; the pages themselves couldn't be opened then, so each source's holdings,
scan quality and licence are to be confirmed before tracing from it. Items marked _unconfirmed_ especially.

## What we need

For each sector, both sides' trench systems on a date in 1916: fire, support and reserve lines, communication trenches,
saps and wire, placed accurately enough to lay over IGN's LiDAR (0.5 m, Lambert-93, EPSG:2154). We trace lines from the
maps; we never ship the scans, so a source's licence matters for tracing, and a public-domain or open source is best.

## Sources

| Source                                                                                                                                                                                                                                                               | What                                                                                                                                                                                       | Licence for tracing                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| French plan directeur **"Douaumont (Etain 5)", sheet 225**, [Truman Library M1093-01](https://trumanlibrary.gov/maps/m1093-01-map-trench-systems-and-fortifications-near-verdun)                                                                                     | The 1:20,000 trench map covering Fleury, Douaumont and Vaux, with Forts Douaumont, Vaux and Souville. This copy is the 26 April 1918 edition: the lines as built up by 1918, not 1916.     | Public domain (a US federal holding)                                                                                          |
| Plans directeurs at the **Library of Congress**: [1:20,000, 477 sheets](https://www.loc.gov/item/92680721/), [1:10,000, 156 sheets, 1916–34](https://tile.loc.gov/storage-services/service/gdc/gdcfindingaidpdfs/gm021019/gm021019.pdf)                              | French trench maps drawn from air photographs, trenches in red and blue. _Unconfirmed:_ which Verdun sheets are scanned, and their dates.                                                  | Public domain (a US federal holding)                                                                                          |
| **Bayerisches Hauptstaatsarchiv, Kriegsarchiv**: the [Alpenkorps files](https://www.gda.bayern.de/en/aktuelles/16/03/2026/15-09-2022-digitization-program-neustart-culture-alpenkorps/index.html)                                                                    | German records of the Alpenkorps, which fought at Fleury and Thiaumont in June–August 1916. _Unconfirmed:_ which map sheets are among them.                                                | CC0 / Public Domain Mark, citing the archive and reference ([terms](https://www.gda.bayern.de/en/footer/nutzungsbedingungen)) |
| **Bundesarchiv** Stellungskarten Verdun, 1:25,000, sheets 6–20, May and July 1916 (PH 3-KART/4144, 4148, [sheet 14](https://www.deutsche-digitale-bibliothek.de/item/TCQAANJVYJVRQXL32TNTDVNUY5HULMU3)); RIR 16's position, 1:10,000, November 1916 (PH 3-KART/4280) | German position maps of the 1916 battle. _Unconfirmed:_ which sheet covers Douaumont.                                                                                                      | _Unconfirmed_: some Bundesarchiv scans are restricted                                                                         |
| French official history, _Les armées françaises dans la Grande Guerre_, tome IV, map volumes, on Mémoire des hommes                                                                                                                                                  | The front line by date, 21 February to 3 September 1916. Small scale.                                                                                                                      | For checking who held what when, not for tracing                                                                              |
| **IGN LiDAR HD** (already the sectors' ground)                                                                                                                                                                                                                       | The ground as it is: surviving trenches and shell holes show plainly. One study found only about a fifth of the mapped trench length still visible, and the remains mix 1916 with 1917–18. | Licence Ouverte 2.0, credit "IGN – LiDAR HD"                                                                                  |

Avoid, unless we buy the right: **Gallica / BnF** scans (commercial reuse needs a paid licence, though the maps are
public domain) and the **Ministry of Defence digital library** (reuse needs express agreement). The 2016 IGN "Bataille
de Verdun" map is a modern, copyrighted product: reference only. No traced or georeferenced vector data of Verdun's 1916
trenches turned up; OpenStreetMap's trench tags carry the ODbL's share-alike terms, so we don't use them.

## Which for each sector

| Sector                     | Trace from                                                                                   | Check against                           |
| -------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------- |
| Fleury                     | The Alpenkorps maps (June–August 1916); Etain 5 for the French side                          | The official history's lines; the LiDAR |
| Fort Douaumont and village | Etain 5 for the ground and works; the Bundesarchiv's May–July 1916 maps for the German lines | The official history's lines; the LiDAR |
| Fort Vaux and Damloup      | Etain 5; the Bundesarchiv's June 1916 sheets                                                 | The official history's lines; the LiDAR |

The 1916 editions of the plans directeurs are at the Service historique de la Défense, Vincennes; worth asking for
copies of the Etain 5 sheet as it stood in 1916.

## Tracing a sector

1. Draw the sector's ground as shaded relief from the LiDAR (`pnpm map:backdrop`), the "survey" layer of its Tiled file.
2. Georeference the scan in QGIS against the LiDAR: fifteen or more control points on things that haven't moved, such as
   the outlines of Forts Douaumont, Vaux and Souville and the Thiaumont and Froideterre works, and road junctions.
   Thin-plate spline or second-order polynomial; aim for residuals under 10 m. A sheet printed with the Lambert grid can
   start from EPSG:27500 ("Nord de Guerre").
3. Export the warped scan clipped to the sector's window at 10 pixels a metre, and add it to the sector's Tiled file as
   an image layer under the features.
4. Trace the lines in Tiled over it, each with its side and kind. Where the scan and a trench the LiDAR shows agree
   within the georeferencing's error, follow the LiDAR.
5. Note each line's source sheet, edition and date in its properties.

New sectors are laid out 1 km wide along the front and 800 m deep (Fleury, the first, is 600 m by 400 m).
