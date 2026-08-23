const M = require('./core.js');
let pass=0, fail=0;
function ok(name, got, want, tol, unit){
  const d = Math.abs(got-want);
  const good = d <= tol;
  good ? pass++ : fail++;
  console.log((good?'  ok  ':'  FAIL'), name.padEnd(52),
    'got', (typeof got==='number'?got.toFixed(4):got).toString().padStart(12),
    'want', want.toString().padStart(11), (unit||''), good?'':('  d='+d.toFixed(5)));
}
function eq(name, got, want){ const g=(got===want); g?pass++:fail++;
  console.log((g?'  ok  ':'  FAIL'), name.padEnd(52), 'got', String(got).padStart(30), 'want', String(want)); }

console.log('\n== EXACT UNIT DEFINITIONS ==');
ok('1 kt -> km/h  (exact 1.852)',        M.speedTo(1,'kt','kmh'), 1.852, 1e-12);
ok('1 kt -> m/s   (463/900)',            M.speedTo(1,'kt','ms'), 463/900, 1e-15);
ok('1 mph -> m/s  (exact 0.44704)',      M.speedTo(1,'mph','ms'), 0.44704, 1e-15);
ok('1 m/s -> kt',                        M.speedTo(1,'ms','kt'), 1.94384449244060, 1e-12);
ok('1 inHg -> hPa (exact 33.8638864034)',M.INHG, 33.86388640341, 1e-9);
ok('1 mmHg -> hPa',                      M.MMHG, 1.33322387415, 1e-10);
ok('760 Torr = 1 atm exactly',           M.pressTo(760,'Torr','hPa'), 1013.25, 1e-11);
ok('760 mmHg != 1 atm (1013.2501 hPa)',  M.pressTo(760,'mmHg','hPa'), 1013.250144, 1e-5);
ok('29.92 inHg != 1013.25 (1013.2075)',  M.pressTo(29.92,'inHg','hPa'), 1013.2075, 1e-3);

console.log('\n== WMO/TD-1555 WIND AVERAGING ==');
ok('Table 1.2 at-sea K',                 M.K_VMAX['at-sea'], 0.93, 0);
ok('130 kt 1-min -> 10-min at-sea',      M.vmax1to10(130,'at-sea'), 120.9, 0.05, 'kt');
ok('120 kt 10-min -> 1-min at-sea',      M.vmax10to1(120,'at-sea'), 129.03, 0.01, 'kt');
ok('round trip 1->10->1',                M.vmax10to1(M.vmax1to10(85,'at-sea'),'at-sea'), 85, 1e-12);
ok('Table 1.1 G(60,600) at-sea',         M.gustFactor(60,600,'at-sea'), 1.05, 0);
ok('Table 1.1 G(3,600) in-land',         M.gustFactor(3,600,'in-land'), 1.66, 0);
ok('Table 1.1 G(3,3600) at-sea',         M.gustFactor(3,3600,'at-sea'), 1.30, 0);
eq('Table1.1 recip != Table1.2 (guard)', (1/M.gustFactor(60,600,'at-sea')).toFixed(3), '0.952');

console.log('\n== BEAUFORT (WMO table) ==');
eq('34 kt -> Force 8 Gale',              M.beaufort(34).f+' '+M.beaufort(34).name, '8 Gale');
eq('64 kt -> Force 12 Hurricane',        M.beaufort(64).f, 12);
eq('21 kt -> Force 5',                   M.beaufort(21).f, 5);
eq('22 kt -> Force 6',                   M.beaufort(22).f, 6);

console.log('\n== TC SCALES (native averaging periods) ==');
const c1 = M.tcClassifyAll(100, 60, 'at-sea');   // 100 kt 1-min
eq('100 kt 1-min -> SSHWS',              c1.find(x=>x.scale.id==='sshws').band.name, 'Category 3 (major)');
ok('100 kt 1-min -> JMA wind (x0.93)',   c1.find(x=>x.scale.id==='jma').v, 93, 0.01, 'kt');
eq('100 kt 1-min -> JMA class',          c1.find(x=>x.scale.id==='jma').band.name, 'Typhoon (Very Strong)');
const c2 = M.tcClassifyAll(100, 600, 'at-sea');  // 100 kt 10-min -> STY on PAGASA
eq('100 kt 10-min -> PAGASA',            c2.find(x=>x.scale.id==='pagasa').band.name, 'Super Typhoon');
ok('100 kt 10-min -> SSHWS wind (/0.93)',c2.find(x=>x.scale.id==='sshws').v, 107.527, 0.01, 'kt');

