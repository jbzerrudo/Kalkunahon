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

console.log('\n== LILJEGREN OUTDOOR WBGT / KNMI HITTEKRACHT ==');
{
  // De Bilt 52.10N 5.18E, 21 Jun 2026 12:00 UTC. Max solar elevation at this
  // latitude on the solstice is 90 - 52.10 + 23.44 = 61.34 deg, reached at
  // true solar noon (about 11:39 UTC at 5.18E), so 12:00 UTC sits just below it.
  const d = new Date(Date.UTC(2026,5,21,12,0,0));
  const sp = M.ljSolarPosition(d, 52.10, 5.18);
  ok('solar elevation, De Bilt solstice noon',  sp.elev, 61.2, 0.3, 'deg');
  ok('Earth-Sun distance late June',            sp.soldist, 1.0163, 0.001, 'AU');
  ok('cza = cos(90-elev)',                      sp.cza, Math.cos((90-sp.elev)*Math.PI/180), 1e-12);

  // Liljegren's psychrometric branch (rad=0) against Stull (2011), which is an
  // independent regression fit. Stull is weakest at high T with low RH.
  const stull=(T,RH)=>T*Math.atan(0.151977*Math.sqrt(RH+8.313659))+Math.atan(T+RH)
    -Math.atan(RH-1.676331)+0.00391838*Math.pow(RH,1.5)*Math.atan(0.023101*RH)-4.686035;
  for(const [T,RH,tol] of [[20,50,0.2],[25,60,0.2],[30,80,0.2],[30,50,0.6]]){
    const r = M.wbgtLiljegren(T,RH,1013.25,1.0,800,d,52.10,5.18);
    ok('psychrometric Tw vs Stull  T='+T+' RH='+RH, r.tpsy, stull(T,RH), tol, 'C');
  }

  // Physical behaviour
  const day = M.wbgtLiljegren(28,55,1013.25,3,750,d,52.10,5.18);
  ok('WBGT = 0.7 Tnwb + 0.2 Tg + 0.1 Ta', day.wbgt, 0.7*day.tnwb+0.2*day.tg+0.1*28, 1e-12);
  eq('globe hotter than air in sunshine',  day.tg > 28, true);
  eq('natural wet bulb above psychrometric', day.tnwb > day.tpsy, true);

  const night = M.wbgtLiljegren(20,80,1013.25,2,0,new Date(Date.UTC(2026,5,21,1,0,0)),52.10,5.18);
  eq('globe cooler than air at night',     night.tg < 20, true);
  eq('no direct beam at night',            night.fdir === 0, true);

  const calm = M.wbgtLiljegren(30,50,1013.25,1,800,d,52.10,5.18);
  const windy = M.wbgtLiljegren(30,50,1013.25,5,800,d,52.10,5.18);
  eq('WBGT falls as wind rises',           windy.wbgt < calm.wbgt, true);

  // KNMI TR-26-04 Table 1 band edges
  eq('hittekracht 13.9 C -> 0',  M.hittekracht(13.9), 0);
  eq('hittekracht 14.0 C -> 1',  M.hittekracht(14.0), 1);
  eq('hittekracht 16.0 C -> 2',  M.hittekracht(16.0), 2);
  eq('hittekracht 20.0 C -> 4',  M.hittekracht(20.0), 4);
  eq('hittekracht 28.0 C -> 8',  M.hittekracht(28.0), 8);
  eq('hittekracht 31.9 C -> 9',  M.hittekracht(31.9), 9);
  eq('hittekracht 32.0 C -> 10', M.hittekracht(32.0), 10);
  eq('hittekracht 45.0 C -> 10', M.hittekracht(45.0), 10);
}

