import type { RaffleFields, SiteConfig } from '../lib/types';
import { fmtMoney } from '../lib/format';

/** Marca de dato pendiente: el servidor no deja publicar textos que la contengan. */
export const TODO = (what: string) => `[COMPLETAR: ${what}]`;
export const hasTodo = (text: string | null | undefined) => (text ?? '').includes('[COMPLETAR');

const DAY_FMT = new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', day: 'numeric', month: 'long', year: 'numeric' });
const LONG_FMT = new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const fmtLong = (ms: number) => LONG_FMT.format(ms);

/**
 * Plantilla de bases del sorteo con los elementos de la NOM-028-SCFI-2007 (4.1 y 4.1.10):
 * organizador y domicilio, permiso de Gobernación, vigencia y cobertura, premio, mecánica para
 * obtener boletos, mecánica, lugar y fecha del sorteo, resultados, plazo, lugar y horario de
 * entrega, y teléfono para aclaraciones. Lo que el sistema no sabe queda marcado para completar.
 */
export function buildRaffleRules(f: RaffleFields, cfg: SiteConfig, startIso: string | null): string {
  const store = cfg.store.name || 'la tienda';
  const c = cfg.contact;
  const address = c.address.trim() || TODO('domicilio de la tienda');
  const phone = c.phone.trim() || TODO('teléfono para información y aclaraciones');
  const hours = c.hours.filter((h) => h.days || h.hours).map((h) => `${h.days} ${h.hours}`.trim()).join('; ') || TODO('días y horario de atención');
  const email = c.email.trim();
  const start = DAY_FMT.format(startIso ? new Date(startIso) : new Date());
  const unlock = f.unlock_at ? fmtLong(Date.parse(f.unlock_at)) : TODO('fecha de apertura');
  const draw = f.draw_at ? fmtLong(Date.parse(f.draw_at)) : TODO('fecha y hora del sorteo');
  const value = f.prize_value != null && Number(f.prize_value) > 0
    ? `${fmtMoney(f.prize_value)} MXN, IVA incluido`
    : TODO('valor aproximado del premio en pesos, o borra esta línea');
  const howRaw = f.how_to_get?.trim() || TODO('cómo se obtiene un boleto; por ejemplo, un boleto por cada compra de $500 o más');
  const how = /[.!?\]]$/.test(howRaw) ? howRaw : `${howRaw}.`;
  const permit = f.permit_number?.trim() || TODO('número de permiso de la Secretaría de Gobernación');
  const mechanic = f.draw_mode === 'auto'
    ? 'A la fecha y hora indicadas, el sistema de la tienda elige de forma automática, con un generador de números aleatorios seguro, un boleto entre todos los boletos vigentes.'
    : 'A la fecha y hora indicadas, en un evento en vivo, el sistema de la tienda elige al azar, con un generador de números aleatorios seguro, un boleto entre todos los boletos vigentes.';

  return `## Organizador
${store} (${TODO('nombre completo o razón social del responsable')}), con domicilio en ${address}.
Teléfono para información y aclaraciones: ${phone}. Horario de atención: ${hours}.${email ? ` Correo: ${email}.` : ''}

## Permiso
Sorteo autorizado por la Secretaría de Gobernación con el permiso número ${permit}.

## Vigencia y cobertura
- Periodo para obtener boletos: del ${start} al ${draw} (hora del centro de México).
- Cobertura: local. Únicamente en la tienda ubicada en ${address} y en este sitio web.

## Premio
- Número total de premios: uno (1).
- Premio: ${f.prize.trim() || TODO('premio')}.${f.prize_detail?.trim() ? ` ${f.prize_detail.trim()}` : ''}
- Valor aproximado: ${value}.
- El premio es nuevo, no es canjeable por dinero ni por otro bien y no es transferible.

## Cómo participar
- Pueden participar personas mayores de 18 años con una cuenta en este sitio (se inicia sesión con Google).
- Cómo se obtiene un boleto: ${how}
- El personal de la tienda asigna los boletos al pagar, escaneando el código de cliente que aparece en la pestaña «Sorteo».
- A partir del ${unlock} (hora del centro de México), los códigos impresos en el ticket de compra también se pueden registrar en esa misma pestaña. Cada código sirve una sola vez.
- Cada boleto tiene un número único y consecutivo. Máximo ${f.max_per_customer} boletos por persona.
- El número total de boletos emitidos depende de las compras realizadas durante la vigencia; se muestra en tiempo real en la pestaña «Sorteo».
- No pueden participar las personas que trabajan en ${store} ni sus familiares directos.
- Los boletos asignados por error pueden anularse antes del sorteo; un boleto anulado no participa.

## Fecha, lugar y mecánica del sorteo
- Fecha y hora: ${draw} (hora del centro de México).
- Lugar: ${address}.
- ${mechanic} Cada boleto vigente tiene la misma probabilidad de ganar.
- El sorteo se realiza en presencia del representante que designe la Secretaría de Gobernación, cuando así lo establezca el permiso.

## Resultados y entrega del premio
- El resultado se publica el mismo día del sorteo en la pestaña «Sorteo» de este sitio, con el número del boleto ganador y el nombre abreviado de la persona ganadora (por ejemplo, «Mariana L.»). La tienda también podrá avisar a la persona ganadora al correo de su cuenta.
- Plazo para reclamar el premio: ${f.claim_days} días naturales a partir de la fecha del sorteo. Si no se reclama en ese plazo, se procederá conforme a lo que establezca el permiso de la Secretaría de Gobernación.
- Lugar y horario de entrega: ${address}; ${hours}.
- Para recibirlo, la persona ganadora presenta el código QR que aparece en su cuenta y una identificación oficial vigente con fotografía, con el mismo nombre de la cuenta.
- Los impuestos que se generen por la obtención del premio se cubrirán conforme a la legislación fiscal aplicable.

## Datos personales
Los datos de quienes participan se tratan conforme al Aviso de privacidad publicado en este sitio. Al participar, aceptas que, si ganas, se publiquen tu nombre abreviado y tu número de boleto.

## Aclaraciones
Para dudas o aclaraciones llama al ${phone} (${hours}). También puedes acudir a la Procuraduría Federal del Consumidor (Profeco). Lo no previsto en estas bases se resolverá conforme al permiso otorgado y a la legislación aplicable.`;
}

/** Lo que falta para publicar (lo mismo que valida el servidor). */
export function publishIssues(f: Pick<RaffleFields, 'permit_number' | 'how_to_get' | 'rules_text'>): string[] {
  const out: string[] = [];
  if (!f.permit_number?.trim()) out.push('Número de permiso de la Secretaría de Gobernación');
  if (!f.how_to_get?.trim()) out.push('Cómo se consigue un boleto');
  if ((f.rules_text?.trim().length ?? 0) < 300) out.push('Bases del sorteo');
  else if (hasTodo(f.rules_text)) out.push('Completar los datos marcados como [COMPLETAR …] en las bases');
  return out;
}
