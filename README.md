# Kalkunahon

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.22070323.svg)](https://doi.org/10.5281/zenodo.22070323)
[![Licence: PolyForm Noncommercial 1.0.0](https://img.shields.io/badge/licence-PolyForm%20Noncommercial%201.0.0-05687A)](https://polyformproject.org/licenses/noncommercial/1.0.0/)

An offline meteorological calculator. The published build is a single HTML file: no install,
no server, no account, no analytics. It makes one network request, for the two web fonts, and
works without it.
Every result carries the published source it derives from, and values outside a formula's
stated range are flagged rather than silently returned.

**Live:** https://jbzerrudo.github.io/Kalkunahon/
**Download:** grab `Kalkunahon.html` from [Releases](https://github.com/jbzerrudo/Kalkunahon/releases)
and keep it on a USB stick.

## What it covers

| Module | Contents |
|---|---|
| Wind & tropical cyclone | Exact speed unit conversions and Beaufort force; WMO Table 1.2 conversion between 1-minute and 10-minute sustained Vmax; WMO Table 1.1 gust factors; side-by-side classification on the NHC, JMA, PAGASA, BOM, HKO, CMA, KMA and IMD scales at their own averaging periods, each compared against the ladder its agency publishes in the unit you select; Atkinson-Holliday and Knaff-Zehr pressure-wind relationships; u/v components; height adjustment to 10 m; wind power density |
| Moisture & comfort | Humidity solver from temperature plus RH, dewpoint or wet-bulb; vapour pressure, mixing ratio, specific and absolute humidity, virtual temperature, frost point, ice-bulb; heat index, humidex, apparent temperature, wind chill; **UTCI** with mean radiant temperature; **ISO 7243 WBGT** and ISO 7726 radiant temperature from a black globe; **outdoor WBGT by the Liljegren (2008) model** from radiation, wind and sun position, with the **KNMI hittekracht** 0-10 scale and the **ACGIH** work-rest screening limits |
| Pressure & altitude | Pressure units; station pressure to MSL (QFF); QNH, QFE, QNE and pressure altitude; density altitude and moist air density; ISA state at height; hypsometric equation and thickness |
| Thermodynamics | Potential, virtual and equivalent potential temperature; dry and saturated adiabatic lapse rates; LCL by Espy's rule and by the Romps (2017) exact solution; Lifted, Showalter, K, Total Totals and SWEAT indices; a **Skew-T log-P diagram** drawn from the entered levels, with isotherms, dry and saturated adiabats, mixing-ratio lines and the surface parcel path |
| Wind rose | Loads a CSV of speed and direction in the browser and draws the rose: 8, 16 or 36 sectors centred on the compass point, editable speed bins defaulting to the Beaufort boundaries, calms counted separately in the centre rather than folded into north, filtering by year, month and hour where the file has a readable date, and downloads of the diagram as SVG and the frequency table as CSV |
| Sun & day length | Sunrise, sunset, solar noon, civil, nautical and astronomical twilight, and day length, from the same solar position the WBGT model uses; a button fills latitude, longitude, date and UTC offset from the device |
| Reference | The lookup tables behind the calculators, the constants in use, and a list of what could not be verified against a primary source |
| Comments & suggestions | Composes a report or a suggestion and hands it to your own email app; nothing is sent from the page |

## Some things it is careful about

**The two WMO wind tables are not interchangeable.** Table 1.2 converts between agency
estimates of peak storm intensity: at sea, `V(10-min) = 0.93 x V(1-min)`. Table 1.1 converts a
mean wind of one averaging period into the expected peak gust within it. They answer different
questions, and the naive reciprocal of Table 1.1 gives 0.952, not 0.93. Kalkunahon keeps them in
separate calculators and says so on both.

**Radiation is what separates the comfort indices.** Heat index, humidex and apparent
temperature assume the radiant environment away. UTCI and ISO 7243 WBGT need it as an input,
which is why they work in sun as well as shade. Where mean radiant temperature is unknown the
app sets it equal to air temperature, states that this means shade or overcast or night, and
warns that it understates heat stress in sun by roughly 7 to 9 °C.

**Outdoor WBGT is not the shade approximation.** The Liljegren model solves iterative energy
balances on a 50.8 mm black globe and a 7 mm wetted wick, so it needs global radiation, wind and
the sun's position, not just temperature and humidity. Where no radiation measurement is
available the app can work from clear sky instead, using the model's own ceiling of 85% of the
top-of-atmosphere irradiance rather than a number chosen by hand, and says that this is an upper
bound. Wind must be the 2 m value; Liljegren's stability-based adjustment from other heights is
not implemented and the card says so.

**Hittekracht has no official word labels, and the app does not invent any.** KNMI's technical
report calls the 0-10 scale a communication scale and leaves interpretation to the reader, and
the KNMI explainer declines to give per-level advice because the response depends on age,
health, activity and clothing. The app therefore shows KNMI's own frequency statements instead
of categories, and says explicitly where KNMI publishes nothing. The ACGIH work-rest limits
shown alongside are a different standard for a different purpose: they screen occupational
exposure for working adults, not the general public.

**Intensity scales use different averaging periods.** A 10-minute 64 kt typhoon is roughly a
1-minute 69 kt system. The scale comparison converts each scale to its own native period before
classifying, and refuses to convert where WMO publishes no factor.

## Accuracy

The calculation engine ships with 316 numerical assertions checked against published worked
examples, including Stull's saturated adiabat (10 C, 70 kPa -> 4.58 K/km), Bolton's equivalent
potential temperature, Romps' LCL values to sub-metre, NWS heat-index chart values, the ISA
tropopause at 226.32 hPa, and every published tropical cyclone threshold of all eight agencies
in every unit that agency publishes.

The UTCI is checked in two halves, deliberately. The 210-coefficient polynomial is compared
against the reference implementation's polynomial, where the largest difference is 1.7e-11 °C.
The saturation vapour pressure is checked against physics instead, because pythermalcomfort
4.4.2 computes it with `log1p(T)` where the ITS-90 form needs `log(T)`, and this engine carried
the same line until v1.4.0. Checking one against the other certified the error. The test now
asserts that es(0 °C) is the textbook 6.112 hPa, which `log` gives and `log1p` does not.

```
node engine/test.js
```

The **Reference** module lists, in the app itself, every item that could *not* be verified
against a primary source, including WMO's own published constant Kp, which is inconsistent with
its two equations, and Knaff & Zehr's equation 8, whose printed sign does not round-trip.

## Known limits

These are the things the calculator does not do well, or does not know. The app carries the
full list in its Reference module, under *What is not verified*; these are the ones that can
move an answer.

**Mean radiant temperature is a lower bound in still air.** ISO 7726 gives two relations for
Tmrt from a globe thermometer, one for forced and one for natural convection, and directs you
to whichever yields the larger convection coefficient. Only the forced relation is implemented
here. Its correction term carries a factor of v^0.6, so as wind falls the term vanishes and
Tmrt collapses onto the globe reading: at zero wind the card returns Tmrt = Tg exactly, which
cannot be right when the globe is hotter than the air. Still air is also when radiant load
matters most. The card flags this. The relation in use is the one from **ISO 7726:1998**, taken
from the implementations that cite it rather than from the standard, which is sold and has not
been read. That edition was **withdrawn on 17 October 2025** and replaced by ISO 7726:2025.
Two things are therefore unchecked against the current edition: the missing natural-convection
branch, and the 1.1e8 constant in the forced relation that is used every time.

**The ACGIH work-rest limits are indexed on effective WBGT, not measured WBGT.** ACGIH Table 3
expects the measured value plus a Clothing Adjustment Value. The app supplies the measured
outdoor WBGT, which is the right input only for ordinary work clothes, whose adjustment is
zero. For coveralls or vapour-barrier clothing the adjustment must be added first, up to
+11 C. The card lists the values.

**Liljegren wind must be the 2 m value.** Liljegren's stability-based adjustment from other
measurement heights is not implemented, so convert first if your anemometer sits at 10 m.

**WMO Tables 1.1 and 1.2 carry no published uncertainty band.** WMO gives only qualitative
statements about scatter plus one case study.

**CMA's 2-minute and IMD's 3-minute winds are not convertible.** WMO Table 1.2 covers
1-minute and 10-minute only, so those rows are shown unconverted and are not comparable with
the rest of the table. The card says so.

## Running it

Open `index.html`. That is the whole procedure. It works from a local file, from a USB stick,
and from a phone in aeroplane mode.

Served over HTTPS, Chrome and Edge will offer to install it as a desktop app. The service
worker caches the app on first visit, so the installed copy keeps working with no connection.
Page loads are network-first, so anyone online always gets the newest build rather than a
stale cached one.

## Repository layout

```
index.html             the app
manifest.webmanifest   makes it installable
icon-192.png           required for the install prompt
icon-512.png           required for the install prompt
sw.js                  service worker, so the installed app works with no connection
engine/core.js         the calculation engine, no dependencies
engine/test.js         316 assertions against published values
CITATION.cff           citation metadata, also what GitHub's "Cite this repository" reads
og-card-v2.png         link preview image
.nojekyll              stops GitHub Pages running Jekyll over the files
```

## How to cite

Archived on Zenodo, so it can be cited in a thesis or paper.

**Concept DOI** [10.5281/zenodo.22070323](https://doi.org/10.5281/zenodo.22070323) always resolves
to the latest version. Use it when you mean the tool in general.

**Version DOI** Each release gets its own, listed on the
[Zenodo record](https://doi.org/10.5281/zenodo.22070323). Cite the version DOI of the release you
actually used, so a reader gets that exact version. The example below is v1.4.0; replace the DOI
with the one shown on Zenodo for your version.

> Zerrudo, J. (2026). *Kalkunahon: an offline meteorological calculator* (version 1.4.0).
> Zenodo. https://doi.org/10.5281/zenodo.22070323

```bibtex
@software{zerrudo_kalkunahon_2026,
  author  = {Zerrudo, Jef},
  title   = {Kalkunahon: an offline meteorological calculator},
  version = {1.4.0},
  year    = {2026},
  doi     = {10.5281/zenodo.22070323},
  url     = {https://jbzerrudo.github.io/Kalkunahon/}
}
```

GitHub's "Cite this repository" button reads `CITATION.cff` and will offer APA and BibTeX directly.

## Attribution

Reference data from NOAA / National Weather Service and the National Hurricane Center, which is
in the public domain. This tool is not affiliated with, or endorsed by, NOAA, the NWS, WMO or
PAGASA. The full source list is in the Reference module.

Typefaces are Archivo and IBM Plex Mono, both under the SIL Open Font License 1.1, loaded from
Google Fonts rather than bundled.

## Licence

[PolyForm Noncommercial 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0/). See `LICENSE`.

Free to use, copy, modify and redistribute for any **noncommercial** purpose. The licence
explicitly permits use by *"any charitable organization, educational institution, public research
organization, public safety or health organization, environmental protection organization, or
government institution ... regardless of the source of funding"*, so universities, students and
national meteorological services are all clearly covered.

Commercial use is reserved to the copyright holder.

### Commercial licensing

The licence above does not cover commercial use. To use Kalkunahon in paid client work, inside a
product or service you sell, or in any other commercial setting, contact **Jef Zerrudo** at
**jbzerrudo@pagasa.dost.gov.ph** to arrange a licence.

Note this is a **source-available** licence, not an open source one. The Open Source Definition
forbids restricting fields of endeavour, so no OSI-approved licence can carve out commercial use.