console.log('\n== SUNRISE, SUNSET, DAY LENGTH ==');
{
  /* Rounded to the nearest minute, which is what the card does from v1.4.0. Truncating, which
     is what slice() on an ISO string does, put half of every displayed time a minute early. */
  const hh = (d,off) => d ? (new Date(Math.round((d.getTime()+off*3600e3)/60000)*60000).toISOString().slice(11,16)) : '--:--';
  // De Bilt on the June solstice. Published: rise 05:19, set 22:04 CEST,
  // day length about 16 h 45 m.
  const b = M.sunTimes(new Date(Date.UTC(2026,5,21)), 52.10, 5.18);
  eq('De Bilt solstice sunrise 05:18 CEST', hh(b.rise.up,2),   '05:18');
  eq('De Bilt solstice sunset 22:04 CEST',  hh(b.rise.down,2), '22:04');   // 20:03:42 UTC, rounds up
  ok('De Bilt solstice day length',         b.dayLength, 16.75, 0.05, 'h');
  ok('De Bilt solstice noon elevation',     b.maxElev, 61.3, 0.2, 'deg');
  // Manila, same date and an ordinary September day. Published: 05:28/18:27
  // and 05:44/18:06 PHT.
  const m1 = M.sunTimes(new Date(Date.UTC(2026,5,21)), 14.60, 120.98);
  eq('Manila solstice sunrise 05:28 PHT',   hh(m1.rise.up,8),   '05:28');
  eq('Manila solstice sunset 18:28 PHT',    hh(m1.rise.down,8), '18:28');   // 10:27:36 UTC, rounds up
  const m2 = M.sunTimes(new Date(Date.UTC(2026,8,4)), 14.60, 120.98);
  eq('Manila 4 Sep sunrise 05:44 PHT',      hh(m2.rise.up,8),   '05:44');
  eq('Manila 4 Sep sunset 18:06 PHT',       hh(m2.rise.down,8), '18:06');
  ok('Manila 4 Sep day length near 12 h',   m2.dayLength, 12.36, 0.05, 'h');
  // Twilight is ordered, and the equinox gives about 12 hours everywhere
  eq('civil dawn precedes sunrise',         b.civil.up < b.rise.up, true);
  eq('nautical precedes civil',             b.nautical.up < b.civil.up, true);
  eq('astronomical precedes nautical',      b.astronomical.up < b.nautical.up, true);
  const eq0 = M.sunTimes(new Date(Date.UTC(2026,2,20)), 0, 0);
  ok('equator at equinox is ~12 h',         eq0.dayLength, 12.1, 0.1, 'h');
  // Polar day: Tromso in June never sets
  const tr = M.sunTimes(new Date(Date.UTC(2026,5,21)), 69.65, 18.96);
  eq('Tromso midsummer sun never sets',     tr.rise.state, 'never below');
}

