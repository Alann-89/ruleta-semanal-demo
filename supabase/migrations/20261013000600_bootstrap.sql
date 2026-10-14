-- =====================================================================
-- Ruleta semanal — configuración inicial (SIN datos de demostración).
-- Crea la campaña en borrador y la apariencia por omisión. La tienda la
-- personaliza desde el panel. Los datos de demostración viven aparte en
-- supabase/seed/demo.sql y NUNCA se ejecutan en producción.
-- =====================================================================

insert into public.campaigns (name, status)
values ('Ruleta semanal', 'draft');

insert into public.site_config (id, draft, published, published_at)
select true, cfg, cfg, now()
from (select $json$
{
  "store": { "name": "Mi Tienda", "tagline": "Gira cada semana y gana premios", "logo_url": null },
  "theme": {
    "primary": "#ec5b1f", "secondary": "#a8340e", "accent": "#ffc857",
    "background": "#fff8f1", "background_image_url": null,
    "glow": 70, "motion": 70
  },
  "copy": {
    "welcome_title": "¡Tu ruleta de la suerte te espera!",
    "welcome_text": "Inicia sesión con Google y gira una vez por semana. Los premios se canjean en la tienda.",
    "button_text": "¡Girar y ganar!",
    "celebration_message": "¡Felicidades! Ganaste un premio.",
    "no_prize_message": "Esta vez no hubo premio. ¡Vuelve a intentarlo la próxima semana!",
    "extra_spin_message": "¡Ganaste un giro extra! Puedes volver a girar."
  },
  "sound": { "enabled_by_default": true, "volume": 60 },
  "contact": {
    "address": "Calle Principal 123, Centro, Ciudad de México",
    "maps_url": null,
    "phone": "",
    "whatsapp": "",
    "email": "",
    "hours": [
      { "days": "Lunes a viernes", "hours": "9:00 a 20:00" },
      { "days": "Sábado", "hours": "10:00 a 18:00" },
      { "days": "Domingo", "hours": "Cerrado" }
    ]
  },
  "rules_text": "## Cómo participar\n- Inicia sesión con tu cuenta de Google.\n- Cada cuenta tiene un giro base por semana. La semana empieza el lunes a las 00:00 y termina el domingo a las 23:59 (hora de Ciudad de México).\n- Si giras el domingo, podrás volver a girar el lunes: no hay una espera de siete días.\n- El límite de participación es por cuenta. Google no garantiza una única cuenta por persona, por lo que la tienda puede revisar y bloquear participaciones abusivas.\n\n## Premios\n- El resultado lo determina el servidor al azar, con las probabilidades definidas por la tienda. No puede modificarse desde tu dispositivo.\n- Los premios tienen existencias limitadas, vigencia y condiciones de canje que se indican en cada cupón.\n- Cada cupón se canjea una sola vez en la tienda, presentando su código o QR.\n- Los giros extra (premio \"Vuelve a girar\", asignación de la tienda o códigos promocionales) son excepciones con vencimiento y un límite por cuenta y semana.\n\n## Otros\n- La tienda puede pausar o cerrar la promoción en cualquier momento. Tu historial se conserva.\n- Una vez canjeado, vencido o anulado, un cupón no puede reutilizarse.",
  "privacy_text": "## Qué datos usamos\nAl iniciar sesión con Google recibimos tu correo, tu nombre y tu foto de perfil. No te pedimos teléfono ni otros datos. Guardamos tus participaciones, premios y canjes.\n\n## Para qué los usamos\nPara identificar tu cuenta, controlar que participes una vez por semana, entregarte tus premios y atender canjes en la tienda. No vendemos tus datos.\n\n## Con quién los compartimos\nLa información se almacena con nuestros proveedores de infraestructura (Supabase y Cloudflare). El personal de la tienda ve tu nombre y un correo parcialmente oculto al canjear un premio.\n\n## Tus derechos\nPuedes solicitar acceso, corrección o eliminación de tus datos escribiendo a la tienda. Al eliminar tu cuenta conservamos el historial de la promoción sin tus datos personales.",
  "redeem_text": "1. Ve a la tienda dentro de la vigencia del cupón.\n2. Abre «Mis premios» y muestra el código o el QR al personal.\n3. El personal verificará el premio y lo canjeará. Cada cupón se usa una sola vez."
}
$json$::jsonb as cfg) d;
