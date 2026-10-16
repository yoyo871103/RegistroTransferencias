// Lector de SMS con el formato de ENZONA (textos de las capturas; el número es el de ejemplo).
const CFG = require('./config');
const src = require('fs').readFileSync(process.argv[2] || CFG.SALIDA + '/app.js', 'utf8');
const ctx = `
  var LARGO = 13, d = { patrones: [{pre:'KW601',suf:'999'},{pre:'BR60',suf:'997'},{pre:'MM604',suf:'987'}],
                        registros: [], porRegistrar: [], smsDescartados: [], sms: { remitentes: ['PAGOxMOVIL','ENZONA'] } };
  function p2(n){ return (n<10?'0':'') + n; }
  function hoy(){ var f = new Date(); return f.getFullYear() + '-' + p2(f.getMonth()+1) + '-' + p2(f.getDate()); }
  ${src.slice(src.indexOf('function digitosTel'), src.indexOf('/* ---------- inicio'))}
  ${src.slice(src.indexOf('var SMS_REMITENTES'), src.indexOf('/* Envía a Android'))}
  return { analizarSms, incorporarSms, pendientesSms, d };`;
const M = new Function(ctx)();
let fallos = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fallos++; };

const pago = 'ENZONA pago recibido, Importe: 10.00 CUP No.: Xn24kbc2NDFV';
let a = M.analizarSms(pago);
ok(a && a.codigo === 'Xn24kbc2NDFV' && a.importe === 10 && a.telefono === '', 'pago ENZONA: número tal cual e importe: ' + JSON.stringify(a));
a = M.analizarSms('ENZONA pago recibido, Importe: 1,250.50 CUP No.: Ab12Cd34Ef56');
ok(a && a.codigo === 'Ab12Cd34Ef56' && a.importe === 1250.5, 'pago ENZONA con miles: ' + JSON.stringify(a));
for (const t of ['Por su seguridad no comparta este codigo. Es solo para uso personal. CODIGO DE ACCESO ENZONA: 398213',
                 'ENZONA mensaje de acceso: 000235'])
  ok(M.analizarSms(t) === null, 'código de acceso ignorado: ' + t.slice(0, 40));
// PAGOxMOVIL sigue igual
a = M.analizarSms('El titular del telefono 5351112233 le ha realizado una transferencia a la cuenta 9999000011112222 de 10000.00 CUP. Nro. Transaccion KW601YFBRP999. Fecha: 15/10/2026.');
ok(a && a.codigo === 'KW601YFBRP999' && a.importe === 10000 && a.telefono === '+53 5111 2233', 'PAGOxMOVIL sin cambios');

// remitente ENZONA aceptado; repetido o ya tecleado a mano en mayúsculas: no se ofrece
const ahora = Date.now();
let n = M.incorporarSms([{ remitente:'ENZONA', cuerpo:pago, fecha:ahora }, { remitente:'ENZONA', cuerpo:pago, fecha:ahora }]);
ok(n === 1 && M.pendientesSms()[0].codigo === 'Xn24kbc2NDFV', 'ENZONA entra una sola vez');
M.d.registros.push({ codigo:'XN24KBC2NDFV' });
ok(M.pendientesSms().length === 0, 'tecleado a mano en mayúsculas: deja de ofrecerse');
M.d.registros = []; M.d.porRegistrar = []; M.d.smsDescartados = ['XN24KBC2NDFV'];
ok(M.incorporarSms([{ remitente:'ENZONA', cuerpo:pago, fecha:ahora }]) === 0, 'marcado como usado (otra capitalización): no vuelve');
process.exitCode = fallos ? 1 : 0;