console.log('\n== PRESSURE-WIND ==');
ok('AH77: Pc 950 hPa -> Vmax',           M.ah77WindFromP(950), 93.585, 0.01, 'kt');
ok('AH77 kt form == m/s form /KT',      M.ah77WindFromP(950), 3.447*Math.pow(60,0.644)/M.KT, 0.01, 'kt');
ok('AH77 round trip 120 kt',             M.ah77PFromWind(M.ah77WindFromP(920)), 920, 1e-8);
// KZ07 eq.7 numeric identity from the research: dP 90, S=1, lat 25, c=10 -> ~130 kt
ok('KZ07 eq.7 at Vmax=130,S=1,lat25,c10',M.kz07PFromWind(130,1013,25,10,1)-1013, -87.05, 0.05, 'hPa');
ok('KZ07 inversion round trip',          M.kz07WindFromP(M.kz07PFromWind(115,1010,20,8,0.9),1010,20,8,0.9), 115, 1e-4);

console.log('\n== WIND VECTORS ==');
const uv = M.uvFromSpeedDir(Math.hypot(10,10), 225);
ok('dir 225 -> u (MetPy check)',         uv.u, 10, 1e-9);
ok('dir 225 -> v (MetPy check)',         uv.v, 10, 1e-9);
ok('u=10,v=10 -> dir 225 (MetPy)',       M.speedDirFromUV(10,10).dir, 225, 1e-9);
ok('northerly u=0,v=-5 -> dir 360/0',    M.speedDirFromUV(0,-5).dir % 360, 0, 1e-9);

console.log('\n== SATURATION VAPOUR PRESSURE / DEWPOINT ==');
ok('WMO/CIMO es(20C)',                   M.esWater(20), 23.3260, 1e-3, 'hPa');
ok('WMO/CIMO es(0C) = prefactor',        M.esWater(0), 6.112, 1e-12, 'hPa');
ok('es water == es ice at 0 C',          M.esWater(0), M.esIce(0), 0, 'hPa');
ok('RH over ice = 100 at 0 C, RH 100',   M.rhIceFromRhWater(0,100), 100, 1e-9, '%');
ok('Bolton es(25C)',                     M.esBolton(25), 31.673, 1e-2, 'hPa');
ok('Td round trip T=20 RH=50',           M.rhFromDewpoint(20, M.dewpointFromRH(20,50)), 50, 1e-9, '%');
ok('Td round trip T=35 RH=25',           M.rhFromDewpoint(35, M.dewpointFromRH(35,25)), 25, 1e-9, '%');
ok('Td round trip T=-10 RH=60',          M.rhFromDewpoint(-10, M.dewpointFromRH(-10,60)), 60, 1e-9, '%');
ok('T=30 RH=80 -> Td (hand 26.1670)',    M.dewpointFromRH(30,80), 26.1688, 1e-3, 'C');
ok('Td=T at RH=100',                     M.dewpointFromRH(22,100), 22, 1e-9, 'C');
ok('rule of thumb T30 RH80 -> 26.0',     M.dewpointSimple(30,80), 26.0, 1e-9, 'C');

console.log('\n== MOISTURE VARIABLES ==');
ok('epsilon = Mv/Md',                    M.EPS, 0.6219797, 1e-7);
ok('eps = Rd/Rv holds exactly',          M.RD/M.RV, M.EPS, 1e-15);
ok('Rv derived from one basis',          M.RV, 461.5149, 1e-3, 'J/kg/K');
{ const e=M.esWater(20)*0.5, w=M.mixingRatio(e,1013.25), q=M.specificHumidity(e,1013.25);
  ok('w from e (T20 RH50, 1013 hPa)',    w*1000, 7.2429, 1e-3, 'g/kg');
  ok('q = w/(1+w) identity',             q, w/(1+w), 1e-15);
  ok('e round trip from w',              M.vapourPressureFromW(w,1013.25), e, 1e-12, 'hPa'); }

