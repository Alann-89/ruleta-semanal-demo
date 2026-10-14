export interface DemoUser { id: string; email: string; name: string; role: 'admin' | 'staff' | 'customer'; blurb: string }

/** Usuarios ficticios de la demostración (ids fijos para conservar el historial entre recargas). */
export const DEMO_USERS: DemoUser[] = [
  { id: '00000000-0000-4000-8000-000000000001', email: 'admin@demo.test', name: 'Ana (administradora)', role: 'admin', blurb: 'Premios, campaña, apariencia, estadísticas, usuarios y auditoría.' },
  { id: '00000000-0000-4000-8000-000000000002', email: 'staff@demo.test', name: 'Sergio (mostrador)', role: 'staff', blurb: 'Solo canjes: escanear o buscar un código y confirmar la entrega.' },
  { id: '00000000-0000-4000-8000-000000000003', email: 'cliente1@demo.test', name: 'Carla (clienta)', role: 'customer', blurb: 'Gira la ruleta, ve sus premios, códigos y QR.' },
  { id: '00000000-0000-4000-8000-000000000004', email: 'cliente2@demo.test', name: 'Mario (cliente)', role: 'customer', blurb: 'Otra cuenta de cliente para probar la semana y los giros extra.' },
];
