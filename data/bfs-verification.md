# Independent verification of the BFS figures in `data/harvest.json`

**Date of verification:** 2026-07-24
**Verifier:** independent re-query of the BFS PxWeb API, written from scratch (no reuse of
`scripts/harvest/bfs.ts`, `scripts/harvest/bfs-queries.ts` or `scripts/harvest.ts`).
**Result: 1649 of 1649 BFS cells checked, 1649 matched, 0 mismatches, 0 null/missing discrepancies.**

---

## 1. Scope

`data/harvest.json` contains 3525 observations, of which **1649 carry `source: "BFS"`**:

| Cube | Observations in harvest |
|---|---|
| `px-x-0103010000_101` | 1203 |
| `px-x-0103010000_399` | 394 |
| `px-x-0103010000_423` | 52 |

None of the 1649 has a null `value`. States as recorded by the harvest: 716 `observed`,
933 `structural_zero`, 0 `suppressed`, 0 `not_published`.

The brief asked for a sample of at least 15 % (≈248 cells) spread across cubes and breakdowns.
Because a single PxWeb POST returns a whole hyper-rectangle of cells, it was cheaper to design
seven queries whose union is a **superset of every harvested BFS cell** than to sample. So the
verification is a **100 % census, not a sample** — all 1649 cells, all breakdowns (year series,
permit category, sex, 5-year age class, marital status, birth country, nationality/passport
group, cantonal baselines, population denominators).

## 2. Method

### 2.1 Metadata first, no guessing

Three plain GETs were issued to read each cube's real dimension names and value codes rather
than assuming them:

```
GET https://www.pxweb.bfs.admin.ch/api/v1/de/px-x-0103010000_423/px-x-0103010000_423.px
GET .../px-x-0103010000_399/px-x-0103010000_399.px
GET .../px-x-0103010000_101/px-x-0103010000_101.px
```

Dimension inventory actually returned by BFS:

- **_101** — `Jahr`, `Kanton`, `Bevölkerungstyp`, `Anwesenheitsbewilligung`, `Geschlecht`,
  `Altersklasse`, `Staatsangehörigkeit`
- **_399** — `Jahr`, `Kanton`, `Bevölkerungstyp`, `Staatsangehörigkeit (Auswahl)`,
  `Geburtsstaat`, `Geschlecht`, `Altersklasse`
- **_423** — `Jahr`, `Kanton`, `Bevölkerungstyp`, `Staatsangehörigkeit`, `Geburtsstaat`,
  `Geschlecht`, `Zivilstand`

Codes confirmed from the metadata (not assumed): Chile = `8407` in both `Staatsangehörigkeit`
and `Geburtsstaat`; Zug = `ZG`; **Switzerland-total canton = `8100`, not `CH`**; totals =
`-99999`; `Bevölkerungstyp` 1 = ständig (permanent) / 2 = nichtständig; `Geschlecht` 1 = Mann,
2 = Frau; `Zivilstand` 1 = ledig, 2 = verheiratet, 3 = verwitwet, 4 = geschieden, -9 = ohne
Angabe; `Anwesenheitsbewilligung` 2 = B, 3 = C, 4 = Ci, 5 = F, 7 = L, 8 = N, 9 = S;
`Altersklasse` 0/5/10/…/100 for the 5-year bands.

The harvest's own label vocabulary (`male`/`female`, `single`/`married`/…, `B`/`C`/`Ci`/…,
`EU`/`Swiss`/`Latin America & Caribbean`/…, `0-4`…`100+`) was mapped onto these BFS codes
**via the German `valueTexts` in the metadata**, so a swapped or shifted label in the harvest
(e.g. male↔female, or an off-by-one age band) would have surfaced as a value mismatch rather
than being silently reproduced.

### 2.2 Own query bodies

Seven coverage queries were hand-written (raw JSON, `--data-binary`), plus four cross-check
queries (§2.4):