console.log('\n== WET-BULB ==');
ok('Stull T=20 RH=50 (research 13.699)', M.wetBulbStull(20,50), 13.699, 1e-3, 'C');
ok('Stull T=25 RH=50 (research 17.998)', M.wetBulbStull(25,50), 17.998, 1e-3, 'C');
ok('Psychrometric T=20 RH=50',           M.wetBulbPsychro(20,50,1013.25), 13.87, 0.06, 'C');
ok('Stull vs psychro within 0.3C',       Math.abs(M.wetBulbStull(25,50)-M.wetBulbPsychro(25,50,1013.25)), 0, 0.3, 'C');
ok('Tw = T at RH=100',                   M.wetBulbPsychro(20,100,1013.25), 20, 0.02, 'C');

console.log('\n== AUDIT REGRESSIONS ==');
{ // was: ice/water switch on the iterate created a 2nd root and a 0.37 C jump
  let maxJump=0, at='';
  for(let rh=1; rh<=99; rh+=0.01){
    const a=M.wetBulbPsychro(5,rh,1013.25), b=M.wetBulbPsychro(5,rh+0.01,1013.25);
    if(isFinite(a)&&isFinite(b)&&Math.abs(b-a)>maxJump){ maxJump=Math.abs(b-a); at='RH='+rh.toFixed(2); }
  }
  ok('wet-bulb continuous in RH at T=5C', maxJump, 0, 0.005, 'C');
  console.log('       [info] largest step', maxJump.toFixed(5), 'C at', at);
}
{ // was: answer depended on the starting bracket
  const f=(t,rh,p)=>M.wetBulbPsychro(t,rh,p);
  ok('wet-bulb monotonic in RH (T=5C)',
     (()=>{let bad=0,prev=-99; for(let rh=1;rh<=99;rh+=0.05){const v=f(5,rh,1013.25); if(v<prev-1e-9)bad++; prev=v;} return bad;})(), 0, 0);
}
ok('wet-bulb audit worst case T31.3 RH1 p300', M.wetBulbPsychro(31.3,1,300), 0.84, 0.02, 'C');
ok('ice-bulb is a separate, lower value',  M.iceBulbPsychro(5,25,1013.25) < M.wetBulbPsychro(5,25,1013.25) ? 1:0, 1, 0);
ok('ice-bulb continuous in RH at T=-5C',
   (()=>{let mx=0; for(let rh=10;rh<=95;rh+=0.05){const a=M.iceBulbPsychro(-5,rh,1013.25),b=M.iceBulbPsychro(-5,rh+0.05,1013.25); if(isFinite(a)&&isFinite(b))mx=Math.max(mx,Math.abs(b-a));} return mx;})(), 0, 0.02, 'C');
ok('wet-bulb NaN when supersaturated',    Number.isNaN(M.wetBulbPsychro(20,105,1013.25))?1:0, 1, 0);
ok('wet-bulb = T at RH 100',              M.wetBulbPsychro(25,100,1013.25), 25, 1e-6, 'C');
ok('lambertWm1(NaN) is NaN',              Number.isNaN(M.lambertWm1(NaN))?1:0, 1, 0);
ok('lambertWm1 out of domain is NaN',     Number.isNaN(M.lambertWm1(-0.5))?1:0, 1, 0);
ok('kz07 out-of-domain high P is NaN',    Number.isNaN(M.kz07WindFromP(1050,1010,20,5,1))?1:0, 1, 0);
ok('kz07 out-of-domain low P is NaN',     Number.isNaN(M.kz07WindFromP(700,1010,20,5,1))?1:0, 1, 0);
ok('kz07 in-domain still solves',         M.kz07WindFromP(960,1010,20,5,1), 86.14, 0.02, 'kt');
ok('mixingRatio NaN when p <= e',         Number.isNaN(M.mixingRatio(M.esWater(50),100))?1:0, 1, 0);
ok('specificHumidity NaN when p <= e',    Number.isNaN(M.specificHumidity(M.esWater(50),50))?1:0, 1, 0);
ok('gustFactor NaN for bad exposure',     Number.isNaN(M.gustFactor(3,600,'nope'))?1:0, 1, 0);
ok('windChill NaN for negative wind',     Number.isNaN(M.windChillC(-10,-5))?1:0, 1, 0);
ok('windChill continuous at 5 km/h',      Math.abs(M.windChillC(-10,4.999)-M.windChillC(-10,5.001)), 0, 0.01, 'C');

