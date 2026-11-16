import type { RaffleFields, SiteConfig } from '../lib/types';
import { fmtMoney } from '../lib/format';

/** Marca de dato pendiente: el servidor no deja publicar textos que la contengan. */
export const TODO = (what: string) => `[COMPLETAR: ${what}]`;
export const hasTodo = (text: string | null | undefined) => (text ?? '').includes('[COMPLETAR');

const DAY_FMT = new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', day: 'numeric', month: 'long', year: 'numeric' });
const LONG_FMT = new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const fmtLong = (ms: number) => LONG_FMT.format(ms);

/** «a, b o c» */
const joinOr = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} o ${xs[xs.length - 1]}`);

/**
 * Plantilla de bases del sorteo: quién organiza, vigencia, premio, cómo se consiguen los boletos,
 * cómo y cuándo se elige al ganador, entrega del premio y datos personales. Usa los datos del
 * sorteo y el contacto de la tienda; lo que falta y no se puede omitir queda marcado para completar.
 */
export function buildRaffleRules(f: RaffleFields, cfg: SiteConfig, startIso: string | null): string {
  const store = cfg.store.name || 'la tienda';
  const c = cfg.contact;
  const address = c.address.trim();
  const phone = c.phone.trim();
  const email = c.email.trim();
  const hours = c.hours.filter((h) => h.days || h.hours).map((h) => `${h.days} ${h.hours}`.trim()).join('; ');
  const atStore = address ? `en la tienda (${address})` : 'en la tienda';
  const start = DAY_FMT.format(startIso ? new Date(startIso) : new Date());
  const unlock = f.unlock_at ? fmtLong(Date.parse(f.unlock_at)) : TODO('fecha de apertura');
  const draw = f.draw_at ? fmtLong(Date.parse(f.draw_at)) : TODO('fecha y hora del sorteo');
  const howRaw = f.how_to_get?.trim() || TODO('cómo se obtiene un boleto; por ejemplo, un boleto por cada compra de $500 o más');
  const how = /[.!?\]]$/.test(howRaw) ? howRaw : `${howRaw}.`;
  const value = f.prize_value != null && Number(f.prize_value) > 0 ? `\n- Valor aproximado: ${fmtMoney(f.prize_value)} MXN, IVA incluido.` : '';
  const mechanic = f.draw_mode === 'auto'
    ? 'A la fecha y hora indicadas, el sistema de la tienda elige de forma automática y al azar un boleto entre todos los boletos vigentes.'
    : `A la fecha y hora indicadas, en vivo ${atStore}, el sistema de la tienda elige al azar un boleto entre todos los boletos vigentes.`;
  const contact = joinOr([
    phone && `llama al ${phone}${hours ? ` (${hours})` : ''}`,
    email && `escribe a ${email}`,
    'acude a la tienda',
  ].filter(Boolean));

  return `## Organiza
${store}${address ? `, con domicilio en ${address}` : ''}.

## Vigencia
- Periodo para obtener boletos: del ${start} al ${draw} (hora del centro de México).
- Participan únicamente las compras hechas en ${store}.

## Premio
- Premio único: ${f.prize.trim() || TODO('premio')}.${f.prize_detail?.trim() ? ` ${f.prize_detail.trim()}` : ''}${value}
- El premio no es canjeable por dinero ni por otro bien y no es transferible.

## Cómo participar
- Pueden participar personas mayores de 18 años con una cuenta en este sitio (se inicia sesión con Google).
- Cómo se obtiene un boleto: ${how}
- El personal de la tienda asigna los boletos al pagar, escaneando el código de cliente que aparece en la pestaña «Sorteo».
- A partir del ${unlock} (hora del centro de México), los códigos impresos en el ticket de compra también se pueden registrar en esa misma pestaña. Cada código sirve una sola vez.
- Cada boleto tiene un número único y consecutivo. Máximo ${f.max_per_customer} boletos por persona.
- No participan las personas que trabajan en ${store}.
- Los boletos asignados por error pueden anularse antes del sorteo; un boleto anulado no participa.

## El sorteo
- Fecha y hora: ${draw} (hora del centro de México).
- ${mechanic} Cada boleto vigente tiene la misma probabilidad de ganar.

## Resultado y entrega del premio
- El resultado se publica el mismo día en la pestaña «Sorteo» de este sitio, con el número del boleto ganador y el nombre abreviado de la persona ganadora (por ejemplo, «Mariana L.»). La tienda también podrá avisarle al correo de su cuenta.
- Plazo para reclamar el premio: ${f.claim_days} días naturales a partir de la fecha del sorteo. Si no se reclama en ese plazo, se pierde el derecho a recibirlo.
- El premio se entrega ${atStore}${hours ? `, ${hours}` : ''}.
- Para recibirlo, la persona ganadora presenta el código QR que aparece en su cuenta y una identificación oficial con fotografía, con el mismo nombre de la cuenta.

## Datos personales
Los datos de quienes participan se tratan conforme al Aviso de privacidad publicado en este sitio. Al participar, aceptas que, si ganas, se publiquen tu nombre abreviado y tu número de boleto.

## Dudas
Para dudas o aclaraciones ${contact}. Lo no previsto en estas bases lo resolverá la tienda.`;
}

/** Lo que falta para publicar (lo mismo que valida el servidor). */
export function publishIssues(f: Pick<RaffleFields, 'how_to_get' | 'rules_text'>): string[] {
  const out: string[] = [];
  if (!f.how_to_get?.trim()) out.push('Cómo se consigue un boleto');
  if ((f.rules_text?.trim().length ?? 0) < 300) out.push('Bases del sorteo');
  else if (hasTodo(f.rules_text)) out.push('Completar los datos marcados como [COMPLETAR …] en las bases');
  return out;
}
