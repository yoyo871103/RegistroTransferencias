// Pruebas del lector de SMS con el formato real de PAGOxMOVIL.
// Mismo texto que las capturas, pero con teléfonos y cuenta CAMBIADOS (datos de clientes reales).
const CFG = require('./config');
const src = require('fs').readFileSync(process.argv[2] || CFG.SALIDA + '/app.js', 'utf8');
const ini = src.indexOf('var SMS_REMITENTES'), fin = src.indexOf('/* Envía a Android');
const ctx = `
  var LARGO = 13, d = { patrones: [{pre:'KW601',suf:'999'},{pre:'BR60',suf:'997'},{pre:'MM604',suf:'987'}],
                        registros: [], porRegistrar: [], smsDescartados: [], sms: { remitentes: ['PAGOxMOVIL'] } };
  function p2(n){ return (n<10?'0':'') + n; }
  function hoy(){ var f = new Date(); return f.getFullYear() + '-' + p2(f.getMonth()+1) + '-' + p2(f.getDate()); }
  ${src.slice(src.indexOf('function digitosTel'), src.indexOf('/* ---------- inicio'))}
  ${src.slice(ini, fin)}
  return { analizarSms, incorporarSms, pendientesSms, d };`;
const M = new Function(ctx)();
let fallos = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fallos++; };

const sms = (tel, imp, cod) => (tel ? `El titular del telefono ${tel} le ha realizado` : 'Se ha realizado') +
  ` una transferencia a la cuenta 9999000011112222 de ${imp} CUP. Nro. Transaccion ${cod}. Fecha: 15/10/2026.`;
const casos = [
  [sms('5351112233', '10000.00', 'KW601YFBRP999'), 'KW601YFBRP999', 10000, '+53 5111 2233'],
  [sms('5352223344', '6350.00', 'KW601YF8TT999'), 'KW601YF8TT999', 6350, '+53 5222 3344'],
  [sms('5353334455', '3460.00', 'BR601CTOF2997'), 'BR601CTOF2997', 3460, '+53 5333 4455'],
  [sms('5354445566', '9720.00', 'BR601CTIC9997'), 'BR601CTIC9997', 9720, '+53 5444 5566'],
  [sms(null, '9400.00', 'KW601YFLS2999'), 'KW601YFLS2999', 9400, ''],
  [sms('5355556677', '8500.00', 'KW601YED68999'), 'KW601YED68999', 8500, '+53 5555 6677'],
  // tal como pasaría si el banco cambia de formato y no dice "Transaccion"
  ['Recibio 1.250,00 CUP. Ref MM60412345987', 'MM60412345987', 1250, ''],
];
for (const [t, cod, imp, tel] of casos){
  const a = M.analizarSms(t);
  ok(a && a.codigo === cod && a.importe === imp && a.telefono === tel, JSON.stringify(a));
}
ok(M.analizarSms('ETECSA: Su saldo es 25.00 CUP. Vence el 01/12/2026') === null, 'SMS que no es transferencia: null');
ok(M.analizarSms('Su codigo de verificacion es 123456') === null, 'código de verificación: null');

// hoy / remitente / registrado / usado
const ahora = Date.now(), ayer = ahora - 864e5;
M.d.registros.push({ codigo: 'KW601YF8TT999' });   // el cajero ya lo tecleó a mano
M.d.smsDescartados.push('BR601CTIC9997');           // marcado como ya usado
const n = M.incorporarSms([
  { remitente: 'PAGOxMOVIL', cuerpo: casos[0][0], fecha: ahora },
  { remitente: 'pagoxmovil', cuerpo: casos[2][0], fecha: ahora },
  { remitente: 'PAGOxMOVIL', cuerpo: casos[1][0], fecha: ahora },   // ya registrado
  { remitente: 'PAGOxMOVIL', cuerpo: casos[3][0], fecha: ahora },   // ya usado
  { remitente: 'PAGOxMOVIL', cuerpo: casos[4][0], fecha: ayer },    // de ayer
  { remitente: '5359998877', cuerpo: casos[5][0], fecha: ahora },   // otro remitente
  { remitente: 'PAGOxMOVIL', cuerpo: casos[0][0], fecha: ahora },   // repetido
]);
ok(n === 2 && M.pendientesSms().map(p => p.codigo).join() === 'KW601YFBRP999,BR601CTOF2997',
   'solo hoy, de PAGOxMOVIL, sin registrados ni usados ni repetidos: ' + M.pendientesSms().map(p => p.codigo));
M.d.registros.push({ codigo: 'BR601CTOF2997' });   // lo registra a mano mientras estaba en la lista
ok(M.pendientesSms().map(p => p.codigo).join() === 'KW601YFBRP999', 'registrado a mano después: deja de ofrecerse');
M.d.porRegistrar[0].fecha = '2000-01-01';
ok(M.pendientesSms().length === 0, 'pasada la medianoche ya no se ofrece');
process.exitCode = fallos ? 1 : 0;