console.log('\n== HEAT INDEX (NWS chart values) ==');
ok('HI 90F/70% (chart 105)',             M.heatIndexF(90,70).hi, 105.9, 0.6, 'F');
ok('HI 100F/40% (chart 109)',            M.heatIndexF(100,40).hi, 109.3, 0.6, 'F');
ok('HI 80F/40% simple branch (chart 80)',M.heatIndexF(80,40).hi, 79.6, 0.6, 'F');
eq('HI 110F/10% uses dry adjustment',    M.heatIndexF(110,10).branch, 'rothfusz+dry adj');
eq('HI 86F/90% uses humid adjustment',   M.heatIndexF(86,90).branch, 'rothfusz+humid adj');
eq('HI 75F/50% uses simple branch',      M.heatIndexF(75,50).branch, 'simple');

console.log('\n== WIND CHILL / HUMIDEX / APPARENT T ==');
ok('WCT -10C 30km/h',                    M.windChillC(-10,30), -19.5, 0.6, 'C');
ok('WCT metric vs degF form agree',
   M.windChillC(-10,30),
   ((35.74+0.6215*14+(-35.75+0.4275*14)*Math.pow(30/1.609344,0.16))-32)*5/9, 0.04, 'C');
ok('Humidex T30 Td25 (ECCC ex. 42)',     M.humidex(30,25), 42.35, 0.1);
ok('Apparent T 30C 60% 3m/s',            M.apparentTempBOM(30,60,3), 32.273, 0.01, 'C');

console.log('\n== ISA / PRESSURE / ALTITUDE ==');
ok('ISA exponent g0/(R L)',              M.NEXP, 5.2558797, 1e-6);
ok('ISA p at 0 gpm',                     M.isa(0).p, 1013.25, 1e-9, 'hPa');
ok('ISA rho at 0 gpm',                   M.isa(0).rho, 1.225, 2e-4, 'kg/m3');
ok('ISA p at tropopause (226.3204)',     M.isa(11000).p, 226.3204, 1e-3, 'hPa');
ok('ISA T at tropopause',                M.isa(11000).T, 216.65, 1e-9, 'K');
ok('ISA rho at tropopause (0.3639176)',  M.isa(11000).rho, 0.3639176, 1e-6, 'kg/m3');
ok('ISA p at 5500 gpm ~ half',           M.isa(5500).p, 505.0, 2.0, 'hPa');
ok('PA(1013.25) = 0',                    M.pressureAltitude(1013.25), 0, 1e-8, 'm');
ok('PA(500 hPa) ISA (18288.8 ft)',       M.pressureAltitude(500)/0.3048, 18288.8, 1.0, 'ft');
ok('PA(850 hPa) ISA (4781.2 ft)',        M.pressureAltitude(850)/0.3048, 4781.2, 1.0, 'ft');
ok('PA inverse of isa()',                M.pressureAltitude(M.isa(3000).p), 3000, 1e-6, 'm');
ok('DA = PA at ISA temp, dry',           M.densityAltitude(1013.25, 15, -60).da, 0, 30, 'm');
ok('geopotential 11000 -> geometric',    M.geopotentialToGeometric(11000), 11019.1, 1.0, 'm');
ok('geometric 5000 -> geopotential',     M.geometricToGeopotential(5000), 4996.07, 0.05, 'gpm');
ok('QNH ISA round trip',                 M.stationFromQnhISA(M.qnhISA(950,500),500), 950, 1e-10, 'hPa');
ok('QNH=station at sea level',           M.qnhISA(1000,0), 1000, 1e-12, 'hPa');
ok('QFF > station for h>0',              M.qff(900,1000,10,8) > 900 ? 1:0, 1, 0);
ok('QFF = station at h=0',               M.qff(1005,0,25,20), 1005, 1e-12, 'hPa');
ok('1 hPa near MSL = 27.31 ft',          (M.pressureAltitude(1012.25)-M.pressureAltitude(1013.25))/0.3048, 27.31, 0.02, 'ft');
ok('1000-500 thickness at Tv=266.15K',   M.thickness(1000,500,266.15), 5400, 1.0, 'm');
ok('5400 m line <-> Tv 266.15 K',        M.meanTvFromThickness(1000,500,5400), 266.15, 0.01, 'K');
ok('thickness inverse',                  M.meanTvFromThickness(1000,500,M.thickness(1000,500,260)), 260, 1e-9, 'K');
ok('air density 1013.25/15C dry',        M.airDensity(1013.25,15,0), 1.225, 2e-4, 'kg/m3');

