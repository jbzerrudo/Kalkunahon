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
    bands:[ {lo:0,  name:'Tropical Depression'},   {lo:34, name:'Tropical Storm'},
            {lo:48, name:'Severe Tropical Storm'}, {lo:64, name:'Typhoon'},
            {lo:100,name:'Super Typhoon'} ] },
  { id:'bom', name:'Australian BOM', avg:600, region:'Australian region',
    bands:[ {lo:0,  name:'below Category 1'}, {lo:34, name:'Category 1'},
            {lo:48, name:'Category 2'},       {lo:64, name:'Category 3 (severe)'},
            {lo:86, name:'Category 4 (severe)'}, {lo:108,name:'Category 5 (severe)'} ] },
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
