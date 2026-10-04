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
