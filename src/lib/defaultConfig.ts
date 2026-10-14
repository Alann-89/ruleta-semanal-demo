import type { SiteConfig } from './types';

/** Logo incluido en el sitio; se usa mientras no subas otro desde el panel (Apariencia → Logo). */
export const DEFAULT_LOGO = '/brand/luky-home-logo-256.png';

/** Se usa solo mientras carga la configuración publicada (o si el servidor no responde). */
export const DEFAULT_CONFIG: SiteConfig = {
  store: { name: 'Luky Home', tagline: 'Gira cada semana y gana premios', logo_url: null },
  theme: {
    primary: '#ec5b1f', secondary: '#a8340e', accent: '#ffc857', background: '#fff8f1',
    background_image_url: null, glow: 70, motion: 70,
  },
  copy: {
    welcome_title: '¡Tu ruleta de la suerte te espera!',
    welcome_text: 'Inicia sesión con Google y gira una vez por semana. Los premios se canjean en la tienda.',
    button_text: '¡Girar y ganar!',
    celebration_message: '¡Felicidades! Ganaste un premio.',
    no_prize_message: 'Esta vez no hubo premio. ¡Vuelve a intentarlo la próxima semana!',
    extra_spin_message: '¡Ganaste un giro extra! Puedes volver a girar.',
  },
  sound: { enabled_by_default: true, volume: 60 },
  contact: { address: '', maps_url: null, phone: '', whatsapp: '', email: '', hours: [] },
  rules_text: '',
  privacy_text: '',
  redeem_text: '',
};
