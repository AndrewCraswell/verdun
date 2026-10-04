# Historical weather at Verdun, 1916: data sources (October 2026)

Can the in-game weather follow the real weather of 1916, day by day and ideally hour by hour, for a point near Fleury
(49.19°N, 5.43°E)? Checked 2026-10-04. "Checked" means the data or page was queried directly; "inferred" means not.

## Takeaway

Yes, well enough. The 20th Century Reanalysis (20CRv3) gives 3-hourly temperature, cloud, precipitation, snow and wind
for every day of 1916 on a 1° grid, under CC-BY 4.0. Météo-France's free daily station records (Licence Ouverte 2.0)
cover Metz, Nancy, Bar-le-Duc and Sainte-Menehould for the whole of 1916 and correct the reanalysis's two weaknesses: it
runs cool on hot days and drizzles almost every day. Neither has visibility, so fog has to be inferred from humidity,
wind and time of day, with hand-entered overrides for documented events such as the fog of 24 October 1916.

## Reanalysis

**20CRv3 (NOAA-CIRES-DOE)**

- 3-hourly (`delta_t 03:00:00`), 1.0° grid, ensemble mean of 80 members; 2,928 time steps in 1916 (checked from the
  file metadata). Use the `*SI` folders; the `*MO` folders start in 1981.
  [THREDDS catalog](https://psl.noaa.gov/thredds/catalog/Datasets/20thC_ReanV3/catalog.html)
- 1916 variables that exist (checked): `air.2m`, `rhum.2m`, `tmax.2m`, `tmin.2m`, `uwnd.10m`, `vwnd.10m`, `tcdc.eatm`
  (total cloud), `tcdc.lowcld`, `tcdc.bndrylyr`, `prate`, `apcp`, `cpofp` (% frozen precipitation), `csnow`, `snod`. No
  visibility variable.
- Access (checked): OPeNDAP, e.g. `https://psl.noaa.gov/thredds/dodsC/Datasets/20thC_ReanV3/2mSI/air.2m.1916.nc`.
  Latitude runs south to north (49°N is index 139, 5°E index 5). Seven variables for the year took about 5 minutes.
  Individual ensemble members are at NERSC and NCAR ([PSL](https://psl.noaa.gov/data/20thC_Rean/)).
- Licence: CC-BY 4.0 on [NCAR GDEX](https://gdex.ucar.edu/datasets/d131003/); PSL asks for an acknowledgement.
- Weaknesses: assimilates surface pressure only; the ensemble mean drizzles nearly every day; it runs cool on hot days
  (23 June 1916: Tmax 24.0 °C against 27.4 °C measured at Metz).

**ERA-20C (ECMWF)**: 1900–2010, about 125 km, mostly 3-hourly, CC-BY 4.0, still hosted on
[GDEX d626000](https://gdex.ucar.edu/datasets/d626000/). ECMWF's own Public Datasets service for it
[closed in June 2023](https://confluence.ecmwf.int/spaces/WEBAPI/blog/2023/03/02/320999831/Decommissioning+of+ECMWF+Public+Datasets+service).
Useful as a cross-check. **CERA-20C**: 10-member ensemble
([Climate Data Guide](https://climatedataguide.ucar.edu/climate-data/cera-20c-ecmwfs-coupled-ocean-atmosphere-reanalysis-20th-century));
no current public download route confirmed.

## Station observations

- **Météo-France** (checked, the best find): the "avant-1949" daily files on
  [data.gouv.fr](https://www.data.gouv.fr/datasets/donnees-climatologiques-de-base-quotidiennes) have all of 1916 for
  Metz-Les Récollets and Nancy-Faculté (daily minimum and maximum temperature, precipitation) and Bar-le-Duc and
  Sainte-Menehould (precipitation). A second file per department flags snow days (`NEIG`). No cloud, wind or fog.
  Licence Ouverte 2.0: commercial use with attribution.
- **ECA&D**: [non-commercial only](https://www.ecad.eu/documents/ECAD_datapolicy.pdf). Excluded.
- **UK Met Office Daily Weather Reports**: Open Government Licence
  ([summary](https://www.metoffice.gov.uk/research/library-and-archive/publications/daily-weather-summary)); wartime
  charts included German stations ([Somme page](https://www.metoffice.gov.uk/research/library-and-archive/archive-hidden-treasures/battle-of-the-somme-1916)).
  Ernest Gold's Western Front forecast diaries start 24 October 1916
  ([archive](https://digital.nmla.metoffice.gov.uk/collection_69eaa4ce-70c3-488b-9f31-70ead7f51aa7/)). 1916 scans not
  confirmed.
- **Gallica**: the 1916 _Annales du Bureau central météorologique_
  ([ark](https://gallica.bnf.fr/ark:/12148/bpt6k6513585f)), not inspected. Commercial reuse of Gallica scans needs a
  paid licence; use for fact-checking only.
- **French war diaries (JMO)**: all scanned on Mémoire des hommes
  ([defense.gouv.fr](https://www.defense.gouv.fr/chemins-memoire/histoire-memoires/ressources-historiques/premiere-guerre-mondiale/combattre-combats/fronts-21)),
  handwritten and untranscribed; they often note the weather (inferred).

## Key dates

| Date      | Documented                                                                                                                                                                                                                                          | Stations                       | 20CRv3                            |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | --------------------------------- |
| 12–20 Feb | Offensive delayed by fog, heavy rain and high winds ([Wikipedia](https://en.wikipedia.org/wiki/Battle_of_Verdun)), snow and gales ([wereldoorlog1418](https://wereldoorlog1418.nl/battleverdun/battleverdun22/index.htm))                            | Bar-le-Duc 22 mm on 19 Feb     | 7–17 mm/day, W–SW wind 6–10 m/s   |
| 21 Feb    | Bombardment opened 07:15                                                                                                                                                                                                                            | Metz −2.5/4.3 °C, Bar-le-Duc dry | −0.8/4.3 °C, 74% cloud, easterly |
| 25 Feb    | Snow falling at Douaumont                                                                                                                                                                                                                           | Metz −1.5/1.6 °C               | 8.6 mm, snow depth rising         |
| 23 Jun    | No account verified                                                                                                                                                                                                                                 | Metz 11.0/27.4 °C, showers     | Tmax 24.0 °C (too cool)           |
| 24 Oct    | Thick fog lifting about 14:00 ([RICM](https://www.anciens-du-ricm.org/2020/2-actu/7-salonlecture/doc/2020.10.24-douaumont.pdf), [MOOC](https://lms.fun-mooc.fr/asset-v1:lorraine+30002+session03+type@asset+block/S2B_les_chronologies_de_la_bataille.fr.pdf)) | Ste-Menehould 8 mm             | 87% cloud, RH 92%, 5 mm           |

## Documented days checked

A search of battle histories, official histories and contemporary reports (October 2026) for dated weather near
Verdun, compared with what the built data gives at Fleury. Where the data missed a well-sourced event, the build writes
it in (`FOGS`, `SNOWS` in `scripts/build-historical-weather.mjs`). `records.test.ts` keeps each check.

| Date | Documented | Sources | Data | Done |
| --- | --- | --- | --- | --- |
| 11–20 Feb 1916 | A week of snow, rain, gales and poor visibility put off the offensive | [Wikipedia](https://en.wikipedia.org/wiki/Battle_of_Verdun), [wereldoorlog1418](https://wereldoorlog1418.nl/battleverdun/battleverdun22/index.htm), [Mental Floss](https://mentalfloss.com/article/75452/wwi-centennial-verdun-attack-delayed) | Wet, overcast, rain and sleet, 2–8 °C | Matches |
| 21 Feb 1916 | Germans advanced over snow-covered ground | [Mental Floss](https://mentalfloss.com/article/75801/wwi-centennial-devils-anvil-verdun), with the week before | −2.5 °C, no snow lying | Snowfall written in, 20 Feb 16:00 to 21 Feb 04:00 UTC |
| 27 and 29 Feb, 6 Mar 1916 | A thaw, then heavy snow; snow at the Mort-Homme | Wikipedia; wereldoorlog1418 has a snowstorm on the 27th instead | Mild and dry | Left out: the sources disagree, single sources |
| 2–7 Jun 1916 | Heat at Fort Vaux, a little rain on the 5th | [Mental Floss](https://www.mentalfloss.com/article/81323/wwi-centennial-germans-capture-fort-vaux) | Showers on the 4th and 5th, 14–15 °C at 14:00 | Rain matches; heat not, single source |
| 24 Oct 1916 | Thick fog until about 14:00 | French officer's account, Wikipedia (Fort Douaumont) | Written in (before this check) | Matches |
| 15 Dec 1916 | Intense cold, freezing rain in the afternoon, snow at night | [UPI, 18 Dec 1916](https://www.upi.com/Archives/1916/12/18/French-victory-at-Verdun/4094758173113/) | 1–3 °C, rain and sleet all day | Close; no change |
| 3 Feb 1917 | The coldest days of the great frost | [Météo-Paris 1917](https://www.meteo-paris.com/chronique/annee/1917) | −14 °C at dawn | Matches |
| 20 Aug 1917 | No moon, brilliant stars before the Mort-Homme attack | [Oregon newspaper, 21 Aug 1917](https://oregonnews.uoregon.edu/lccn/sn83025138/1917-08-21/ed-1/seq-4/ocr/) | 30% cloud | Matches |
| 12 Sep 1918 | Driving wind and rain at Saint-Mihiel, roads very muddy | [Wikipedia](https://en.wikipedia.org/wiki/Battle_of_Saint-Mihiel), quoting the AEF weather report | 1 mm/h, ground sodden | Matches |
| 26 Sep 1918 | Heavy fog at the Meuse-Argonne opening, 05:30, through the morning | [Army Heritage Center](https://www.armyheritage.org/?p=9891) and others | 4 km visibility | Fog written in, 00:00 to 09:00 UTC |

### Other fronts

The same checks for the other regions (`scripts/build-historical-weather.mjs`, `REGIONS`):

| Date | Region | Documented | Sources | Data | Done |
| --- | --- | --- | --- | --- | --- |
| 11–12 Sep 1914 | aisne | Torrents of rain, roads turned to mud | British Official History vol. 1 ([mirror](https://cavalbatmarne.sam2g.fr/site2004/edmoch18.htm)) | Drizzle | Rain written in, 2.5 mm/h |
| 13–14 Sep 1914 | aisne | Dense fog by night, burned off by a bright morning sun | [Wikipedia](https://en.wikipedia.org/wiki/First_Battle_of_the_Aisne) | — | Fog written in, to 07:00 UTC |
| 9 May 1915 | artois | Bright, dry weather at the attack | [Wikipedia](https://en.wikipedia.org/wiki/Second_Battle_of_Artois) | Heavy rain (its one rain station is 75 km off) | Written in as dry and mostly clear |
| 25 Sep 1915 | champagne | Heavy rain from the night until noon | [Wikipedia](https://en.wikipedia.org/wiki/Second_Battle_of_Champagne), [wwitoday](https://wwitoday.com/wwiScQuotationDetail.php?id=523) | Rain all morning | Matches |
| 1 Jul 1916 | somme | Fine and hot, 26 °C, no rain | Gliddon via [Wikipedia](https://en.wikipedia.org/wiki/Battle_of_Albert_(1916)) | Dry, 21 °C at most from stations over 100 km off | Gliddon's whole record written in (below) |
| 15 Sep 1916 | somme | Cool haze, 15/6 °C, dry | Gliddon via [Wikipedia](https://en.wikipedia.org/wiki/Battle_of_Flers%E2%80%93Courcelette) | Dry, 14 °C at 13:00 | Matches |
| 9 Apr 1917 | artois | Snow and sleet squalls as the attack went in | [Wikipedia](https://en.wikipedia.org/wiki/Battle_of_Arras_(1917)), [Mental Floss](https://mentalfloss.com/article/94211/wwi-centennial-brits-attack-arras) | Rain, 4 °C | Snow written in, 03:00 to 12:00 UTC |
| 16 Apr 1917 | aisne | Dawned misty and overcast | [Wikipedia](https://en.wikipedia.org/wiki/Second_Battle_of_the_Aisne) | 8 km visibility | Mist written in, 800 m |
| 23 Oct 1917 | aisne | Rain from 06:00 at Malmaison | [Wikipedia](https://en.wikipedia.org/wiki/Battle_of_La_Malmaison) | Light rain | Close; no change |

**The Somme's daily record.** Jack Gliddon's *When the Barrage Lifts* (1987) gives the Somme's weather every day from 23
June to 18 November 1916: rain in mm, the high and low in °F, and the outlook in a word or two. The English Wikipedia
articles on the battle's actions reproduce it, and all 149 days were read from them (October 2026) into
`scripts/weather-records/somme-1916-gliddon.tsv`, with each day's article. Where articles word a day's outlook
differently the first is kept, and on 1 July, where the Battle of Albert article gives two readings, the 79/52 °F "fine"
of its own day's table. The build takes the record's temperatures and rain over the stations' for those days, and its
outlook for the sky: "fine" or "sun" a mostly clear sky by daylight, "dull" or "cloud" an overcast one, "mist" or "fog"
the morning's visibility down to 600 m or 150 m, "haze" the day's to 4 km.

Unconfirmed claims found only in search snippets (−20 °C on 15 December 1916, a clearing after snow on 21 February)
were not used. The same search found well-sourced days on other fronts (the Somme's daily record in Gliddon's *When
the Barrage Lifts*, fog at Amiens on 8 August 1918 and St-Quentin on 21 March 1918, snow at Arras on 9 April 1917) for
when those sectors get their own weather.

## Suggested pipeline

1. 3-hourly 20CRv3 ensemble mean from PSL OPeNDAP, interpolated to Fleury: `air.2m`, `rhum.2m`, `tcdc.eatm`,
   `tcdc.lowcld`, `tcdc.bndrylyr`, `prate`, `cpofp`, `uwnd.10m`, `vwnd.10m`, `snod`.
2. Stretch each day's temperature curve to the Metz and Nancy minimum and maximum; zero precipitation on days the nearby
   stations record dry, and scale the rest to the station totals.
3. Rain or snow: Météo-France `NEIG` days first, then 2 m temperature below about 1 °C, then `cpofp`.
4. Fog: relative humidity ≥ 95%, wind under 2 m/s, night or morning, low boundary-layer cloud; plus overrides for
   documented events.
5. Interpolate to hourly; hold precipitation at the 3-hour rate; add seeded, deterministic gusts and showers.
6. Credit 20CRv3 (CC-BY 4.0 and the PSL acknowledgement) and Météo-France (Licence Ouverte 2.0). That weather values
   themselves aren't copyrightable is an inference, not legal advice.