| Query | Cube | Selection | Cells |
|---|---|---|---|
| q423 | _423 | 2023 × ZG × pop{1,2} × nat{total,8407} × birth{total,8407} × sex{all 3} × marital{all 6} | 144 |
| q399a | _399 | 2020-24 × ZG × pop{1,2} × natgroup{all 12} × birth 8407 × sex{all 3} × age total | 360 |
| q399b | _399 | 2020-24 × ZG × pop{1,2} × natgroup total × birth 8407 × sex total × age{all 22} | 220 |
| q101a | _101 | 2010-24 × ZG × pop{1,2} × permit{all 12} × sex{all 3} × age total × nat 8407 | 1080 |
| q101b | _101 | 2010-24 × ZG × pop{1,2} × permit total × sex total × age{all 22} × nat 8407 | 660 |
| q101c | _101 | 2010-24 × {8100, ZG} × pop{1,2} × totals × nat{8407, total, 8100} | 180 |
| q101d | _101 | 2024 × all 27 cantons × pop{1,2} × totals × nat{8407, total} | 108 |

Requests were issued one at a time, ≥6 s apart, via `curl` with its default User-Agent, using
only the POST query API (no cube downloads). Total traffic: **3 GETs + 11 POSTs = 14 requests**,
all HTTP 200, largest response 4.6 KB.

### 2.3 Own json-stat2 decoder

A standalone decoder was written for this check. It reads `id` and `size`, builds each
dimension's position→code list from `dimension[<id>].category.index` (handling both the object
and array forms of `index`), computes right-to-left strides so that the **last dimension varies
fastest**, and materialises an explicit `(code, code, …) → value` map. It asserts that
`len(value) == prod(size)` and that every category position is filled.

### 2.4 Guarding against a wrong decoder

A decoder that mis-assigns cells would produce a self-consistent but wrong map, so three
independent controls were applied:

1. **Internal marginal identities.** In every response, `sex-total == male + female`,
   `Zivilstand-total == Σ(1,2,3,4,-9)`, `Altersklasse-total == Σ(21 bands)`,
   `Anwesenheitsbewilligung-total == Σ(all 11 categories)`, `natgroup-total == Σ(11 groups)`.
   All held exactly, at every year and both population types. **0 failures.**
2. **Cantonal identity.** For 2024, Switzerland (`8100`) equals the sum of the 26 cantons for
   Chileans (3394 permanent, 54 non-permanent) and for the permanent total population
   (9 051 029). The one deliberate exception is the non-permanent total population
   (88 677 vs 85 855 summed): the 2822 difference is the `Kanton = -9 "Ohne Angabe"` category,
   which exists only for the non-permanent population — a real feature of the cube, not a
   decoding artefact.
3. **Re-query with differently shaped selections.** Four extra queries re-requested overlapping
   slices with *different dimension sizes* (e.g. 3 years × 4 permits × 3 sexes × 5 age bands),
   which changes every stride and would scramble the values if the row-major logic were wrong.
   Overlaps: 96 cells (_101), 56 (_399), 24 (_423), 20 (cantonal). **0 disagreements.**

### 2.5 Comparison

Every harvested BFS observation was translated into a coordinate tuple and looked up in the
decoded maps. Absence of a dimension key in `dim` was read as that dimension's total
(`-99999`), consistent with the harvest's own convention (`marital: null` = all marital
statuses, `permit: null` = all permits, `birthCountry: "any"` = birth-country total).
Every one of the 1649 tuples resolved to a cell present in my responses — none fell outside
the queried hyper-rectangles.

## 3. Results

| Cube | Cells compared | Matched | Mismatched |
|---|---|---|---|
| `px-x-0103010000_101` | 1203 | 1203 | 0 |
| `px-x-0103010000_399` | 394 | 394 | 0 |
| `px-x-0103010000_423` | 52 | 52 | 0 |
| **Total** | **1649** | **1649** | **0** |