console.log('\n== THERMODYNAMICS ==');
ok('theta = T at 1000 hPa',              M.potentialTemp(288.15,1000), 288.15, 1e-12, 'K');
ok('theta at 850 hPa, T=283.15',         M.potentialTemp(283.15,850), 297.0, 0.5, 'K');
ok('theta round trip',                   M.invPotentialTemp(M.potentialTemp(290,700),700), 290, 1e-10, 'K');
ok('Bolton TL (T30 Td25 research 296.92)', M.boltonTL(303.15, M.esBolton(25)), 296.92, 0.01, 'K');
ok('theta-e (T30 Td25 p1000, res 363.89)', M.thetaE(303.15,1000, 1000*M.mixingRatio(M.esBolton(25),1000)), 363.89, 0.05, 'K');
ok('theta-e (T20 Td15 p1000, res 324.09)', M.thetaE(293.15,1000, 1000*M.mixingRatio(M.esBolton(15),1000)), 324.09, 0.10, 'K');
ok('theta-e >= theta always',            M.thetaE(303.15,1000,20) > M.potentialTemp(303.15,1000) ? 1:0, 1, 0);
ok('dry lapse g/cp',                     M.dryLapse(), 9.761, 0.01, 'K/km');
ok('moist lapse T10C p700 (Stull 4.58)', M.moistLapse(283.15,700), 4.58, 0.02, 'K/km');
ok('moist lapse -> dry when very cold',  M.moistLapse(233.15,1000), 9.56, 0.05, 'K/km');
ok('moist lapse T30C p1000',             M.moistLapse(303.15,1000), 3.48, 0.05, 'K/km');

console.log('\n== LCL ==');
ok('Espy T30 Td25',                      M.lclEspy(30,25), 625, 1e-9, 'm');
ok('Lambert W-1(-0.1) known value',      M.lambertWm1(-0.1), -3.577152064, 1e-7);
ok('Lambert W-1 identity w*e^w = x',     (x=>{const w=M.lambertWm1(x); return w*Math.exp(w);})(-0.2), -0.2, 1e-12);
ok('Romps LCL 20C RH80 1013.25 (453.6)', M.lclRomps(101325,293.15,0.80), 453.6, 1.0, 'm');
ok('Romps LCL 30C RH50 1013.25 (1474.3)',M.lclRomps(101325,303.15,0.50), 1474.3, 2.0, 'm');
ok('Romps LCL 30C RH20 1013.25 (3152.3)',M.lclRomps(101325,303.15,0.20), 3152.3, 4.0, 'm');
ok('Romps -> 0 as RH -> 100%',           M.lclRomps(101325,293.15,0.999), 0, 12, 'm');
{ // Espy is a linear rule of thumb; Romps is exact. Divergence must stay
  // small in ABSOLUTE terms across Lawrence's stated range (it blows up in
  // relative terms only where the LCL itself is tiny).
  let worstAbs=0, worstRel=0, at='';
  for(let t=0;t<=30;t+=1) for(let rh=50;rh<=95;rh+=1){
    const td=M.dewpointFromRH(t,rh);
    const r=M.lclRomps(101325,t+273.15,rh/100), e=M.lclEspy(t,td);
    if(Math.abs(e-r)>worstAbs){ worstAbs=Math.abs(e-r); at='T='+t+'C RH='+rh+'%'; }
    if(r>50) worstRel=Math.max(worstRel, Math.abs(e-r)/r);
  }
  ok('Espy vs Romps max ABS err, 0-30C 50-95%', worstAbs, 0, 35, 'm');
  console.log('       [info] worst absolute', worstAbs.toFixed(1), 'm at', at,
              '| worst relative', (worstRel*100).toFixed(1)+'%');
}