console.log('\n== ACGIH HEAT STRESS SCREENING (2026 TLVs p.242) ==');
{
  const A=(w,l,a)=>{const r=M.acgihAllocation(w,l,a); return r?r.label:'none';};
  eq('acclim light 31.0 -> 75-100% work',      A(31.0,'light',true),      '75-100% work');
  eq('acclim light 31.5 -> 25-50%',          A(31.5,'light',true),      '25-50% work');
  eq('acclim light 32.6 -> none',            A(32.6,'light',true),      'none');
  eq('acclim moderate 28.0 -> 75-100% work',   A(28.0,'moderate',true),   '75-100% work');
  eq('acclim moderate 28.5 -> 50-75%',       A(28.5,'moderate',true),   '50-75% work');
  eq('acclim heavy 27.5 -> 50-75%',          A(27.5,'heavy',true),      '50-75% work');
  eq('acclim heavy 27.6 -> 25-50%',          A(27.6,'heavy',true),      '25-50% work');
  eq('acclim very heavy 28.0 -> 25-50%',     A(28.0,'veryheavy',true),  '25-50% work');
  eq('unacclim light 28.0 -> 75-100% work',    A(28.0,'light',false),     '75-100% work');
  eq('unacclim moderate 25.0 -> 75-100% work', A(25.0,'moderate',false),  '75-100% work');
  eq('unacclim moderate 25.1 -> 50-75%',     A(25.1,'moderate',false),  '50-75% work');
  eq('unacclim heavy 24.0 -> 50-75%',        A(24.0,'heavy',false),     '50-75% work');
  eq('unacclim very heavy 27.1 -> none',     A(27.1,'veryheavy',false), 'none');
  // ACGIH gives no continuous-work entry for heavy or very heavy. Below their
  // lowest limit the table constrains nothing, and saying "50-75% work" there
  // would invent a restriction.
  const U=(w,l,a)=>{const r=M.acgihAllocation(w,l,a); return r?!!r.untabulated:null;};
  eq('heavy at 18.4 is below the tabulated range',      U(18.4,'heavy',true), true);
  eq('very heavy at 18.4 is below the tabulated range', U(18.4,'veryheavy',true), true);
  eq('heavy at its 27.5 limit is tabulated',            U(27.5,'heavy',true), false);
  eq('light is never flagged untabulated',              U(10,'light',true), false);
  eq('moderate is never flagged untabulated',           U(10,'moderate',true), false);
  eq('unacclim heavy at 20 is below the tabulated range', U(20,'heavy',false), true);
  eq('unacclim heavy at its 24.0 limit is tabulated',     U(24.0,'heavy',false), false);

  eq('unacclimatised is never more permissive than acclimatised',
     ['light','moderate','heavy','veryheavy'].every(l=>{
       const t=M.ACGIH_WBGT.acclimatised[l], u=M.ACGIH_WBGT.unacclimatised[l];
       return t.every((row,i)=>u[i][1] <= row[1]);
     }), true);
}

console.log('\n== HEIGHT ADJUSTMENT / POWER ==');
ok('log profile identity at z=zTarget',   M.logProfile(12,10,0.03,10), 12, 1e-12, 'm/s');
ok('log profile 20m->10m over open land', M.logProfile(12,20,0.03,10), 10.73, 0.02, 'm/s');
ok('power law 1/7 doubling height',       M.powerLaw(10,10,20,1/7), 11.041, 1e-3, 'm/s');
ok('WPD 10 m/s at 1.225',                 M.windPowerDensity(10,1.225), 612.5, 1e-9, 'W/m2');


console.log('\n== UTCI, ISO 7726 AND ISO 7243 ==');
/* These are NOT taken from pythermalcomfort's utci(). pythermalcomfort 4.4.2 computes the
   saturation vapour pressure with np.log1p(tk) where the ITS-90 form needs log(tk), which makes
   its es 0.9% high, and this engine carried the same line. Checking one against the other
   certified the error: the values this block used to assert were produced by the bug.
   So the two halves are sourced separately. The 210-coefficient polynomial comes from
   pythermalcomfort's _utci_optimized, which is exact. The vapour pressure is checked against
   physics: es(0 C) must be 6.112 hPa, which log(tk) gives as 6.1121 and log1p gives as 6.1731. */
