// ─── CONFIGURACIÓN DE LA APP ─────────────────────────────────────────────────
//
// DESARROLLO LOCAL:  descomenta la línea con la IP de tu Mac
// PRODUCCIÓN:        pon aquí la URL de Railway cuando la tengas
//
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG = {
  // ▶ Backend en Render (producción):
  API_URL: 'https://pintxos-backend-1.onrender.com',

  // ▶ Para desarrollo local (misma WiFi), comenta la línea de arriba y descomenta esta:
  // API_URL: 'http://192.168.1.91:3001',

  // Admin
  ADMIN_PASSWORD: 'pintxos2024',

  // Moderación de reseñas
  PALABRAS_PROHIBIDAS: ['idiota', 'mierda', 'imbecil', 'estupido', 'gilipollas', 'coño', 'puta'],
};

export default CONFIG;
