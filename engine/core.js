/* =====================================================================
   MetCalc core - meteorological calculation engine
   Every constant traceable to a cited source. See REFS at bottom.
   ===================================================================== */
(function (root) {
'use strict';

/* ---------- Exact unit definitions (NIST SP811 App B.9) ---------- */
const KT   = 1852/3600;      // knot -> m/s   (exact: nmi = 1852 m)
const MPH  = 0.44704;        // mph  -> m/s   (exact: mile = 1609.344 m)
const FTS  = 0.3048;         // ft/s -> m/s   (exact)
const KMH  = 1/3.6;          // km/h -> m/s   (exact)

/* ---------- ISA / ICAO (ISO 2533) ---------- */
const P0    = 1013.25;       // hPa
const T0K   = 288.15;        // K
const RHO0  = 1.225;         // kg/m3
const G0    = 9.80665;       // m/s2 (exact, CODATA)
const R_ISA = 287.05287;     // J/kg/K = 8314.32/28.964420
const LAPSE = 0.0065;        // K/gpm
const H_TP  = 11000;         // gpm
const T_TP  = 216.65;        // K
const NEXP  = G0/(R_ISA*LAPSE);        // 5.2558797
const R_E   = 6356766;       // m, ISO 2533 nominal earth radius

/* ---------- Thermodynamic ---------- */
const RD  = 287.05287;       // ISA basis: 8314.32/28.964420
const MD  = 28.964420;       // g/mol, dry air (ISO 2533)
const MV  = 18.01528;        // g/mol, water
const EPS = MV/MD;           // 0.6219797
const RV  = RD/EPS;          // derived, so eps = Rd/Rv holds exactly by construction
const CPD = 1004.67;
const KAPPA = 2/7;           // dry potential temperature
const KAPPA_B = 0.2854;      // Bolton's working value

const clamp = (v,a,b)=>Math.min(b,Math.max(a,v));
const isNum = v=>typeof v==='number' && isFinite(v);

/* =====================================================================
   1. WIND
   ===================================================================== */

/* --- 1.1 speed units. Base unit is m/s; convert via exact factors --- */
const SPEED = {
  ms:  {to:1,        label:'m/s'},
  kt:  {to:KT,       label:'kt'},
  kmh: {to:KMH,      label:'km/h'},
  mph: {to:MPH,      label:'mph'},
  fts: {to:FTS,      label:'ft/s'}
};
function speedTo(v, from, to){
  if(!isNum(v)) return NaN;
  return v*SPEED[from].to/SPEED[to].to;   // never chain rounded factors
}

/* --- 1.2 Beaufort. WMO table is the definition; the cube-root
       relation v = 0.836 B^1.5 is only an approximation. --- */
const BEAUFORT = [
  {f:0,  loKt:0,  hiKt:0.99, name:'Calm',           sea:'Sea like a mirror'},
  {f:1,  loKt:1,  hiKt:3,    name:'Light air',      sea:'Ripples, no foam crests'},
  {f:2,  loKt:4,  hiKt:6,    name:'Light breeze',   sea:'Small wavelets, glassy crests'},
  {f:3,  loKt:7,  hiKt:10,   name:'Gentle breeze',  sea:'Large wavelets, scattered whitecaps'},
  {f:4,  loKt:11, hiKt:16,   name:'Moderate breeze',sea:'Small waves, frequent whitecaps'},
  {f:5,  loKt:17, hiKt:21,   name:'Fresh breeze',   sea:'Moderate waves, many whitecaps'},
  {f:6,  loKt:22, hiKt:27,   name:'Strong breeze',  sea:'Large waves, extensive foam crests'},
  {f:7,  loKt:28, hiKt:33,   name:'Near gale',      sea:'Sea heaps up, foam blown in streaks'},
  {f:8,  loKt:34, hiKt:40,   name:'Gale',           sea:'Moderately high waves, spindrift'},
  {f:9,  loKt:41, hiKt:47,   name:'Strong gale',    sea:'High waves, dense foam, spray'},
  {f:10, loKt:48, hiKt:55,   name:'Storm',          sea:'Very high waves, sea white, visibility affected'},
  {f:11, loKt:56, hiKt:63,   name:'Violent storm',  sea:'Exceptionally high waves, sea covered in foam'},
  {f:12, loKt:64, hiKt:Infinity, name:'Hurricane',  sea:'Air filled with foam and spray'}
];
function beaufort(vKt){
  if(!isNum(vKt)) return null;
  for(let i=BEAUFORT.length-1;i>=0;i--) if(vKt>=BEAUFORT[i].loKt) return BEAUFORT[i];
  return BEAUFORT[0];
}
function beaufortApprox(vMs){ return Math.pow(vMs/0.836, 2/3); }

/* --- 1.3 WMO/TD-1555 Table 1.2 : agency Vmax averaging conversion.
       V(10-min) = K * V(1-min).  THIS is the one for storm intensity. --- */
const EXPOSURES = ['at-sea','off-sea','off-land','in-land'];
const EXPOSURE_LABEL = {
  'at-sea':'At-Sea (>20 km offshore)',
  'off-sea':'Off-Sea (onshore wind at coast)',
  'off-land':'Off-Land (offshore wind at coast)',
  'in-land':'In-Land (roughly open terrain)'
};
const K_VMAX = {'at-sea':0.93,'off-sea':0.90,'off-land':0.87,'in-land':0.84};
const K_LEGACY = 0.88;   // "traditional" value, still used by JTWC (1/0.88 = 1.14)

function vmax1to10(v1, exposure){ return v1 * K_VMAX[exposure]; }
function vmax10to1(v10, exposure){ return v10 / K_VMAX[exposure]; }

/* --- 1.4 WMO/TD-1555 Table 1.1 : gust factors G(tau, T0).
       Converts a MEAN wind of period T0 into the expected peak
       tau-second GUST within it. Must NOT be used mean->mean. --- */
const GUST = {
  3600:{3:[1.30,1.45,1.60,1.75],60:[1.11,1.17,1.22,1.28],120:[1.07,1.11,1.15,1.19],180:[1.06,1.09,1.12,1.15],600:[1.03,1.05,1.06,1.08]},
  600: {3:[1.23,1.38,1.52,1.66],60:[1.05,1.11,1.16,1.21],120:[1.02,1.05,1.09,1.12],180:[1.00,1.03,1.06,1.09],600:[1.00,1.00,1.00,1.00]},
  180: {3:[1.17,1.31,1.44,1.58],60:[1.00,1.05,1.10,1.15],120:[1.00,1.00,1.04,1.07],180:[1.00,1.00,1.00,1.00]},
  120: {3:[1.15,1.28,1.42,1.55],60:[1.00,1.03,1.08,1.13],120:[1.00,1.00,1.00,1.00]},
  60:  {3:[1.11,1.23,1.36,1.49],60:[1.00,1.00,1.00,1.00]}
};
function gustFactor(tau, T0, exposure){
  const row = GUST[T0]; if(!row) return NaN;
  const col = row[tau]; if(!col) return NaN;
  const i = EXPOSURES.indexOf(exposure); if(i < 0) return NaN;
  return col[i];
}

/* --- 1.5 TC intensity scales. Each carries its NATIVE averaging period. --- */
const TC_SCALES = [
  { id:'sshws', name:'Saffir-Simpson (NHC)', avg:60, region:'N Atlantic, E/C Pacific',
    bands:[ {lo:0,   name:'Tropical Depression'}, {lo:34, name:'Tropical Storm'},
            {lo:64,  name:'Category 1'},          {lo:83, name:'Category 2'},
            {lo:96,  name:'Category 3 (major)'},  {lo:113,name:'Category 4 (major)'},
            {lo:137, name:'Category 5 (major)'} ] },
  { id:'jma', name:'JMA / WMO Typhoon Committee', avg:600, region:'NW Pacific',
    bands:[ {lo:0,  name:'Tropical Depression'},   {lo:34, name:'Tropical Storm'},
            {lo:48, name:'Severe Tropical Storm'}, {lo:64, name:'Typhoon'},
            {lo:85, name:'Typhoon (Very Strong)'}, {lo:105,name:'Typhoon (Violent)'} ] },
  { id:'pagasa', name:'PAGASA', avg:600, region:'Philippine AoR',
    // Depression floor 22 kt (= Beaufort 6, 39 km/h) per PAGASA operational practice.
    // Below that a system is carried as a Low Pressure Area, not a tropical cyclone.
    // kmh carries PAGASA's OWN published km/h bounds, which are contiguous by design
    // and are not strict conversions of the knot bounds (22 kt = 40.7, published as 39).
    bands:[ {lo:0,  kmh:0,   name:'Low Pressure Area'},
            {lo:22, kmh:39,  name:'Tropical Depression'},
            {lo:34, kmh:62,  name:'Tropical Storm'},
            {lo:48, kmh:89,  name:'Severe Tropical Storm'},
            {lo:64, kmh:118, name:'Typhoon'},
            {lo:100,kmh:185, name:'Super Typhoon'} ] },
  { id:'bom', name:'Australian BOM', avg:600, region:'Australian region',
    bands:[ {lo:0,  name:'below Category 1'}, {lo:34, name:'Category 1'},
            {lo:48, name:'Category 2'},       {lo:64, name:'Category 3 (severe)'},
            {lo:86, name:'Category 4 (severe)'}, {lo:108,name:'Category 5 (severe)'} ] },
  { id:'hko', name:'Hong Kong Observatory', avg:600, region:'NW Pacific',
    // IBTrACS v04r01 HKO_CAT, stated directly in knots.
    bands:[ {lo:0,  name:'Low'},                   {lo:22, name:'Tropical Depression'},
            {lo:34, name:'Tropical Storm'},        {lo:48, name:'Severe Tropical Storm'},
            {lo:64, name:'Typhoon'},               {lo:81, name:'Severe Typhoon'},
            {lo:100,name:'Super Typhoon'} ] },
  { id:'cma', name:'CMA (China)', avg:120, region:'NW Pacific',
    // Chinese National Standard, in force since 15 June 2006. Authoritative bounds are in
    // m/s: 10.8 / 17.2 / 24.5 / 32.7 / 41.5 / 51.0. Knots below are the integer thresholds
    // that reproduce those bounds (1 kt = 0.514444 m/s).
    bands:[ {lo:0,  name:'Weaker than Tropical Depression'},
            {lo:21, name:'Tropical Depression'},   {lo:34, name:'Tropical Storm'},
            {lo:48, name:'Severe Tropical Storm'}, {lo:64, name:'Typhoon'},
            {lo:81, name:'Severe Typhoon'},        {lo:100,name:'Super Typhoon'} ] },
  { id:'kma', name:'KMA (South Korea)', avg:600, region:'NW Pacific',
    // IBTrACS v04r01 KMA_CAT. Authoritative bounds are in m/s: 14 / 17 / 25 / 33.
    // KMA's metric bounds differ from the JMA/CMA set, so the knot thresholds differ too.
    bands:[ {lo:0,  name:'Low'},                   {lo:28, name:'Tropical Depression'},
            {lo:34, name:'Tropical Storm'},        {lo:49, name:'Severe Tropical Storm'},
            {lo:65, name:'Typhoon'} ] },
  { id:'imd', name:'IMD', avg:180, region:'N Indian Ocean',
    bands:[ {lo:0,  name:'Low Pressure Area'},     {lo:17, name:'Depression'},
            {lo:28, name:'Deep Depression'},       {lo:34, name:'Cyclonic Storm'},
            {lo:48, name:'Severe Cyclonic Storm'}, {lo:64, name:'Very Severe Cyclonic Storm'},
            {lo:90, name:'Extremely Severe Cyclonic Storm'}, {lo:120,name:'Super Cyclonic Storm'} ] }
];
function classify(vKt, bands){
  let out = bands[0];
  for(const b of bands) if(vKt >= b.lo) out = b;
  return out;
}
/* Convert an input wind of a given averaging period into each scale's
   native period using Table 1.2, then classify. */
function tcClassifyAll(vKt, inputAvg, exposure){
  const K = K_VMAX[exposure];
  return TC_SCALES.map(s=>{
    let v = vKt, note = null;
    if(inputAvg !== s.avg){
      if(inputAvg===60  && s.avg===600){ v = vKt*K; note='x'+K.toFixed(2); }
      else if(inputAvg===600 && s.avg===60){ v = vKt/K; note='/'+K.toFixed(2); }
      else if(inputAvg===180 || s.avg===180){ note='no WMO factor'; }
    }
    return {scale:s, v:v, band:classify(v,s.bands), note:note};
  });
}

/* --- 1.6 Pressure-wind relationships --- */
// Atkinson & Holliday (1977), western North Pacific, 1-min sustained.
function ah77WindFromP(pc){ return pc>=1010 ? 0 : 6.70*Math.pow(1010-pc, 0.644); }   // kt
function ah77PFromWind(vKt){ return vKt<=0 ? 1010 : 1010 - Math.pow(vKt/6.70, 1/0.644); }

// Knaff & Zehr (2007) eq.7, N Atl / E-C Pac, 1-min sustained, V in kt.
function kz07PFromWind(vMax, penv, lat, c, S){
  const vsrm = vMax - 1.5*Math.pow(Math.max(c,0), 0.63);
  const dp = 23.286 - 0.483*vsrm - Math.pow(vsrm/24.254,2) - 12.587*S - 0.483*Math.abs(lat);
  return penv + dp;
}
// Invert eq.7 numerically (monotonic) rather than trusting the printed eq.8.
function kz07WindFromP(pc, penv, lat, c, S){
  let lo=0, hi=250;
  // Outside the bracket there is no solution; returning an endpoint would look
  // like an answer.
  if(pc > kz07PFromWind(lo,penv,lat,c,S) || pc < kz07PFromWind(hi,penv,lat,c,S)) return NaN;
  for(let i=0;i<200;i++){
    const mid=(lo+hi)/2;
    if(kz07PFromWind(mid,penv,lat,c,S) > pc) lo=mid; else hi=mid;
  }
  return (lo+hi)/2;
}

/* --- 1.7 Vector components. Meteorological direction = FROM. --- */
function uvFromSpeedDir(v, dirDeg){
  const r = dirDeg*Math.PI/180;
  return {u: -v*Math.sin(r), v: -v*Math.cos(r)};
}
function speedDirFromUV(u, v){
  const spd = Math.hypot(u,v);
  let dir = Math.atan2(-u,-v)*180/Math.PI;
  dir = ((dir%360)+360)%360;
  if(u===0 && v===0) dir = 0;
  return {speed:spd, dir:dir};
}

/* --- 1.8 Height adjustment to the 10 m reference --- */
const Z0 = {  // Davenport-Wieringa, WMO/TD-1555 Table 2.1 (mid-range values)
  'sea':0.0002,'smooth':0.005,'open':0.03,'roughly-open':0.10,
  'rough':0.25,'very-rough':0.5,'closed':1.0
};
function logProfile(uz, z, z0, zTarget){
  if(z<=z0 || zTarget<=z0) return NaN;
  return uz*Math.log(zTarget/z0)/Math.log(z/z0);
}
function powerLaw(uz, z, zTarget, alpha){ return uz*Math.pow(zTarget/z, alpha); }

/* --- 1.9 Wind power density --- */
function windPowerDensity(v, rho){ return 0.5*rho*Math.pow(v,3); }

/* =====================================================================
   2. MOISTURE
   ===================================================================== */

/* --- 2.1 Saturation vapour pressure.
       Alduchov & Eskridge (1996) AERK over water: closed-form invertible,
       max error 0.384% over -40..+50 C. AERKi over ice (= the WMO ice pair). --- */
const AW = 6.112, BW = 17.62, CW = 243.12;   // WMO/CIMO over water, -45..+60 C
const AI = 6.112, BI = 22.46, CI = 272.62;  // WMO/CIMO over ice,  -65..0.01 C
// One basis: identical prefactors, so e_s over water and over ice coincide at 0 C.
function esWater(t){ return AW*Math.exp(BW*t/(CW+t)); }        // hPa, t in C
function esIce(t){   return AI*Math.exp(BI*t/(CI+t)); }
// Bolton (1980) eq.10 - used ONLY inside Bolton's own thermodynamics
function esBolton(t){ return 6.112*Math.exp(17.67*t/(t+243.5)); }

/* --- 2.2 Dewpoint: exact algebraic inversion (prefactor cancels) --- */
function dewpointFromRH(t, rh){
  if(rh<=0) return NaN;
  const g = Math.log(rh/100) + BW*t/(CW+t);
  return CW*g/(BW-g);
}
function rhFromDewpoint(t, td){
  return 100*Math.exp(BW*td/(CW+td) - BW*t/(CW+t));
}
function frostpointFromRHi(t, rhi){
  const g = Math.log(rhi/100) + BI*t/(CI+t);
  return CI*g/(BI-g);
}
// RH is reported wrt WATER even below 0 C. Convert before using the ice branch.
function rhIceFromRhWater(t, rhw){ return rhw*esWater(t)/esIce(t); }
function dewpointSimple(t, rh){ return t - (100-rh)/5; }   // Lawrence 2005 rule of thumb

/* --- 2.3 Moisture variables --- */
function mixingRatio(e, p){ return (p<=e || e<0) ? NaN : EPS*e/(p-e); }              // kg/kg
function specificHumidity(e, p){ return (p<=e || e<0) ? NaN : EPS*e/(p-(1-EPS)*e); } // kg/kg
function vapourPressureFromW(w, p){ return p*w/(EPS+w); }
function absoluteHumidity(e, tK){ return 1e5*e/(RV*tK); }      // g/m3 (e in hPa)
function virtualTemp(tK, w){ return tK*(1+w/EPS)/(1+w); }      // exact form

/* --- 2.4 Wet-bulb --- */
// Stull (2011): RH 5-99%, T -20..+50 C, sea level ONLY. MAE < 0.3 C.
function wetBulbStull(t, rh){
  return t*Math.atan(0.151977*Math.sqrt(rh+8.313659))
       + Math.atan(t+rh) - Math.atan(rh-1.676331)
       + 0.00391838*Math.pow(rh,1.5)*Math.atan(0.023101*rh)
       - 4.686035;
}
// Exact: bisect the psychrometric equation e = es(Tw) - A p (1+0.00115 Tw)(T-Tw)
function wetBulbPsychro(t, rh, p){
  const e = (rh/100)*esWater(t);
  // One branch across the whole bracket, so f stays monotonic and the root is
  // unique. Switching A and e_s on the *iterate* puts a step at Tw = 0 that
  // creates a second root and makes the answer depend on the starting bracket.
  const solve = (A, esf) => {
    const f = tw => esf(tw) - A*p*(1+0.00115*tw)*(t-tw) - e;
    let lo = -100, hi = t;
    if(!(f(lo) < 0) || !(f(hi) >= 0)) return NaN;   // no bracketed root
    for(let i=0;i<200;i++){ const m=(lo+hi)/2; if(f(m)<0) lo=m; else hi=m; }
    return (lo+hi)/2;
  };
  return solve(6.60e-4, esWater);   // liquid branch throughout (supercooled below 0)
}
// The ice-covered bulb is a genuinely different equilibrium, not a continuation
// of the same curve, so it is a separate quantity rather than a hidden branch
// switch inside the solver above.
function iceBulbPsychro(t, rh, p){
  const e = (rh/100)*esWater(t);
  const f = tw => esIce(tw) - 5.82e-4*p*(1+0.00115*tw)*(t-tw) - e;
  let lo=-100, hi=t;
  if(!(f(lo) < 0) || !(f(hi) >= 0)) return NaN;
  for(let i=0;i<200;i++){ const m=(lo+hi)/2; if(f(m)<0) lo=m; else hi=m; }
  return (lo+hi)/2;
}

/* --- 2.5 Heat index. NWS four-step procedure, defined in degF. --- */
function heatIndexF(tF, rh){
  const simple = 0.5*(tF + 61.0 + (tF-68.0)*1.2 + rh*0.094);
  if((simple+tF)/2 < 80) return {hi:simple, branch:'simple'};
  let hi = -42.379 + 2.04901523*tF + 10.14333127*rh
         - 0.22475541*tF*rh - 0.00683783*tF*tF - 0.05481717*rh*rh
         + 0.00122874*tF*tF*rh + 0.00085282*tF*rh*rh
         - 0.00000199*tF*tF*rh*rh;
  let branch='rothfusz';
  if(rh<13 && tF>=80 && tF<=112){
    hi -= ((13-rh)/4)*Math.sqrt((17-Math.abs(tF-95))/17); branch='rothfusz+dry adj';
  } else if(rh>85 && tF>=80 && tF<=87){
    hi += ((rh-85)/10)*((87-tF)/5); branch='rothfusz+humid adj';
  }
  return {hi:hi, branch:branch};
}

/* --- 2.6 Wind chill (2001 NWS / ECCC), metric form, V at 10 m in km/h --- */
function windChillC(t, vKmh){
  if(!(vKmh >= 0)) return NaN;
  if(vKmh < 5) return t + ((-1.59+0.1345*t)/5)*vKmh;   // ECCC low-wind fallback
  const p = Math.pow(vKmh, 0.16);
  return 13.12 + 0.6215*t - 11.37*p + 0.3965*t*p;
}

/* --- 2.7 Humidex (ECCC; Masterton & Richardson 1979) --- */
function humidex(t, td){
  const e = 6.11*Math.exp(5417.7530*(1/273.15 - 1/(td+273.15)));
  return t + 0.5555*(e-10.0);
}

/* --- 2.8 Apparent temperature, BOM shade version (Steadman) --- */
function apparentTempBOM(t, rh, vMs){
  const e = (rh/100)*6.105*Math.exp(17.27*t/(237.7+t));
  return t + 0.33*e - 0.70*vMs - 4.00;
}

/* --- 2.9 Simplified WBGT (BOM approximation; no radiation or wind input) --- */
function wbgtSimple(t, rh){
  const e = (rh/100)*esWater(t);
  return 0.567*t + 0.393*e + 3.94;
}


/* =====================================================================
   2b. RADIANT ENVIRONMENT: UTCI, mean radiant temperature, ISO 7243 WBGT
   ===================================================================== */

/* UTCI operational polynomial, Broede et al. (2012), Int J Biometeorol 56, 481-494.
   6th-order regression over 4 variables, 210 coefficients, RMSE 1.1 K against the
   UTCI-Fiala multi-node model it approximates. Translated from the reference
   implementation and validated numerically against it (see engine/test.js).
     tdb = air temperature, C;  v = wind speed at 10 m, m/s
     dtr = Tmrt - Ta, C;        pa = water vapour pressure, kPa           */
function utciPoly(tdb, v, dtr, pa){
  const delta_t_tr = dtr;
  return (
    tdb
    + 0.607562052
    + (-0.0227712343) * tdb
    + (8.06470249e-4) * tdb * tdb
    + (-1.54271372e-4) * tdb * tdb * tdb
    + (-3.24651735e-6) * tdb * tdb * tdb * tdb
    + (7.32602852e-8) * tdb * tdb * tdb * tdb * tdb
    + (1.35959073e-9) * tdb * tdb * tdb * tdb * tdb * tdb
    + (-2.25836520) * v
    + 0.0880326035 * tdb * v
    + 0.00216844454 * tdb * tdb * v
    + (-1.53347087e-5) * tdb * tdb * tdb * v
    + (-5.72983704e-7) * tdb * tdb * tdb * tdb * v
    + (-2.55090145e-9) * tdb * tdb * tdb * tdb * tdb * v
    + (-0.751269505) * v * v
    + (-0.00408350271) * tdb * v * v
    + (-5.21670675e-5) * tdb * tdb * v * v
    + (1.94544667e-6) * tdb * tdb * tdb * v * v
    + (1.14099531e-8) * tdb * tdb * tdb * tdb * v * v
    + 0.158137256 * v * v * v
    + (-6.57263143e-5) * tdb * v * v * v
    + (2.22697524e-7) * tdb * tdb * v * v * v
    + (-4.16117031e-8) * tdb * tdb * tdb * v * v * v
    + (-0.0127762753) * v * v * v * v
    + (9.66891875e-6) * tdb * v * v * v * v
    + (2.52785852e-9) * tdb * tdb * v * v * v * v
    + (4.56306672e-4) * v * v * v * v * v
    + (-1.74202546e-7) * tdb * v * v * v * v * v
    + (-5.91491269e-6) * v * v * v * v * v * v
    + 0.398374029 * delta_t_tr
    + (1.83945314e-4) * tdb * delta_t_tr
    + (-1.73754510e-4) * tdb * tdb * delta_t_tr
    + (-7.60781159e-7) * tdb * tdb * tdb * delta_t_tr
    + (3.77830287e-8) * tdb * tdb * tdb * tdb * delta_t_tr
    + (5.43079673e-10) * tdb * tdb * tdb * tdb * tdb * delta_t_tr
    + (-0.0200518269) * v * delta_t_tr
    + (8.92859837e-4) * tdb * v * delta_t_tr
    + (3.45433048e-6) * tdb * tdb * v * delta_t_tr
    + (-3.77925774e-7) * tdb * tdb * tdb * v * delta_t_tr
    + (-1.69699377e-9) * tdb * tdb * tdb * tdb * v * delta_t_tr
    + (1.69992415e-4) * v * v * delta_t_tr
    + (-4.99204314e-5) * tdb * v * v * delta_t_tr
    + (2.47417178e-7) * tdb * tdb * v * v * delta_t_tr
    + (1.07596466e-8) * tdb * tdb * tdb * v * v * delta_t_tr
    + (8.49242932e-5) * v * v * v * delta_t_tr
    + (1.35191328e-6) * tdb * v * v * v * delta_t_tr
    + (-6.21531254e-9) * tdb * tdb * v * v * v * delta_t_tr
    + (-4.99410301e-6) * v * v * v * v * delta_t_tr
    + (-1.89489258e-8) * tdb * v * v * v * v * delta_t_tr
    + (8.15300114e-8) * v * v * v * v * v * delta_t_tr
    + (7.55043090e-4) * delta_t_tr * delta_t_tr
    + (-5.65095215e-5) * tdb * delta_t_tr * delta_t_tr
    + (-4.52166564e-7) * tdb * tdb * delta_t_tr * delta_t_tr
    + (2.46688878e-8) * tdb * tdb * tdb * delta_t_tr * delta_t_tr
    + (2.42674348e-10) * tdb * tdb * tdb * tdb * delta_t_tr * delta_t_tr
    + (1.54547250e-4) * v * delta_t_tr * delta_t_tr
    + (5.24110970e-6) * tdb * v * delta_t_tr * delta_t_tr
    + (-8.75874982e-8) * tdb * tdb * v * delta_t_tr * delta_t_tr
    + (-1.50743064e-9) * tdb * tdb * tdb * v * delta_t_tr * delta_t_tr
    + (-1.56236307e-5) * v * v * delta_t_tr * delta_t_tr
    + (-1.33895614e-7) * tdb * v * v * delta_t_tr * delta_t_tr
    + (2.49709824e-9) * tdb * tdb * v * v * delta_t_tr * delta_t_tr
    + (6.51711721e-7) * v * v * v * delta_t_tr * delta_t_tr
    + (1.94960053e-9) * tdb * v * v * v * delta_t_tr * delta_t_tr
    + (-1.00361113e-8) * v * v * v * v * delta_t_tr * delta_t_tr
    + (-1.21206673e-5) * delta_t_tr * delta_t_tr * delta_t_tr
    + (-2.18203660e-7) * tdb * delta_t_tr * delta_t_tr * delta_t_tr
    + (7.51269482e-9) * tdb * tdb * delta_t_tr * delta_t_tr * delta_t_tr
    + (9.79063848e-11)
    * tdb
    * tdb
    * tdb
    * delta_t_tr
    * delta_t_tr
    * delta_t_tr
    + (1.25006734e-6) * v * delta_t_tr * delta_t_tr * delta_t_tr
    + (-1.81584736e-9) * tdb * v * delta_t_tr * delta_t_tr * delta_t_tr
    + (-3.52197671e-10)
    * tdb
    * tdb
    * v
    * delta_t_tr
    * delta_t_tr
    * delta_t_tr
    + (-3.36514630e-8) * v * v * delta_t_tr * delta_t_tr * delta_t_tr
    + (1.35908359e-10)
    * tdb
    * v
    * v
    * delta_t_tr
    * delta_t_tr
    * delta_t_tr
    + (4.17032620e-10)
    * v
    * v
    * v
    * delta_t_tr
    * delta_t_tr
    * delta_t_tr
    + (-1.30369025e-9)
    * delta_t_tr
    * delta_t_tr
    * delta_t_tr
    * delta_t_tr
    + (4.13908461e-10)
    * tdb
    * delta_t_tr
    * delta_t_tr
    * delta_t_tr
    * delta_t_tr
    + (9.22652254e-12)
    * tdb
    * tdb
    * delta_t_tr
    * delta_t_tr
    * delta_t_tr
    * delta_t_tr
    + (-5.08220384e-9)
    * v
    * delta_t_tr
    * delta_t_tr
    * delta_t_tr
    * delta_t_tr
    + (-2.24730961e-11)
    * tdb
    * v
    * delta_t_tr
    * delta_t_tr
    * delta_t_tr
    * delta_t_tr
    + (1.17139133e-10)
    * v
    * v
    * delta_t_tr
    * delta_t_tr
    * delta_t_tr
    * delta_t_tr
    + (6.62154879e-10)
    * delta_t_tr
    * delta_t_tr
    * delta_t_tr
    * delta_t_tr
    * delta_t_tr
    + (4.03863260e-13)
    * tdb
    * delta_t_tr
    * delta_t_tr
    * delta_t_tr
    * delta_t_tr
    * delta_t_tr
    + (1.95087203e-12)
    * v
    * delta_t_tr
    * delta_t_tr
    * delta_t_tr
    * delta_t_tr
    * delta_t_tr
    + (-4.73602469e-12)
    * delta_t_tr
    * delta_t_tr
    * delta_t_tr
    * delta_t_tr
    * delta_t_tr
    * delta_t_tr
    + 5.12733497 * pa
    + (-0.312788561) * tdb * pa
    + (-0.0196701861) * tdb * tdb * pa
    + (9.99690870e-4) * tdb * tdb * tdb * pa
    + (9.51738512e-6) * tdb * tdb * tdb * tdb * pa
    + (-4.66426341e-7) * tdb * tdb * tdb * tdb * tdb * pa
    + 0.548050612 * v * pa
    + (-0.00330552823) * tdb * v * pa
    + (-0.00164119440) * tdb * tdb * v * pa
    + (-5.16670694e-6) * tdb * tdb * tdb * v * pa
    + (9.52692432e-7) * tdb * tdb * tdb * tdb * v * pa
    + (-0.0429223622) * v * v * pa
    + 0.00500845667 * tdb * v * v * pa
    + (1.00601257e-6) * tdb * tdb * v * v * pa
    + (-1.81748644e-6) * tdb * tdb * tdb * v * v * pa
    + (-1.25813502e-3) * v * v * v * pa
    + (-1.79330391e-4) * tdb * v * v * v * pa
    + (2.34994441e-6) * tdb * tdb * v * v * v * pa
    + (1.29735808e-4) * v * v * v * v * pa
    + (1.29064870e-6) * tdb * v * v * v * v * pa
    + (-2.28558686e-6) * v * v * v * v * v * pa
    + (-0.0369476348) * delta_t_tr * pa
    + 0.00162325322 * tdb * delta_t_tr * pa
    + (-3.14279680e-5) * tdb * tdb * delta_t_tr * pa
    + (2.59835559e-6) * tdb * tdb * tdb * delta_t_tr * pa
    + (-4.77136523e-8) * tdb * tdb * tdb * tdb * delta_t_tr * pa
    + (8.64203390e-3) * v * delta_t_tr * pa
    + (-6.87405181e-4) * tdb * v * delta_t_tr * pa
    + (-9.13863872e-6) * tdb * tdb * v * delta_t_tr * pa
    + (5.15916806e-7) * tdb * tdb * tdb * v * delta_t_tr * pa
    + (-3.59217476e-5) * v * v * delta_t_tr * pa
    + (3.28696511e-5) * tdb * v * v * delta_t_tr * pa
    + (-7.10542454e-7) * tdb * tdb * v * v * delta_t_tr * pa
    + (-1.24382300e-5) * v * v * v * delta_t_tr * pa
    + (-7.38584400e-9) * tdb * v * v * v * delta_t_tr * pa
    + (2.20609296e-7) * v * v * v * v * delta_t_tr * pa
    + (-7.32469180e-4) * delta_t_tr * delta_t_tr * pa
    + (-1.87381964e-5) * tdb * delta_t_tr * delta_t_tr * pa
    + (4.80925239e-6) * tdb * tdb * delta_t_tr * delta_t_tr * pa
    + (-8.75492040e-8) * tdb * tdb * tdb * delta_t_tr * delta_t_tr * pa
    + (2.77862930e-5) * v * delta_t_tr * delta_t_tr * pa
    + (-5.06004592e-6) * tdb * v * delta_t_tr * delta_t_tr * pa
    + (1.14325367e-7) * tdb * tdb * v * delta_t_tr * delta_t_tr * pa
    + (2.53016723e-6) * v * v * delta_t_tr * delta_t_tr * pa
    + (-1.72857035e-8) * tdb * v * v * delta_t_tr * delta_t_tr * pa
    + (-3.95079398e-8) * v * v * v * delta_t_tr * delta_t_tr * pa
    + (-3.59413173e-7) * delta_t_tr * delta_t_tr * delta_t_tr * pa
    + (7.04388046e-7) * tdb * delta_t_tr * delta_t_tr * delta_t_tr * pa
    + (-1.89309167e-8)
    * tdb
    * tdb
    * delta_t_tr
    * delta_t_tr
    * delta_t_tr
    * pa
    + (-4.79768731e-7) * v * delta_t_tr * delta_t_tr * delta_t_tr * pa
    + (7.96079978e-9)
    * tdb
    * v
    * delta_t_tr
    * delta_t_tr
    * delta_t_tr
    * pa
    + (1.62897058e-9)
    * v
    * v
    * delta_t_tr
    * delta_t_tr
    * delta_t_tr
    * pa
    + (3.94367674e-8)
    * delta_t_tr
    * delta_t_tr
    * delta_t_tr
    * delta_t_tr
    * pa
    + (-1.18566247e-9)
    * tdb
    * delta_t_tr
    * delta_t_tr
    * delta_t_tr
    * delta_t_tr
    * pa
    + (3.34678041e-10)
    * v
    * delta_t_tr
    * delta_t_tr
    * delta_t_tr
    * delta_t_tr
    * pa
    + (-1.15606447e-10)
    * delta_t_tr
    * delta_t_tr
    * delta_t_tr
    * delta_t_tr
    * delta_t_tr
    * pa
    + (-2.80626406) * pa * pa
    + 0.548712484 * tdb * pa * pa
    + (-0.00399428410) * tdb * tdb * pa * pa
    + (-9.54009191e-4) * tdb * tdb * tdb * pa * pa
    + (1.93090978e-5) * tdb * tdb * tdb * tdb * pa * pa
    + (-0.308806365) * v * pa * pa
    + 0.0116952364 * tdb * v * pa * pa
    + (4.95271903e-4) * tdb * tdb * v * pa * pa
    + (-1.90710882e-5) * tdb * tdb * tdb * v * pa * pa
    + 0.00210787756 * v * v * pa * pa
    + (-6.98445738e-4) * tdb * v * v * pa * pa
    + (2.30109073e-5) * tdb * tdb * v * v * pa * pa
    + (4.17856590e-4) * v * v * v * pa * pa
    + (-1.27043871e-5) * tdb * v * v * v * pa * pa
    + (-3.04620472e-6) * v * v * v * v * pa * pa
    + 0.0514507424 * delta_t_tr * pa * pa
    + (-0.00432510997) * tdb * delta_t_tr * pa * pa
    + (8.99281156e-5) * tdb * tdb * delta_t_tr * pa * pa
    + (-7.14663943e-7) * tdb * tdb * tdb * delta_t_tr * pa * pa
    + (-2.66016305e-4) * v * delta_t_tr * pa * pa
    + (2.63789586e-4) * tdb * v * delta_t_tr * pa * pa
    + (-7.01199003e-6) * tdb * tdb * v * delta_t_tr * pa * pa
    + (-1.06823306e-4) * v * v * delta_t_tr * pa * pa
    + (3.61341136e-6) * tdb * v * v * delta_t_tr * pa * pa
    + (2.29748967e-7) * v * v * v * delta_t_tr * pa * pa
    + (3.04788893e-4) * delta_t_tr * delta_t_tr * pa * pa
    + (-6.42070836e-5) * tdb * delta_t_tr * delta_t_tr * pa * pa
    + (1.16257971e-6) * tdb * tdb * delta_t_tr * delta_t_tr * pa * pa
    + (7.68023384e-6) * v * delta_t_tr * delta_t_tr * pa * pa
    + (-5.47446896e-7) * tdb * v * delta_t_tr * delta_t_tr * pa * pa
    + (-3.59937910e-8) * v * v * delta_t_tr * delta_t_tr * pa * pa
    + (-4.36497725e-6) * delta_t_tr * delta_t_tr * delta_t_tr * pa * pa
    + (1.68737969e-7)
    * tdb
    * delta_t_tr
    * delta_t_tr
    * delta_t_tr
    * pa
    * pa
    + (2.67489271e-8)
    * v
    * delta_t_tr
    * delta_t_tr
    * delta_t_tr
    * pa
    * pa
    + (3.23926897e-9)
    * delta_t_tr
    * delta_t_tr
    * delta_t_tr
    * delta_t_tr
    * pa
    * pa
    + (-0.0353874123) * pa * pa * pa
    + (-0.221201190) * tdb * pa * pa * pa
    + 0.0155126038 * tdb * tdb * pa * pa * pa
    + (-2.63917279e-4) * tdb * tdb * tdb * pa * pa * pa
    + 0.0453433455 * v * pa * pa * pa
    + (-0.00432943862) * tdb * v * pa * pa * pa
    + (1.45389826e-4) * tdb * tdb * v * pa * pa * pa
    + (2.17508610e-4) * v * v * pa * pa * pa
    + (-6.66724702e-5) * tdb * v * v * pa * pa * pa
    + (3.33217140e-5) * v * v * v * pa * pa * pa
    + (-0.00226921615) * delta_t_tr * pa * pa * pa
    + (3.80261982e-4) * tdb * delta_t_tr * pa * pa * pa
    + (-5.45314314e-9) * tdb * tdb * delta_t_tr * pa * pa * pa
    + (-7.96355448e-4) * v * delta_t_tr * pa * pa * pa
    + (2.53458034e-5) * tdb * v * delta_t_tr * pa * pa * pa
    + (-6.31223658e-6) * v * v * delta_t_tr * pa * pa * pa
    + (3.02122035e-4) * delta_t_tr * delta_t_tr * pa * pa * pa
    + (-4.77403547e-6) * tdb * delta_t_tr * delta_t_tr * pa * pa * pa
    + (1.73825715e-6) * v * delta_t_tr * delta_t_tr * pa * pa * pa
    + (-4.09087898e-7)
    * delta_t_tr
    * delta_t_tr
    * delta_t_tr
    * pa
    * pa
    * pa
    + 0.614155345 * pa * pa * pa * pa
    + (-0.0616755931) * tdb * pa * pa * pa * pa
    + 0.00133374846 * tdb * tdb * pa * pa * pa * pa
    + 0.00355375387 * v * pa * pa * pa * pa
    + (-5.13027851e-4) * tdb * v * pa * pa * pa * pa
    + (1.02449757e-4) * v * v * pa * pa * pa * pa
    + (-0.00148526421) * delta_t_tr * pa * pa * pa * pa
    + (-4.11469183e-5) * tdb * delta_t_tr * pa * pa * pa * pa
    + (-6.80434415e-6) * v * delta_t_tr * pa * pa * pa * pa
    + (-9.77675906e-6) * delta_t_tr * delta_t_tr * pa * pa * pa * pa
    + 0.0882773108 * pa * pa * pa * pa * pa
    + (-0.00301859306) * tdb * pa * pa * pa * pa * pa
    + 0.00104452989 * v * pa * pa * pa * pa * pa
    + (2.47090539e-4) * delta_t_tr * pa * pa * pa * pa * pa
    + 0.00148348065 * pa * pa * pa * pa * pa * pa
  );
}

/* Saturation vapour pressure as the UTCI operational procedure defines it
   (Hardy 1998 / ITS-90 formulation, as used in the UTCI reference code).
   Deliberately NOT the app's WMO/CIMO formula: UTCI's polynomial was fitted
   against this one, so mixing them would introduce an error the polynomial
   cannot know about. Returns hPa for t in C. */
function utciEs(t){
  const g = [-2836.5744, -6028.076559, 19.54263612, -0.02737830188,
             0.000016261698, 7.0229056e-10, -1.8680009e-13];
  const tk = t + 273.15;
  let es = 2.7150305 * Math.log1p(tk);
  for(let i = 0; i < g.length; i++) es += g[i] * Math.pow(tk, i - 2);
  return Math.exp(es) * 0.01;
}

/* UTCI equivalent temperature, C. Ta and Tmrt in C, wind at 10 m in m/s, RH %. */
function utci(ta, tmrt, v10, rh){
  const pa = utciEs(ta) * (rh / 100) / 10;   // kPa
  return utciPoly(ta, v10, tmrt - ta, pa);
}

/* Log-law scaling of the 10 m wind to another height, as the UTCI
   procedure does it (roughness length 0.01 m). */
function scaleWind(v10, h){ return v10 * Math.log10(h/0.01) / Math.log10(10/0.01); }

/* ISO 7726 mean radiant temperature from a black-globe reading.
   Forced convection form. D = globe diameter (0.15 m standard), eps = 0.95.
   The wind must be at globe height, so the 10 m value is scaled down first. */
function mrtFromGlobe(tg, ta, v10, D, eps){
  D = D || 0.15; eps = eps || 0.95;
  const v = Math.max(scaleWind(v10, 1.1), 0);
  const tgK = tg + 273.15, taK = ta + 273.15;
  const f = (1.1e8 * Math.pow(v, 0.6)) / (eps * Math.pow(D, 0.4));
  const q = Math.pow(tgK, 4) + f * (tgK - taK);
  return q <= 0 ? NaN : Math.pow(q, 0.25) - 273.15;
}

/* ISO 7243 WBGT. Tnw is the NATURAL (unaspirated) wet bulb, which is not the
   psychrometric wet bulb; Tg is the black-globe temperature. */
function wbgtISO(tnw, tg, ta, solar){
  return solar ? 0.7*tnw + 0.2*tg + 0.1*ta : 0.7*tnw + 0.3*tg;
}

/* WBGT risk bands, Japan Ministry of the Environment, after the Japan Sports
   Association guidebook. NOTE this is an EXERCISE scale. ISO 7243's own
   occupational reference limits vary with metabolic rate and acclimatisation,
   so a single band cannot serve both. */
const WBGT_BANDS = [
  {lo: 31,   name:'Danger',         note:'Exercise should be prohibited except in special cases; children’s exercise stopped.'},
  {lo: 28,   name:'Severe warning', note:'Avoid heavy exercise and endurance events. Rest and hydration needed.'},
  {lo: 25,   name:'Warning',        note:'Rest every 30 minutes during heavy exercise.'},
  {lo: 21,   name:'Caution',        note:'Promote water replenishment during exercise.'},
  {lo:-1e9,  name:'Almost safe',    note:'Appropriate water replenishment still necessary.'}
];
function wbgtBand(w){
  if(!isFinite(w)) return null;
  for(const b of WBGT_BANDS) if(w >= b.lo - 1e-9) return b;
  return WBGT_BANDS[WBGT_BANDS.length-1];
}

/* UTCI thermal stress assessment scale, Broede et al. (2012). */
const UTCI_BANDS = [
  {lo:  46, name:'extreme heat stress'},
  {lo:  38, name:'very strong heat stress'},
  {lo:  32, name:'strong heat stress'},
  {lo:  26, name:'moderate heat stress'},
  {lo:   9, name:'no thermal stress'},
  {lo:   0, name:'slight cold stress'},
  {lo: -13, name:'moderate cold stress'},
  {lo: -27, name:'strong cold stress'},
  {lo: -40, name:'very strong cold stress'},
  {lo:-1e9, name:'extreme cold stress'}
];
function utciCategory(u){
  if(!isFinite(u)) return null;
  for(const b of UTCI_BANDS) if(u >= b.lo - 1e-9) return b.name;
  return UTCI_BANDS[UTCI_BANDS.length-1].name;
}
/* Published validity domain. Returns the list of breaches, empty if in range. */
function utciRangeIssues(ta, tmrt, v10, rh){
  const out = [];
  if(ta < -50 || ta > 50)               out.push('air temperature outside -50 to +50 &deg;C');
  if(tmrt-ta < -30 || tmrt-ta > 70)     out.push('T<sub>mrt</sub> &minus; T<sub>a</sub> outside &minus;30 to +70 K');
  if(v10 > 17)                          out.push('wind above 17 m/s, the limit most implementations enforce');
  if(rh < 5 || rh > 100)                out.push('relative humidity outside 5 to 100%');
  return out;
}

/* --- 2.10 Outdoor WBGT (Liljegren) and KNMI hittekracht.
       Ported from the reference C implementation by James C. Liljegren
       (UChicago Argonne, LLC, 2008), distributed under the MIT licence at
       github.com/mdljts/wbgt. Method: Liljegren JC, Carhart RA, Lawday P,
       Tschopp S, Sharp R (2008), Modeling the Wet Bulb Globe Temperature
       Using Standard Meteorological Measurements, J Occup Environ Hyg
       5:645-655. Hittekracht bands from KNMI Technical Report TR-26-04,
       "Van Wet Bulb Globe Temperature (WBGT) naar hittekracht", Table 1.
       Wind must be the 2 m value; Liljegren's stability-based adjustment
       from other heights is not implemented. --- */
const LJ = {
  SOLAR_CONST: 1367.0,
  STEFANB: 5.6696e-8,
  Cp: 1003.5,
  M_AIR: 28.97,
  M_H2O: 18.015,
  R_GAS: 8314.34,
  EMIS_WICK: 0.95, ALB_WICK: 0.4, D_WICK: 0.007, L_WICK: 0.0254,
  EMIS_GLOBE: 0.95, ALB_GLOBE: 0.05, D_GLOBE: 0.0508,
  EMIS_SFC: 0.999, ALB_SFC: 0.45,
  CZA_MIN: 0.00873, NORMSOLAR_MAX: 0.85,
  MIN_SPEED: 0.13, CONVERGENCE: 0.02, MAX_ITER: 500
};
LJ.R_AIR = LJ.R_GAS / LJ.M_AIR;                 // 286.9 J/(kg K)
LJ.Pr    = LJ.Cp / (LJ.Cp + 1.25 * LJ.R_AIR);   // Prandtl number
LJ.RATIO = LJ.Cp * LJ.M_AIR / LJ.M_H2O;

const DEG = Math.PI / 180;

/* --- air properties. Tair in K, Pair in hPa --- */
function ljViscosity(Tair){
  const sigma = 3.617, eps_kappa = 97.0;
  const Tr = Tair / eps_kappa;
  const omega = (Tr - 2.9) / 0.4 * (-0.034) + 1.048;
  return 2.6693e-6 * Math.sqrt(LJ.M_AIR * Tair) / (sigma * sigma * omega);
}
function ljThermalCond(Tair){
  return (LJ.Cp + 1.25 * LJ.R_AIR) * ljViscosity(Tair);
}
function ljDiffusivity(Tair, Pair){
  const Pcrit_air = 36.4, Pcrit_h2o = 218.0,
        Tcrit_air = 132.0, Tcrit_h2o = 647.3,
        a = 3.640e-4, b = 2.334;
  const Pcrit13  = Math.pow(Pcrit_air * Pcrit_h2o, 1/3);
  const Tcrit512 = Math.pow(Tcrit_air * Tcrit_h2o, 5/12);
  const Tcrit12  = Math.sqrt(Tcrit_air * Tcrit_h2o);
  const Mmix = Math.sqrt(1/LJ.M_AIR + 1/LJ.M_H2O);
  const Patm = Pair / 1013.25;
  return a * Math.pow(Tair/Tcrit12, b) * Pcrit13 * Tcrit512 * Mmix / Patm * 1e-4;
}
/* saturation vapour pressure, hPa. phase 0 = over water, 1 = over ice */
function ljEsat(tk, phase){
  let y, es;
  if(phase === 0){ y = (tk - 273.15)/(tk - 32.18);  es = 6.1121 * Math.exp(17.502 * y); }
  else           { y = (tk - 273.15)/(tk - 0.6);    es = 6.1115 * Math.exp(22.452 * y); }
  return 1.004 * es;
}
function ljDewPoint(e, phase){
  let z, tdk;
  if(phase === 0){ z = Math.log(e / (6.1121*1.004)); tdk = 273.15 + 240.97*z/(17.502 - z); }
  else           { z = Math.log(e / (6.1115*1.004)); tdk = 273.15 + 272.55*z/(22.452 - z); }
  return tdk;
}
function ljEmisAtm(Tair, rh){          // rh as a fraction
  const e = rh * ljEsat(Tair, 0);
  return 0.575 * Math.pow(e, 0.143);
}
function ljEvap(Tair){
  return (313.15 - Tair)/30 * (-71100) + 2.4073e6;
}
function ljHSphere(diameter, Tair, Pair, speed){
  const density = Pair * 100 / (LJ.R_AIR * Tair);
  const Re = Math.max(speed, LJ.MIN_SPEED) * density * diameter / ljViscosity(Tair);
  const Nu = 2.0 + 0.6 * Math.sqrt(Re) * Math.pow(LJ.Pr, 0.3333);
  return Nu * ljThermalCond(Tair) / diameter;
}
function ljHCylinder(diameter, length, Tair, Pair, speed){
  const a = 0.56, b = 0.281, c = 0.4;
  const density = Pair * 100 / (LJ.R_AIR * Tair);
  const Re = Math.max(speed, LJ.MIN_SPEED) * density * diameter / ljViscosity(Tair);
  const Nu = b * Math.pow(Re, 1 - c) * Math.pow(LJ.Pr, 1 - a);
  return Nu * ljThermalCond(Tair) / diameter;
}

/* --- globe temperature, returns degC or NaN if it will not converge --- */
function ljTglobe(Tair, rh, Pair, speed, solar, fdir, cza){
  const Tsfc = Tair;
  let Tprev = Tair, Tnew = Tair, converged = false, iter = 0;
  do {
    iter++;
    const Tref = 0.5 * (Tprev + Tair);
    const h = ljHSphere(LJ.D_GLOBE, Tref, Pair, speed);
    Tnew = Math.pow(
        0.5 * (ljEmisAtm(Tair, rh)*Math.pow(Tair,4) + LJ.EMIS_SFC*Math.pow(Tsfc,4))
      - h/(LJ.STEFANB*LJ.EMIS_GLOBE) * (Tprev - Tair)
      + solar/(2*LJ.STEFANB*LJ.EMIS_GLOBE) * (1 - LJ.ALB_GLOBE)
        * (fdir*(1/(2*cza) - 1) + 1 + LJ.ALB_SFC)
      , 0.25);
    if(Math.abs(Tnew - Tprev) < LJ.CONVERGENCE) converged = true;
    Tprev = 0.9*Tprev + 0.1*Tnew;
  } while(!converged && iter < LJ.MAX_ITER);
  return converged ? Tnew - 273.15 : NaN;
}

/* --- wet bulb. rad=1 natural (with radiation), rad=0 psychrometric --- */
function ljTwb(Tair, rh, Pair, speed, solar, fdir, cza, rad){
  const a = 0.56;                       // Bedingfield and Drew
  const Tsfc = Tair;
  const sza = Math.acos(cza);
  const eair = rh * ljEsat(Tair, 0);
  let Tprev = ljDewPoint(eair, 0), Tnew = Tprev, converged = false, iter = 0;
  do {
    iter++;
    const Tref = 0.5 * (Tprev + Tair);
    const h = ljHCylinder(LJ.D_WICK, LJ.L_WICK, Tref, Pair, speed);
    const Fatm = LJ.STEFANB * LJ.EMIS_WICK *
        (0.5*(ljEmisAtm(Tair,rh)*Math.pow(Tair,4) + LJ.EMIS_SFC*Math.pow(Tsfc,4)) - Math.pow(Tprev,4))
      + (1 - LJ.ALB_WICK) * solar *
        ((1 - fdir)*(1 + 0.25*LJ.D_WICK/LJ.L_WICK)
         + fdir*((Math.tan(sza)/Math.PI) + 0.25*LJ.D_WICK/LJ.L_WICK) + LJ.ALB_SFC);
    const ewick = ljEsat(Tprev, 0);
    const density = Pair * 100 / (LJ.R_AIR * Tref);
    const Sc = ljViscosity(Tref) / (density * ljDiffusivity(Tref, Pair));
    Tnew = Tair - ljEvap(Tref)/LJ.RATIO * (ewick - eair)/(Pair - ewick)
           * Math.pow(LJ.Pr/Sc, a) + (Fatm/h * rad);
    if(Math.abs(Tnew - Tprev) < LJ.CONVERGENCE) converged = true;
    Tprev = 0.9*Tprev + 0.1*Tnew;
  } while(!converged && iter < LJ.MAX_ITER);
  return converged ? Tnew - 273.15 : NaN;
}

/* --- solar position. Astronomical Almanac low-precision formulae, the same
       set used by Liljegren's solarposition(). Refraction uses the standard
       Michalsky correction. Returns cosine of the zenith angle, solar
       elevation in degrees, and the Earth-Sun distance in AU. --- */
function ljSolarPosition(dateUTC, latDeg, lonDeg){
  const jd = dateUTC.getTime()/86400000 + 2440587.5;
  const d  = jd - 2451545.0;                       // days from J2000.0
  const g  = (357.528 + 0.9856003*d) * DEG;        // mean anomaly
  const L  = (280.460 + 0.9856474*d) * DEG;        // mean longitude
  const lam = L + (1.915*Math.sin(g) + 0.020*Math.sin(2*g)) * DEG;
  const eps = (23.439 - 4.0e-7*d) * DEG;           // obliquity
  const soldist = 1.00014 - 0.01671*Math.cos(g) - 0.00014*Math.cos(2*g);
  const ra  = Math.atan2(Math.cos(eps)*Math.sin(lam), Math.cos(lam));
  const dec = Math.asin(Math.sin(eps)*Math.sin(lam));
  // Greenwich mean sidereal time, hours
  let gmst = 18.697374558 + 24.06570982441908*d;
  gmst = ((gmst % 24) + 24) % 24;
  const lmst = ((gmst + lonDeg/15) % 24 + 24) % 24;         // hours
  const ha = lmst*15*DEG - ra;                              // hour angle, rad
  const lat = latDeg*DEG;
  let elev = Math.asin(Math.sin(lat)*Math.sin(dec) + Math.cos(lat)*Math.cos(dec)*Math.cos(ha)) / DEG;
  let refr;                                                  // degrees
  if(elev > 15)        refr = 0.00452*3.51561/Math.tan(elev*DEG);
  else if(elev > -0.56) refr = 3.51561*(0.1594 + 0.0196*elev + 0.00002*elev*elev)
                               /(1 + 0.505*elev + 0.0845*elev*elev);
  else                 refr = 0.56;
  elev += refr;
  return { cza: Math.cos((90 - elev)*DEG), elev: elev, soldist: soldist };
}

/* --- normalise the measured global radiation against top-of-atmosphere and
       split it into direct and diffuse, exactly as calc_solar_parameters() --- */
function ljSolarParameters(solar, cza, soldist){
  let fdir = 0, s = solar;
  let toasolar = LJ.SOLAR_CONST * Math.max(0, cza) / (soldist*soldist);
  if(cza < LJ.CZA_MIN) toasolar = 0;
  if(toasolar > 0){
    const normsolar = Math.min(s/toasolar, LJ.NORMSOLAR_MAX);
    s = normsolar * toasolar;
    if(normsolar > 0){
      fdir = Math.exp(3 - 1.34*normsolar - 1.65/normsolar);
      fdir = Math.max(Math.min(fdir, 0.9), 0.0);
    }
  }
  return { solar: s, fdir: fdir };
}

/* --- outdoor WBGT. tC degC, rh %, pHpa hPa, wind m/s AT 2 m, solar W/m2 --- */
function wbgtLiljegren(tC, rh, pHpa, wind2m, solarWm2, dateUTC, latDeg, lonDeg){
  const sp = ljSolarPosition(dateUTC, latDeg, lonDeg);
  const sc = ljSolarParameters(solarWm2, sp.cza, sp.soldist);
  const tk = tC + 273.15, rhf = rh/100;
  const cza = Math.max(sp.cza, LJ.CZA_MIN);   // guard the 1/(2*cza) term at night
  const Tg   = ljTglobe(tk, rhf, pHpa, wind2m, sc.solar, sc.fdir, cza);
  const Tnwb = ljTwb(tk, rhf, pHpa, wind2m, sc.solar, sc.fdir, cza, 1);
  const Tpsy = ljTwb(tk, rhf, pHpa, wind2m, sc.solar, sc.fdir, cza, 0);
  if(!isFinite(Tg) || !isFinite(Tnwb)) return null;
  return {
    wbgt: 0.1*tC + 0.2*Tg + 0.7*Tnwb,
    tg: Tg, tnwb: Tnwb, tpsy: Tpsy,
    solarUsed: sc.solar, fdir: sc.fdir, cza: sp.cza, elev: sp.elev
  };
}

/* --- KNMI hittekracht, 0 to 10. KNMI TR-26-04 Table 1. --- */
function hittekracht(wbgt){
  if(!isFinite(wbgt)) return NaN;
  if(wbgt < 14) return 0;
  if(wbgt >= 32) return 10;
  return Math.floor((wbgt - 14)/2) + 1;
}


/* --- 2.11 ACGIH heat-stress screening limits. WBGT in degC against work
       allocation per hour. TLV applies to acclimatised workers, the Action
       Limit to unacclimatised. Values as published in ACGIH, 2026 TLVs and
       BEIs, p.242, reproduced by CCOHS. Blank cells in the published table
       are omitted here rather than guessed. --- */
const ACGIH_WBGT = {
  acclimatised: {
    light:      [['continuous',31.0],['50-75% work',31.0],['25-50% work',32.0],['0-25% work',32.5]],
    moderate:   [['continuous',28.0],['50-75% work',29.0],['25-50% work',30.0],['0-25% work',31.5]],
    heavy:      [                    ['50-75% work',27.5],['25-50% work',29.0],['0-25% work',30.5]],
    veryheavy:  [                                         ['25-50% work',28.0],['0-25% work',30.0]]
  },
  unacclimatised: {
    light:      [['continuous',28.0],['50-75% work',28.5],['25-50% work',29.5],['0-25% work',30.0]],
    moderate:   [['continuous',25.0],['50-75% work',26.0],['25-50% work',27.0],['0-25% work',29.0]],
    heavy:      [                    ['50-75% work',24.0],['25-50% work',25.5],['0-25% work',28.0]],
    veryheavy:  [                                         ['25-50% work',24.5],['0-25% work',27.0]]
  }
};
/* Least restrictive allocation whose limit is not exceeded, or null if the
   WBGT is above every tabulated limit for that workload. */
function acgihAllocation(wbgt, workload, acclimatised){
  const rows = ACGIH_WBGT[acclimatised ? 'acclimatised' : 'unacclimatised'][workload];
  if(!rows) return null;
  for(const [label, limit] of rows) if(wbgt <= limit) return {label: label, limit: limit};
  return null;
}

/* =====================================================================
   3. PRESSURE & ALTITUDE
   ===================================================================== */

/* --- 3.1 Pressure units. Base hPa. inHg/mmHg exact from conventional
       mercury density 13595.1 kg/m3 x g0 x length. --- */
const INHG = 13595.1*G0*0.0254/100;   // 33.86388640341 hPa
const MMHG = 13595.1*G0*0.001/100;    // 1.33322387415 hPa
const PRESS = {
  hPa:{to:1}, mb:{to:1}, Pa:{to:0.01}, kPa:{to:10},
  inHg:{to:INHG}, mmHg:{to:MMHG}, Torr:{to:1013.25/760},
  psi:{to:68.94757293168361}, atm:{to:1013.25}
};
function pressTo(v, from, to){ return v*PRESS[from].to/PRESS[to].to; }

/* --- 3.2 ISA state at geopotential height H (gpm) --- */
function isa(H){
  let T,p;
  if(H <= H_TP){
    T = T0K - LAPSE*H;
    p = P0*Math.pow(T/T0K, NEXP);
  } else if(H <= 20000){
    T = T_TP;
    const pTP = P0*Math.pow(T_TP/T0K, NEXP);
    p = pTP*Math.exp(-G0*(H-H_TP)/(R_ISA*T_TP));
  } else { return {T:NaN,p:NaN,rho:NaN}; }
  return {T:T, p:p, rho:100*p/(R_ISA*T)};
}

/* --- 3.3 Geopotential <-> geometric height (ISO 2533) --- */
function geometricToGeopotential(z){ return R_E*z/(R_E+z); }
function geopotentialToGeometric(H){ return R_E*H/(R_E-H); }

/* --- 3.4 Station pressure -> MSL (QFF). WMO-No.8 eq. 3.2 exponential form.
       Denominator IS the mean virtual temperature of the fictitious column. --- */
function qff(ps, Hp, tC, esHPa){
  const Tmv = (tC+273.15) + 0.0065*Hp/2 + (esHPa||0)*0.12;
  return ps*Math.exp(G0*Hp/(287.05*Tmv));
}
function qffTmv(Hp, tC, esHPa){ return (tC+273.15) + 0.0065*Hp/2 + (esHPa||0)*0.12; }

/* --- 3.5 QNH. ISA reduction (clean, invertible) + NWS/FAA operational form --- */
function qnhISA(ps, hM){ return ps/Math.pow(1 - LAPSE*hM/T0K, NEXP); }
function stationFromQnhISA(qnh, hM){ return qnh*Math.pow(1 - LAPSE*hM/T0K, NEXP); }
function qnhNWS(ps, hM){
  const k = 0.190284;
  return (ps-0.3)*Math.pow(1 + (Math.pow(1013.25,k)*0.0065/288)*hM/Math.pow(ps-0.3,k), 1/k);
}

/* --- 3.6 Pressure altitude & density altitude --- */
function pressureAltitude(p){ return (T0K/LAPSE)*(1 - Math.pow(p/P0, 1/NEXP)); }  // m
function densityAltitude(p, tC, td){
  const e   = isNum(td) ? esWater(td) : 0;
  const tK  = tC+273.15;
  const Tv  = tK/(1 - (e/p)*(1-EPS));
  const rho = 100*p/(RD*Tv);
  return {da:(T0K/LAPSE)*(1 - Math.pow(rho/RHO0, 1/(NEXP-1))), rho:rho, Tv:Tv};
}

/* --- 3.7 Hypsometric --- */
function thickness(p1, p2, TvMean){ return (RD*TvMean/G0)*Math.log(p1/p2); }
function meanTvFromThickness(p1, p2, dz){ return dz*G0/(RD*Math.log(p1/p2)); }

/* --- 3.8 Moist air density --- */
function airDensity(p, tC, e){
  const tK = tC+273.15;
  return 100*p/(RD*tK)*(1 - 0.378*e/p);
}

/* =====================================================================
   4. THERMODYNAMICS & STABILITY
   ===================================================================== */

function potentialTemp(tK, p){ return tK*Math.pow(1000/p, KAPPA); }
function invPotentialTemp(thK, p){ return thK*Math.pow(p/1000, KAPPA); }

/* Bolton (1980) eq.15 - temperature at the LCL */
function boltonTL(tK, eHPa){
  return 2840/(3.5*Math.log(tK) - Math.log(eHPa) - 4.805) + 55;
}
/* Bolton (1980) eq.43 - equivalent potential temperature. Max error 0.3 K. */
function thetaE(tK, p, rGkg){
  const e  = vapourPressureFromW(rGkg/1000, p);
  const TL = boltonTL(tK, e);
  const th = tK*Math.pow(1000/p, KAPPA_B*(1 - 0.28e-3*rGkg));
  return th*Math.exp((3.376/TL - 0.00254)*rGkg*(1 + 0.81e-3*rGkg));
}

/* Lapse rates */
function dryLapse(){ return 1000*G0/CPD; }   // K/km
/* Stull eq. 4.37b saturated adiabatic lapse rate */
function moistLapse(tK, p){
  const es = esWater(tK-273.15);
  const rs = EPS*es/(p-es);
  const a = 8711, b = 1.35e7, Gd = 9.8;
  return Gd*(1 + a*rs/tK)/(1 + b*rs/(tK*tK));   // K/km
}

/* Moist adiabat in pressure coordinates, RK4. dT/dp per MetPy/Bakhshaii. */
function moistLapseDTDP(tK, p){
  const es = esWater(tK-273.15);
  const rs = EPS*es/Math.max(p-es, 1e-6);
  const Lv = 3337118.5 - 3642.8583*tK + 2.1263947*tK*tK;   // Smithsonian poly
  return (RD*tK + Lv*rs)/(p*(CPD + Lv*Lv*rs*EPS/(RD*tK*tK)));
}
function liftMoist(tK, pFrom, pTo, steps){
  steps = steps||120;
  const h = (pTo-pFrom)/steps;
  let T = tK, p = pFrom;
  for(let i=0;i<steps;i++){
    const k1 = moistLapseDTDP(T, p);
    const k2 = moistLapseDTDP(T+h*k1/2, p+h/2);
    const k3 = moistLapseDTDP(T+h*k2/2, p+h/2);
    const k4 = moistLapseDTDP(T+h*k3,   p+h);
    T += h*(k1+2*k2+2*k3+k4)/6; p += h;
  }
  return T;
}

/* LCL */
function lclEspy(t, td){ return 125*(t-td); }                       // m
function lclStullPressure(p, tK, tdK){ return p*Math.pow(1-1.225*(tK-tdK)/tK, 3.5); }

/* Lambert W, lower (-1) branch, for x in [-1/e, 0) */
function lambertWm1(x){
  if(!(x < 0) || x < -1/Math.E) return NaN;   // also rejects NaN
  let w = Math.log(-x) - Math.log(-Math.log(-x));       // asymptotic guess
  if(!isFinite(w)) w = -2;
  for(let i=0;i<80;i++){
    const ew = Math.exp(w), f = w*ew - x;
    const d  = ew*(w+1) - (w+2)*f/(2*w+2);
    const step = f/d;
    if(!isFinite(step)) break;
    w -= step;
    if(Math.abs(step) < 1e-14*Math.max(1,Math.abs(w))) break;
  }
  return w;
}
/* Romps (2017) exact analytic LCL. p in Pa, T in K, rh as fraction. */
const RMP = {Ttrip:273.16, ptrip:611.65, E0v:2.3740e6, E0s:0.3337e6, g:9.81,
             rgasa:287.04, rgasv:461, cva:719, cvv:1418, cvl:4119, cvs:1861};
RMP.cpa = RMP.cva + RMP.rgasa;   // 1006.04
RMP.cpv = RMP.cvv + RMP.rgasv;   // 1879
function pvstarl(T){
  return RMP.ptrip*Math.pow(T/RMP.Ttrip, (RMP.cpv-RMP.cvl)/RMP.rgasv)
       * Math.exp((RMP.E0v-(RMP.cvv-RMP.cvl)*RMP.Ttrip)/RMP.rgasv*(1/RMP.Ttrip - 1/T));
}
function lclRomps(pPa, tK, rhFrac){
  const pv  = rhFrac*pvstarl(tK);
  if(pv<=0) return NaN;
  const qv  = RMP.rgasa*pv/(RMP.rgasv*pPa + (RMP.rgasa-RMP.rgasv)*pv);
  const rgm = (1-qv)*RMP.rgasa + qv*RMP.rgasv;
  const cpm = (1-qv)*RMP.cpa   + qv*RMP.cpv;
  const aL  = -(RMP.cpv-RMP.cvl)/RMP.rgasv + cpm/rgm;
  const bL  = -(RMP.E0v-(RMP.cvv-RMP.cvl)*RMP.Ttrip)/(RMP.rgasv*tK);
  const cL  = pv/pvstarl(tK)*Math.exp(-(RMP.E0v-(RMP.cvv-RMP.cvl)*RMP.Ttrip)/(RMP.rgasv*tK));
  const W   = lambertWm1(bL/aL*Math.pow(cL, 1/aL));
  return cpm*tK/RMP.g*(1 - bL/(aL*W));
}

/* Stability indices */
function kIndex(t850, td850, t700, td700, t500){
  return (t850 - t500) + td850 - (t700 - td700);
}
function totalTotals(t850, td850, t500){ return t850 + td850 - 2*t500; }
function verticalTotals(t850, t500){ return t850 - t500; }
function crossTotals(td850, t500){ return td850 - t500; }

/* Lift a parcel from (p, T, Td) to a target pressure: dry to LCL then moist. */
function liftParcelTo(p, tC, tdC, pTarget){
  const tK = tC+273.15, tdK = tdC+273.15;
  const pLCL = lclStullPressure(p, tK, tdK);
  if(pTarget >= pLCL){                       // still below the LCL: dry adiabat
    return invPotentialTemp(potentialTemp(tK,p), pTarget) - 273.15;
  }
  const tLCL = invPotentialTemp(potentialTemp(tK,p), pLCL);
  return liftMoist(tLCL, pLCL, pTarget) - 273.15;
}
function liftedIndex(pSfc, tSfc, tdSfc, t500){
  return t500 - liftParcelTo(pSfc, tSfc, tdSfc, 500);
}
function showalter(t850, td850, t500){
  return t500 - liftParcelTo(850, t850, td850, 500);
}
function sweat(td850, tt, f850, f500, dir850, dir500){
  const a = 12*Math.max(td850, 0);
  const b = tt < 49 ? 0 : 20*(tt-49);
  const c = 2*f850;
  const d = f500;
  let e = 0;
  const veer = dir500 - dir850;
  if(dir850>=130 && dir850<=250 && dir500>=210 && dir500<=310 &&
     veer>0 && f850>=15 && f500>=15){
    e = 125*(Math.sin(veer*Math.PI/180) + 0.2);
  }
  return a+b+c+d+e;
}
function bulkRichardson(cape, uShear){ return cape/(0.5*uShear*uShear); }

const API = {
  MD,MV,
  KT,MPH,FTS,KMH,P0,T0K,RHO0,G0,R_ISA,LAPSE,NEXP,R_E,RD,RV,EPS,CPD,KAPPA,KAPPA_B,INHG,MMHG,
  SPEED,speedTo,BEAUFORT,beaufort,beaufortApprox,
  EXPOSURES,EXPOSURE_LABEL,K_VMAX,K_LEGACY,vmax1to10,vmax10to1,GUST,gustFactor,
  TC_SCALES,classify,tcClassifyAll,
  ah77WindFromP,ah77PFromWind,kz07PFromWind,kz07WindFromP,
  uvFromSpeedDir,speedDirFromUV,Z0,logProfile,powerLaw,windPowerDensity,
  esWater,esIce,esBolton,dewpointFromRH,rhFromDewpoint,frostpointFromRHi,
  rhIceFromRhWater,dewpointSimple,mixingRatio,specificHumidity,vapourPressureFromW,
  absoluteHumidity,virtualTemp,wetBulbStull,wetBulbPsychro,iceBulbPsychro,heatIndexF,windChillC,
  humidex,apparentTempBOM,wbgtSimple,
  LJ,ljSolarPosition,ljSolarParameters,wbgtLiljegren,hittekracht,
  ACGIH_WBGT,acgihAllocation,
  utciPoly,utciEs,utci,scaleWind,mrtFromGlobe,wbgtISO,UTCI_BANDS,utciCategory,WBGT_BANDS,wbgtBand,utciRangeIssues,
  PRESS,pressTo,isa,geometricToGeopotential,geopotentialToGeometric,
  qff,qffTmv,qnhISA,stationFromQnhISA,qnhNWS,pressureAltitude,densityAltitude,
  thickness,meanTvFromThickness,airDensity,
  potentialTemp,invPotentialTemp,boltonTL,thetaE,dryLapse,moistLapse,
  moistLapseDTDP,liftMoist,lclEspy,lclStullPressure,lambertWm1,lclRomps,pvstarl,
  kIndex,totalTotals,verticalTotals,crossTotals,liftParcelTo,liftedIndex,
  showalter,sweat,bulkRichardson
};
if(typeof module!=='undefined' && module.exports) module.exports = API;
root.MET = API;
})(typeof globalThis!=='undefined'?globalThis:this);
