const src=require('fs').readFileSync(process.argv[2] || require('./config').SALIDA + '/app.js','utf8');
const p2s=src.match(/function p2\(n\)[^\n]*/)[0];
const v=src.slice(src.indexOf('function fechaReal'), src.indexOf('/* Teléfono cubano'));
const validarCI=new Function(p2s+'\n'+v+'\nreturn validarCI;')();
const casos = [
  ['', true, ''],
  ...[0,1,2,3,4,5,6,7,8,9].map(s => ['871101' + s + '2345', true, '01/11/1987']),
  ['88110305549', true, '03/11/1988'],
  ['88110375549', true, '03/11/1988'],
  ['05010162345', true, '01/01/2005'],
  ['26010162345', true, '01/01/2026'],
  ['26123162345', true, '31/12/1926'],
  ['00022962345', true, '29/02/2000'],
  ['04022912345', true, '29/02/2004'],
  ['05022912345', false],
  ['87133112345', false],
  ['87113112345', false],
  ['87110012345', false],
  ['8711011234', false],
];
let fallos = 0;
for (const [ci, ok, fecha] of casos){
  const r = validarCI(ci);
  const bien = r.ok === ok && (!ok || r.fecha === fecha);
  if (!bien) fallos++;
  console.log((bien ? 'PASS ' : 'FAIL ') + JSON.stringify(ci).padEnd(15) + JSON.stringify(r));
}
process.exitCode = fallos ? 1 : 0;