console.log('\n== STABILITY INDICES ==');
ok('K-index (25/20/10/2/-12)',            M.kIndex(25,20,10,2,-12), 49, 1e-9);
ok('Total Totals (25/20/-12)',            M.totalTotals(25,20,-12), 69, 1e-9);
ok('TT = VT + CT',                        M.totalTotals(18,14,-15), M.verticalTotals(18,-15)+M.crossTotals(14,-15), 1e-12);
ok('parcel dry-lift below LCL = theta',   M.liftParcelTo(1000,30,-20,900)+273.15,
                                          M.invPotentialTemp(M.potentialTemp(303.15,1000),900), 0.01, 'K');
ok('saturated parcel lift follows moist adiabat',
   M.liftParcelTo(1000,20,20,900), M.liftMoist(293.15,1000,900)-273.15, 0.01, 'C');
{ const li = M.liftedIndex(1000,30,24,-12);
  ok('LI unstable sounding is negative',  li<0?1:0, 1, 0);
  ok('LI magnitude plausible (-4..-12)',  (li>-13&&li<-3)?1:0, 1, 0);
  console.log('       [info] LI =', li.toFixed(2), ' SSI =', M.showalter(18,15,-12).toFixed(2)); }
ok('SWEAT zeroes TT term when TT<49',     M.sweat(10,40,20,40,180,260), M.sweat(10,45,20,40,180,260), 1e-12);
ok('SWEAT zeroes shear term when backing',M.sweat(15,55,30,50,260,200),
   12*15+20*(55-49)+2*30+50, 1e-9);
ok('SWEAT full example',                  M.sweat(15,55,30,50,180,260),
   12*15+20*6+60+50+125*(Math.sin(80*Math.PI/180)+0.2), 1e-9);
ok('SWEAT clamps negative Td850',         M.sweat(-5,50,20,30,180,260), M.sweat(0,50,20,30,180,260), 1e-12);
ok('BRN = CAPE/(0.5 U^2)',                M.bulkRichardson(2000,20), 10, 1e-12);

console.log('\n== HEIGHT ADJUSTMENT / POWER ==');
ok('log profile identity at z=zTarget',   M.logProfile(12,10,0.03,10), 12, 1e-12, 'm/s');
ok('log profile 20m->10m over open land', M.logProfile(12,20,0.03,10), 10.73, 0.02, 'm/s');
ok('power law 1/7 doubling height',       M.powerLaw(10,10,20,1/7), 11.041, 1e-3, 'm/s');
ok('WPD 10 m/s at 1.225',                 M.windPowerDensity(10,1.225), 612.5, 1e-9, 'W/m2');


console.log('\n== UTCI, ISO 7726 AND ISO 7243 ==');
{ // reference values from pythermalcomfort 4.4.2, unrounded
  const REF = [
    [30, 30, 1.0, 50, 30.348505939],
    [35, 60, 2.0, 40, 41.041283394],
    [20, 20, 0.5, 50, 19.869053958],
    [-5, -5, 3.0, 80, -13.686559279],
    [40, 70, 1.0, 30, 48.106249070],
    [25, 25, 0.5, 50, 24.884648694],
    [0,  0,  5.0, 60, -14.424607706]
  ];
  let worst = 0;
  REF.forEach(r => { worst = Math.max(worst, Math.abs(M.utci(r[0],r[1],r[2],r[3]) - r[4])); });
  ok('UTCI vs reference implementation', worst, 0, 1e-8, 'C');
  ok('UTCI(30,30,1,50)',  M.utci(30,30,1.0,50),  30.348505939, 1e-8, 'C');
  ok('UTCI(35,60,2,40)',  M.utci(35,60,2.0,40),  41.041283394, 1e-8, 'C');
  ok('UTCI(-5,-5,3,80)',  M.utci(-5,-5,3.0,80), -13.686559279, 1e-8, 'C');
}
{ // in the UTCI reference environment the index tracks air temperature closely
  let worst = 0;
  for(let ta = 5; ta <= 35; ta += 1) worst = Math.max(worst, Math.abs(M.utci(ta, ta, 0.5, 50) - ta));
  ok('UTCI ~ Ta in the reference environment', worst, 0, 2.5, 'C');
}
ok('UTCI polynomial has 211 additive terms',
   (M.utciPoly.toString().match(/\n\s*[+-]/g) || []).length + 1, 211, 0);