By breakdown (all matched):

| Cube | Concept | Cells |
|---|---|---|
| _101 | Chilean nationals in Zug by year (permanent) | 15 |
| _101 | Chilean nationals in Zug by sex and year | 90 |
| _101 | Chilean nationals in Zug by permit category and year | 240 |
| _101 | Chilean nationals in Zug by 5-year age class and year | 660 |
| _101 | All Chilean nationals in Switzerland by year (baseline) | 30 |
| _101 | Chilean nationals by canton, 2024 (baseline) | 54 |
| _101 | Total resident population by canton, 2024 (denominator) | 54 |
| _101 | Zug total and Swiss population by year | 60 |
| _399 | Chilean-born residents of Zug by passport group and year | 120 |
| _399 | Chilean-born residents of Zug by passport group (2024) | 24 |
| _399 | Chilean-born residents of Zug by 5-year age class and year | 220 |
| _399 | Chilean-born residents of Zug by sex and year | 30 |
| _423 | Chilean nationals in Zug by marital status and sex, 2023 | 36 |
| _423 | Chilean-born residents of Zug by marital status, 2023 | 12 |
| _423 | Chilean nationals in Zug born in Chile vs elsewhere, 2023 | 4 |

### 3.1 Mismatches

**None.** No cell in any of the three cubes differed from the harvested value.

### 3.2 Null / missing discrepancies

**None.** BFS returned a numeric value for every one of the 1938 cells across the seven
coverage queries — no `null` entries, and no `status` block (PxWeb emits one for suppressed or
non-published cells; it was absent from all responses). Conversely, no harvested BFS cell is
null. There is therefore no case of "harvest has a value where BFS has none", and none of the
reverse. Cross-tabulation of harvest state against the BFS value is exactly clean:
all 716 `observed` cells are non-zero at BFS, all 933 `structural_zero` cells are zero at BFS.

### 3.3 Manifest anchors

All 8 BFS anchors in `data/manifest.json` were re-derived independently:

| Anchor | Source | Expected | Independently observed | Pass |
|---|---|---|---|---|
| BFS 2024 Chilean nationals (perm) | BFS 101 | 33 | 33 | yes |
| BFS 2017 Chilean nationals (perm) | BFS 101 | 34 | 34 | yes |
| BFS 2020 Chilean nationals (perm) | BFS 101 | 20 | 20 | yes |
| BFS 2024 Chilean-born (perm) | BFS 399 | 99 | 99 | yes |
| BFS 2024 Chilean-born Swiss passport | BFS 399 | 33 | 33 | yes |
| BFS 2024 Chilean-born LatAm passport | BFS 399 | 34 | 34 | yes |
| BFS 2024 Chilean-born EU passport | BFS 399 | 29 | 29 | yes |
| BFS 2023 Chilean nationals born in Chile | BFS 423 | 27 | 27 | yes |

(The remaining anchors in the manifest are SEM-sourced and outside the scope of this check.)

### 3.4 Key series, as independently observed

Chilean nationals in Zug, cube _101 (`Staatsangehörigkeit = 8407`, `Kanton = ZG`):

| Year | Permanent | Non-permanent |
|---|---|---|
| 2010 | 10 | 0 |
| 2011 | 14 | 0 |
| 2012 | 10 | 2 |
| 2013 | 19 | 2 |
| 2014 | 24 | 1 |
| 2015 | 20 | 3 |
| 2016 | 30 | 2 |
| 2017 | 34 | 1 |
| 2018 | 25 | 1 |
| 2019 | 24 | 2 |
| 2020 | 20 | 1 |
| 2021 | 23 | 3 |
| 2022 | 26 | 1 |
| 2023 | 28 | 8 |
| 2024 | 33 | 3 |

Chilean-born residents of Zug by passport group, 2024, cube _399 (`Geburtsstaat = 8407`):