ok('utciEs(0) is the textbook 6.112 hPa', M.utciEs(0), 6.1121, 5e-4, 'hPa');
ok('utciEs agrees with the engine Magnus esWater to 0.5%', M.utciEs(20)/M.esWater(20), 1, 5e-3);
{ // polynomial from pythermalcomfort _utci_optimized, vapour pressure from es() above
  const REF = [
    [30, 30, 1.0, 50,  30.310675977],
    [35, 60, 2.0, 40,  41.016510895],
    [20, 20, 0.5, 50,  19.847649454],
    [-5, -5, 3.0, 80, -13.698154934],
    [40, 70, 1.0, 30,  48.082422730],
    [25, 25, 0.5, 50,  24.854380261],
    [0,  0,  5.0, 60, -14.438495967],
    [33, 33, 2.0, 75,  36.888023753],
    [23, 23, 1.0, 100, 25.933076628]
  ];
  let worst = 0;
  REF.forEach(r => { worst = Math.max(worst, Math.abs(M.utci(r[0],r[1],r[2],r[3]) - r[4])); });
  ok('UTCI vs reference polynomial', worst, 0, 1e-8, 'C');
  ok('UTCI(30,30,1,50)',   M.utci(30,30,1.0,50),   30.310675977, 1e-8, 'C');
  ok('UTCI(35,60,2,40)',   M.utci(35,60,2.0,40),   41.016510895, 1e-8, 'C');
  ok('UTCI(-5,-5,3,80)',   M.utci(-5,-5,3.0,80),  -13.698154934, 1e-8, 'C');
  ok('UTCI(23,23,1,100)',  M.utci(23,23,1.0,100),  25.933076628, 1e-8, 'C');
  eq('and 23C/100% RH is no thermal stress, not moderate', M.utciCategory(M.utci(23,23,1,100)), 'no thermal stress');
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


/* =====================================================================
   REGRESSIONS — one per defect found in the September 2026 review
   ===================================================================== */
console.log('\n== REGRESSIONS ==');

/* Humidex, from Masterton & Richardson (1979), CLI 1-79, read from the report.
   Table 1 converts dew point to h, rounded to whole numbers, and the text gives one worked
   example. The report defines 273.16 as the melting point of ice, so it is its own 0 C and
   belongs in both places; and h is 5/9 (e - 10), not 0.5555 (e - 10). */
{
  const T1 = {10:1,11:2,12:2,13:3,14:3,15:4,16:5,17:5,18:6,19:7,
              20:8,21:8,22:9,23:10,24:11,25:12,26:13,27:15};
  let bad = [];
  for(const td in T1){
    const h = Math.round(M.humidex(0, +td));
    if(h !== T1[td]) bad.push('Td='+td+' gives '+h+', Table 1 says '+T1[td]);
  }
  eq('all 18 entries of Table 1 reproduced', bad.join('; ') || 'none', 'none');
  ok('worked example T=31 Td=16 gives humidex 36', Math.round(M.humidex(31,16)), 36, 0);
  /* The coefficient is MwL/R* from the report's own figures, not a number taken on trust. */
  ok('5417.7530 is MwL/R* from the report', 18.016*597.3*4.186e7/8.3144e7, 5417.7530, 1e-3);
  /* Putting 273.16 in the first term only, which is the usual recommendation, is further from
     the published formula than leaving both at 273.15. Guard against anyone "fixing" it back. */
  {
    const K = 5417.7530, mixed = (t,td)=>t+0.5555*(6.11*Math.exp(K*(1/273.16-1/(td+273.15)))-10);
    ok('the mixed 273.16/273.15 form departs by more than 0.04 at 50 C',
       Math.abs(mixed(49.9,49.8) - M.humidex(49.9,49.8)), 0.0442, 5e-3);
  }
}

/* ACGIH 2026 TLVs and BEIs, Table 3 on p.242, read from the booklet itself: every value and
   every deliberately empty cell. Rows are the allocation of work within the hour, so the top
   row is 75-100%, not continuous work. */
{
  const T3 = {
    acclimatised:   {light:[31.0,31.0,32.0,32.5], moderate:[28.0,29.0,30.0,31.5],
                     heavy:[null,27.5,29.0,30.5], veryheavy:[null,null,28.0,30.0]},
    unacclimatised: {light:[28.0,28.5,29.5,30.0], moderate:[25.0,26.0,27.0,29.0],
                     heavy:[null,24.0,25.5,28.0], veryheavy:[null,null,24.5,27.0]}
  };
  const LAB = ['75-100% work','50-75% work','25-50% work','0-25% work'];
  let bad = [], n = 0;
  for(const state in T3) for(const load in T3[state]){
    const rows = M.ACGIH_WBGT[state][load];
    const want = T3[state][load].map((v,i)=>v===null?null:[LAB[i],v]).filter(Boolean);
    if(rows.length !== want.length){ bad.push(state+'/'+load+' has '+rows.length+' rows, ACGIH has '+want.length); continue; }
    rows.forEach((r,i)=>{ n++;
      if(r[0] !== want[i][0] || Math.abs(r[1]-want[i][1]) > 1e-9) bad.push(state+'/'+load+'/'+r[0]); });
  }
  eq('all '+n+' ACGIH Table 3 cells match the printed table', bad.join('; ') || 'none', 'none');
  eq('heavy work has no 75-100% cell',      M.ACGIH_WBGT.acclimatised.heavy[0][0], '50-75% work');
  eq('very heavy has no 50-75% cell either', M.ACGIH_WBGT.acclimatised.veryheavy[0][0], '25-50% work');
}

/* WMO/TD-No. 1555 Table 1.1 in full, transcribed from the document itself
   (systemsengineeringaustralia.com.au/download/WMO_TC_Wind_Averaging_27_Aug_2010.pdf).
   Order within each array is at-sea, off-sea, off-land, in-land. */
{
  const WMO = {
    3600:{3:[1.30,1.45,1.60,1.75],60:[1.11,1.17,1.22,1.28],120:[1.07,1.11,1.15,1.19],180:[1.06,1.09,1.12,1.15],600:[1.03,1.05,1.06,1.08]},
    600 :{3:[1.23,1.38,1.52,1.66],60:[1.05,1.11,1.16,1.21],120:[1.02,1.05,1.09,1.12],180:[1.00,1.03,1.06,1.09],600:[1.00,1.00,1.00,1.00]},
    180 :{3:[1.17,1.31,1.44,1.58],60:[1.00,1.05,1.10,1.15],120:[1.00,1.00,1.04,1.07],180:[1.00,1.00,1.00,1.00]},
    120 :{3:[1.15,1.28,1.42,1.55],60:[1.00,1.03,1.08,1.13],120:[1.00,1.00,1.00,1.00]},
    60  :{3:[1.11,1.23,1.36,1.49],60:[1.00,1.00,1.00,1.00]}
  };
  let bad = [], n = 0;
  for(const T0 in WMO) for(const tau in WMO[T0]) M.EXPOSURES.forEach((e,i)=>{
    n++;
    if(Math.abs(M.gustFactor(+tau, +T0, e) - WMO[T0][tau][i]) > 1e-9)
      bad.push(T0+'/'+tau+'/'+e);
  });
  eq('all '+n+' entries of WMO Table 1.1 match the published table', bad.join(',') || 'none', 'none');
  eq('gust shorter than the mean period is refused', isFinite(M.gustFactor(3600, 600, 'at-sea'))?1:0, 0);
}

// NWS publishes one worked heat-index example on weather.gov/safety/heat-index
ok('NWS worked example: 96 F at 65% RH gives 121 F', M.heatIndexF(96,65).hi, 121, 0.1, 'F');
// and the adjustment gates on wpc.ncep.noaa.gov/html/heatindex_equation.shtml
eq('dry adjustment applies at 112 F',      M.heatIndexF(112,5).branch, 'rothfusz+dry adj');
eq('and not at 113 F, where the root goes negative', M.heatIndexF(113,5).branch, 'rothfusz');
eq('humid adjustment applies at 87 F',     M.heatIndexF(87,90).branch, 'rothfusz+humid adj');
eq('and not at 88 F',                      M.heatIndexF(88,90).branch, 'rothfusz');

// UTCI saturation vapour pressure: log(T), not log1p(T)
ok('utciEs(30) is near the Magnus value', M.utciEs(30), 42.47, 0.05, 'hPa');
ok('23C/100%RH UTCI is 25.93, not the 26.02 the log1p form gave', M.utci(23,23,1,100), 25.933076628, 1e-8, 'C');

// UTCI published domain, Broede et al. (2012) usage guidelines
eq('pa above 50 hPa is flagged', M.utciRangeIssues(50,50,1,100).some(x=>/vapour pressure/.test(x))?1:0, 1);
eq('and 33C at 100% RH is already past it', M.utciRangeIssues(33,33,1,100).some(x=>/vapour pressure/.test(x))?1:0, 1);
eq('30C at 100% RH is not', M.utciRangeIssues(30,30,1,100).some(x=>/vapour pressure/.test(x))?1:0, 0);
eq('wind below 0.5 m/s is flagged', M.utciRangeIssues(30,30,0.2,50).length, 1);
eq('wind above 30.3 m/s is flagged', M.utciRangeIssues(30,30,35,50).length, 1);

// TC scales: every published threshold, in every unit its agency publishes, lands in its own band
{ // only the units each agency actually publishes; the other columns are this app's conversions
  const KEY = {kt:'lo', kmh:'kmh', ms:'ms'};
  let bad = [];
  for(const s of M.TC_SCALES) for(const b of s.bands) for(const unit of (s.pub || ['kt'])){
    const k = KEY[unit];
    if(b[k] === undefined){ bad.push(s.id+' has no '+unit+' bound'); continue; }
    const got = M.classify(M.speedTo(b[k], unit, 'kt'), s, unit);
    if(!got || got.name !== b.name) bad.push(s.id+' '+b[k]+unit+' -> '+(got?got.name:'null'));
  }
  eq('every published TC threshold classifies into its own band', bad.join('; ') || 'none', 'none');
}
{ const b = M.TC_SCALES.find(s=>s.id==='bom');
  // BOM publishes km/h only. Its Cat 1 floor of 63 km/h is 34 kt to the knot, and 34 kt is
  // 62.97 km/h, so a knot input must be rounded to BOM's reporting precision before comparing.
  eq('BOM 63 km/h is Category 1',   M.classify(M.speedTo(63,'kmh','kt'), b, 'kmh').name, 'Category 1');
  eq('BOM 118 km/h is Category 3',  M.classify(M.speedTo(118,'kmh','kt'), b, 'kmh').name, 'Category 3 (severe)');
  eq('BOM 160 km/h is Category 4',  M.classify(M.speedTo(160,'kmh','kt'), b, 'kmh').name, 'Category 4 (severe)');
  eq('BOM 200 km/h is Category 5',  M.classify(M.speedTo(200,'kmh','kt'), b, 'kmh').name, 'Category 5 (severe)');
  eq('BOM 62 km/h is below Category 1', M.classify(M.speedTo(62,'kmh','kt'), b, 'kmh').name, 'below Category 1');
  eq('BOM 34 kt is Category 1, not 62.97 km/h', M.classify(34, b, 'kt').name, 'Category 1');
  eq('BOM 33 kt is still below Category 1',     M.classify(33, b, 'kt').name, 'below Category 1');
  eq('BOM gust figures are not used: 125 km/h is Cat 3, not Cat 1',
     M.classify(M.speedTo(125,'kmh','kt'), b, 'kmh').name, 'Category 3 (severe)');
}
{ const p = M.TC_SCALES.find(s=>s.id==='pagasa');
  eq('PAGASA 118 km/h is a Typhoon',        M.classify(M.speedTo(118,'kmh','kt'), p, 'kmh').name, 'Typhoon');
  eq('PAGASA 39 km/h is a Tropical Depression', M.classify(M.speedTo(39,'kmh','kt'), p, 'kmh').name, 'Tropical Depression');
  eq('PAGASA 185 km/h is a Super Typhoon',  M.classify(M.speedTo(185,'kmh','kt'), p, 'kmh').name, 'Super Typhoon');
  eq('PAGASA 48 kt is a Severe Tropical Storm', M.classify(48, p, 'kt').name, 'Severe Tropical Storm');
  eq('PAGASA 22 kt is a Tropical Depression',   M.classify(22, p, 'kt').name, 'Tropical Depression');
  eq('PAGASA 21.9 kt is still a Low Pressure Area', M.classify(21.9, p, 'kt').name, 'Low Pressure Area');
}
{ const c = M.TC_SCALES.find(s=>s.id==='cma'), k = M.TC_SCALES.find(s=>s.id==='kma');
  eq('CMA 32.7 m/s is a Typhoon',  M.classify(M.speedTo(32.7,'ms','kt'), c, 'ms').name, 'Typhoon');
  eq('CMA 10.8 m/s is a Tropical Depression', M.classify(M.speedTo(10.8,'ms','kt'), c, 'ms').name, 'Tropical Depression');
  eq('KMA 33 m/s is a Typhoon',    M.classify(M.speedTo(33,'ms','kt'), k, 'ms').name, 'Typhoon');
  eq('KMA 14 m/s is a Tropical Depression',  M.classify(M.speedTo(14,'ms','kt'), k, 'ms').name, 'Tropical Depression');
}
eq('a negative wind is on no scale', M.classify(-5, M.TC_SCALES[0], 'kt'), null);
{ const l = M.tcClassifyAll(90, 60, 'at-sea', 'kt');
  eq('CMA 2-min says no WMO factor, not "native"', l.find(r=>r.scale.id==='cma').note, 'no WMO factor');
  eq('IMD 3-min says no WMO factor',               l.find(r=>r.scale.id==='imd').note, 'no WMO factor');
  eq('JMA 10-min from a 1-min input is converted', /^x/.test(l.find(r=>r.scale.id==='jma').note)?1:0, 1);
}

// Sun times
{ const r = M.sunTimes(new Date(Date.UTC(2026,5,21)), 14.60, 120.98, 8);
  const m = Math.round(r.dayLength*60);
  eq('Manila solstice day length carries to 13 h 00 m', Math.floor(m/60)+' h '+String(m%60).padStart(2,'0')+' m', '13 h 00 m');
  const set = new Date(Math.round((r.rise.down.getTime()+8*3600e3)/60000)*60000).toISOString().slice(11,16);
  eq('Manila solstice sunset rounds to 18:28, not 18:27', set, '18:28');
}
{ const r = M.sunTimes(new Date(Date.UTC(2026,5,21)), 52.10, 5.18, 2);
  const set = new Date(Math.round((r.rise.down.getTime()+2*3600e3)/60000)*60000).toISOString().slice(11,16);
  eq('De Bilt solstice sunset rounds to 22:04, not 22:03', set, '22:04');
}
{ const a = M.sunTimes(new Date(Date.UTC(2026,5,21)), -13.83, -171.77, 13);
  const d = new Date(a.rise.up.getTime()+13*3600e3);
  eq('Apia at UTC+13 gets the day it was asked for', d.toISOString().slice(0,10), '2026-06-21');
}

// ISA above the tropopause
{ let lo = 11000, hi = 25000;
  for(let i=0;i<80;i++){ const m=(lo+hi)/2; if(M.isa(m).p > 100) lo=m; else hi=m; }
  ok('pressureAltitude(100 hPa) inverts isa()', M.pressureAltitude(100), (lo+hi)/2, 0.5, 'm');
  ok('pressureAltitude(500 hPa) unchanged below the tropopause', M.pressureAltitude(500), 5574.0, 1.0, 'm');
  eq('pressureAltitude rejects zero', isFinite(M.pressureAltitude(0))?1:0, 0);
}

// Saturated lapse rate where es exceeds the pressure
eq('moistLapse is NaN when es >= p', isFinite(M.moistLapse(319.15, 100))?1:0, 0);
eq('moistLapseDTDP likewise',        isFinite(M.moistLapseDTDP(319.15, 100))?1:0, 0);
ok('and is unchanged where it is defined', M.moistLapse(283.15, 700), 4.584, 0.01, 'K/km');

// The wet-bulb inverse behind the ISO 7243 humidity row
ok('rhFromWetBulb round-trips', M.wetBulbPsychro(33, M.rhFromWetBulb(33,25,1013.25), 1013.25), 25, 1e-6, 'C');
ok('and reads lower than treating Tnw as a dewpoint', M.rhFromWetBulb(33,25,1013.25), 51.98, 0.1, '%');
eq('a wet bulb above air temperature is NaN', isFinite(M.rhFromWetBulb(30,33,1013.25))?1:0, 0);

console.log('\n---------------------------------------------');
console.log('  PASS', pass, '  FAIL', fail);
process.exit(fail?1:0);