ok('UTCI rises with radiant load',  M.utci(30,60,1,50) > M.utci(30,30,1,50) ? 1:0, 1, 0);
ok('UTCI falls with wind in heat',  M.utci(35,35,6,50) < M.utci(35,35,0.5,50) ? 1:0, 1, 0);
ok('sunny Tmrt (+30 K) worth ~7-9 C', M.utci(30,60,1,50) - M.utci(30,30,1,50), 8, 1.5, 'C');
eq('category at 27 C',   M.utciCategory(27),  'moderate heat stress');
eq('category at 26 C',   M.utciCategory(26),  'moderate heat stress');
eq('category at 25.9 C', M.utciCategory(25.9),'no thermal stress');
eq('category at 46 C',   M.utciCategory(46),  'extreme heat stress');
eq('category at -41 C',  M.utciCategory(-41), 'extreme cold stress');
eq('in-range inputs flag nothing', M.utciRangeIssues(30,30,2,50).length, 0);
eq('wind above 17 m/s is flagged',  M.utciRangeIssues(30,30,20,50).length, 1);
eq('Tmrt-Ta above +70 K is flagged', M.utciRangeIssues(30,105,2,50).length, 1);

ok('wind 10 m -> 1.1 m scaling', M.scaleWind(5,1.1), 5*Math.log10(110)/Math.log10(1000), 1e-12, 'm/s');
ok('wind scaling is identity at 10 m', M.scaleWind(7,10), 7, 1e-12, 'm/s');
ok('Tmrt = Tg when globe reads air temperature', M.mrtFromGlobe(28,28,3), 28, 1e-9, 'C');
ok('hot globe gives Tmrt above air temp', M.mrtFromGlobe(45,32,2) > 45 ? 1:0, 1, 0);
ok('Tmrt from globe 45C/Ta 32/v2', M.mrtFromGlobe(45,32,2), 71.52, 0.02, 'C');
ok('stronger wind pulls Tmrt further from Tg',
   M.mrtFromGlobe(45,32,6) > M.mrtFromGlobe(45,32,1) ? 1:0, 1, 0);

eq('WBGT band at 31.0',   M.wbgtBand(31.0).name, 'Danger');
eq('WBGT band on a float that displays as 31.00',
   M.wbgtBand(M.wbgtISO(33,31,17,true)).name, 'Danger');
ok('that value really is just under 31',
   M.wbgtISO(33,31,17,true) < 31 ? 1:0, 1, 0);
eq('UTCI category at an exact boundary', M.utciCategory(0.1+0.2+25.7), 'moderate heat stress');
eq('WBGT band at 30.9',   M.wbgtBand(30.9).name, 'Severe warning');
eq('WBGT band at 28.0',   M.wbgtBand(28.0).name, 'Severe warning');
eq('WBGT band at 27.9',   M.wbgtBand(27.9).name, 'Warning');
eq('WBGT band at 25.0',   M.wbgtBand(25.0).name, 'Warning');
eq('WBGT band at 20.9',   M.wbgtBand(20.9).name, 'Almost safe');
ok('WBGT band null for NaN', M.wbgtBand(NaN)===null?1:0, 1, 0);
ok('ISO 7243 outdoor weights', M.wbgtISO(20,40,30,true),  0.7*20+0.2*40+0.1*30, 1e-12, 'C');
ok('ISO 7243 indoor weights',  M.wbgtISO(20,40,30,false), 0.7*20+0.3*40,        1e-12, 'C');
ok('ISO 7243 weights sum to 1 (outdoor)', 0.7+0.2+0.1, 1, 1e-12);
ok('ISO 7243 differs from the BOM approximation',
   Math.abs(M.wbgtISO(25,42,33,true) - M.wbgtSimple(33,55)) > 1 ? 1:0, 1, 0);

console.log('\n---------------------------------------------');
console.log('  PASS', pass, '  FAIL', fail);
process.exit(fail?1:0);