| Passport group | Permanent | Non-permanent |
|---|---|---|
| Total | 99 | 3 |
| Swiss | 33 | 0 |
| EU | 29 | 0 |
| Latin America & Caribbean | 34 | 3 |
| North America | 1 | 0 |
| Oceania | 2 | 0 |
| EFTA / Other Europe / Africa / Asia / Stateless / Unknown | 0 | 0 |

Cube _423, 2023, Zug: Chilean nationals 28 permanent / 8 non-permanent; of the permanent,
27 were born in Chile; Chilean-born residents of any nationality 95 permanent (married 47,
single 35, divorced 11, widowed 2).

## 4. Observations that are not value errors

These do not affect any figure but are worth recording.

1. **`structural_zero` is used for every zero, including ordinary empirical zeros.** 933 cells
   carry `state: "structural_zero"`; BFS returns a genuine numeric `0` for all of them, so the
   *values* are right. But the label conflates two different things. Some are truly structural —
   e.g. Swiss nationals in the non-permanent population (15 cells, impossible by definition), or
   permanent-population asylum-seeker (N) and S-permit categories (30 cells). Others are plain
   observed zeros in a full-register count: 0 Chilean nationals in Appenzell Innerrhoden in 2024,
   0 non-permanent Chilean males in Zug in 2016, 610 empty 5-year age bands. If downstream code
   or copy treats `structural_zero` as "this cell cannot exist" it will overstate the case for
   roughly 850 of these cells. Consider a separate state for empirical zero.
2. **Cantonal totals differ between BFS and SEM, as expected.** BFS STATPOP 2024-12-31 gives
   Chilean nationals: Vaud 988, Zürich 547, Switzerland 3394. The manifest's SEM anchors give
   989, 554 and 3303 at the 2026-05-31 SEM reference date. These are different registers and
   different dates, so the divergence is expected — but the two must not be mixed in one chart
   or one sentence without saying which is which.
3. **Non-permanent population has an "unassigned canton" bucket.** In cube _101, the non-permanent
   Switzerland total exceeds the sum of the 26 cantons by 2822 persons (2024), held in
   `Kanton = -9 (Ohne Angabe)`. Any per-canton share computed against the Swiss non-permanent
   total will be slightly understated. This does not affect the Chile figures (Chilean
   non-permanent cantonal cells sum exactly to the national 54).

## 5. Reproduction

Metadata:

```
curl -sS "https://www.pxweb.bfs.admin.ch/api/v1/de/px-x-0103010000_101/px-x-0103010000_101.px"
```

Example query (cube _423, the full 144-cell block used above):

```
curl -sS -X POST -H "Content-Type: application/json" --data-binary @q423.json \
  "https://www.pxweb.bfs.admin.ch/api/v1/de/px-x-0103010000_423/px-x-0103010000_423.px"
```

with `q423.json`:

```json
{"query":[
 {"code":"Jahr","selection":{"filter":"item","values":["2023"]}},
 {"code":"Kanton","selection":{"filter":"item","values":["ZG"]}},
 {"code":"Bevölkerungstyp","selection":{"filter":"item","values":["1","2"]}},
 {"code":"Staatsangehörigkeit","selection":{"filter":"item","values":["-99999","8407"]}},
 {"code":"Geburtsstaat","selection":{"filter":"item","values":["-99999","8407"]}},
 {"code":"Geschlecht","selection":{"filter":"item","values":["-99999","1","2"]}},
 {"code":"Zivilstand","selection":{"filter":"item","values":["-99999","1","2","3","4","-9"]}}
],"response":{"format":"json-stat2"}}
```

Decoding rule used: `value` is a flat row-major array over the dimensions named in `id` with
lengths in `size`; stride of dimension *i* is the product of the sizes of dimensions *i+1…n*,
so the last dimension varies fastest. Category order per dimension comes from
`dimension[<id>].category.index`.
