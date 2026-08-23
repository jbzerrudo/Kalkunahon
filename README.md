# MeteoCalc

An offline meteorological calculator. One HTML file, no install, no server, no network.
Every result carries the published source it derives from, and values outside a formula's
stated range are flagged rather than silently returned.

**Live:** https://jbzerrudo.github.io/MeteoCalc/
**Download:** grab `MeteoCalc.html` from [Releases](https://github.com/jbzerrudo/MeteoCalc/releases)
and keep it on a USB stick.

## What it covers

| Module | Contents |
|---|---|
| Wind & tropical cyclone | Exact speed unit conversions and Beaufort force; WMO Table 1.2 conversion between 1-minute and 10-minute sustained Vmax; WMO Table 1.1 gust factors; side-by-side classification on the NHC, JMA, PAGASA, BOM and IMD scales at their own averaging periods; Atkinson-Holliday and Knaff-Zehr pressure-wind relationships; u/v components; height adjustment to 10 m; wind power density |
| Moisture & comfort | Humidity solver from temperature plus RH, dewpoint or wet-bulb; vapour pressure, mixing ratio, specific and absolute humidity, virtual temperature, frost point, ice-bulb; heat index, humidex, apparent temperature, WBGT, wind chill |
| Pressure & altitude | Pressure units; station pressure to MSL (QFF); QNH, QFE, QNE and pressure altitude; density altitude and moist air density; ISA state at height; hypsometric equation and thickness |
| Thermodynamics | Potential, virtual and equivalent potential temperature; dry and saturated adiabatic lapse rates; LCL by Espy's rule and by the Romps (2017) exact solution; Lifted, Showalter, K, Total Totals and SWEAT indices |

## Two things it is careful about

**The two WMO wind tables are not interchangeable.** Table 1.2 converts between agency
estimates of peak storm intensity: at sea, `V(10-min) = 0.93 x V(1-min)`. Table 1.1 converts a
mean wind of one averaging period into the expected peak gust within it. They answer different
questions, and the naive reciprocal of Table 1.1 gives 0.952, not 0.93. MeteoCalc keeps them in
separate calculators and says so on both.

**Intensity scales use different averaging periods.** A 10-minute 64 kt typhoon is roughly a
1-minute 69 kt system. The scale comparison converts each scale to its own native period before
classifying, and refuses to convert where WMO publishes no factor.

## Accuracy

The calculation engine ships with 142 numerical assertions checked against published worked
examples, including Stull's saturated adiabat (10 C, 70 kPa -> 4.58 K/km), Bolton's equivalent
potential temperature, Romps' LCL values to sub-metre, the ECCC humidex worked example, NWS
heat-index chart values, and the ISA tropopause at 226.32 hPa.

```
node engine/test.js
```

The **Reference** module lists, in the app itself, every item that could *not* be verified
against a primary source, including WMO's own published constant Kp, which is inconsistent with
its two equations, and Knaff & Zehr's equation 8, whose printed sign does not round-trip.

## Running it

Open `index.html`. That is the whole procedure. It works from a local file, from a USB stick,
and from a phone in aeroplane mode.

Served over HTTPS, Chrome and Edge will offer to install it as a desktop app.

## Repository layout

```
index.html             the app
manifest.webmanifest   makes it installable
icon-192.png           required for the install prompt
icon-512.png           required for the install prompt
engine/core.js         the calculation engine, no dependencies
engine/test.js         142 assertions against published values
.nojekyll              stops GitHub Pages running Jekyll over the files
```

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

The licence above does not cover commercial use. To use MeteoCalc in paid client work, inside a
product or service you sell, or in any other commercial setting, contact **Jef Zerrudo** at
**jbzerrudo@alum.up.edu.ph** to arrange a licence.

Note this is a **source-available** licence, not an open source one. The Open Source Definition
forbids restricting fields of endeavour, so no OSI-approved licence can carve out commercial use.
