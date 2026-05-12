const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

app.use(cors());
app.use(express.json());

// ─── HEALTH CHECK ───────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── GEOCODIFICAR CIUDAD ─────────────────────────────────────────────────────
async function geocodificarCiudad(ciudad) {
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json`;
    const response = await axios.get(url, {
      params: {
        address: `${ciudad}, España`,
        key: GOOGLE_API_KEY,
        language: 'es',
        region: 'es',
      },
    });
    if (response.data.results && response.data.results.length > 0) {
      const result = response.data.results[0];
      return {
        lat: result.geometry.location.lat,
        lng: result.geometry.location.lng,
        nombreNormalizado: result.address_components[0]?.long_name || ciudad,
      };
    }
    return null;
  } catch (err) {
    console.error('Error geocodificando:', err.message);
    return null;
  }
}

// ─── FILTRAR POR CIUDAD ──────────────────────────────────────────────────────
function perteneceACiudad(bar, ciudad) {
  const ciudadLower = ciudad.toLowerCase().trim();
  const palabrasCiudad = ciudadLower.split(/[\s,-]+/).filter(p => p.length > 2);

  const camposARevisar = [
    bar.vicinity || '',
    bar.formatted_address || '',
  ].join(' ').toLowerCase();

  return palabrasCiudad.some(palabra => camposARevisar.includes(palabra));
}

// ─── BUSCAR BARES ────────────────────────────────────────────────────────────
app.get('/api/bares', async (req, res) => {
  const { ciudad, categoria } = req.query;

  if (!ciudad) {
    return res.status(400).json({ error: 'Falta el parámetro ciudad' });
  }

  if (!GOOGLE_API_KEY) {
    return res.status(500).json({ error: 'API Key de Google no configurada' });
  }

  try {
    const geo = await geocodificarCiudad(ciudad);
    if (!geo) {
      return res.status(404).json({ error: `No se encontró la ciudad: ${ciudad}` });
    }

    const categorias = {
      tortilla: 'tortilla tapas bar',
      carne: 'carne pintxos bar',
      verdura: 'verdura vegetariano bar tapas',
      pescado: 'pescado mariscos bar tapas',
      especialidad: 'especialidad local bar pintxos',
      hamburguesa: 'hamburguesa burger',
      bocadillo: 'bocadillo sandwich bar',
    };

    const queryBase = categorias[categoria]
      ? `${categorias[categoria]} en ${ciudad} España`
      : `bares restaurantes tapas pintxos en ${ciudad} España`;

    let todosLosBares = [];
    let nextPageToken = null;
    let paginas = 0;
    const MAX_PAGINAS = 3;

    do {
      const params = {
        query: queryBase,
        key: GOOGLE_API_KEY,
        language: 'es',
        region: 'es',
        location: `${geo.lat},${geo.lng}`,
        radius: 5000,
        type: 'bar|restaurant',
      };

      if (nextPageToken) {
        params.pagetoken = nextPageToken;
        await new Promise(r => setTimeout(r, 2000)); // Google requiere espera entre páginas
      }

      const response = await axios.get(
        'https://maps.googleapis.com/maps/api/place/textsearch/json',
        { params }
      );

      const data = response.data;

      if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        console.error('Google Maps error:', data.status, data.error_message);
        break;
      }

      const baresFiltrados = (data.results || []).filter(bar =>
        perteneceACiudad(bar, ciudad)
      );

      todosLosBares = [...todosLosBares, ...baresFiltrados];
      nextPageToken = data.next_page_token || null;
      paginas++;
    } while (nextPageToken && paginas < MAX_PAGINAS);

    // Normalizar datos
    const baresNormalizados = todosLosBares.map(bar => ({
      id: bar.place_id,
      nombre: bar.name,
      direccion: bar.vicinity || bar.formatted_address || '',
      valoracion: bar.rating || 0,
      numOpiniones: bar.user_ratings_total || 0,
      foto: bar.photos?.[0]?.photo_reference
        ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${bar.photos[0].photo_reference}&key=${GOOGLE_API_KEY}`
        : null,
      lat: bar.geometry?.location?.lat || 0,
      lng: bar.geometry?.location?.lng || 0,
      abierto: bar.opening_hours?.open_now ?? null,
      tipos: bar.types || [],
    }));

    res.json({
      ciudad: geo.nombreNormalizado,
      total: baresNormalizados.length,
      bares: baresNormalizados,
    });
  } catch (err) {
    console.error('Error en /api/bares:', err.message);
    res.status(500).json({ error: 'Error al buscar bares', detalle: err.message });
  }
});

// ─── DETALLE DE BAR ──────────────────────────────────────────────────────────
app.get('/api/bares/:id', async (req, res) => {
  const { id } = req.params;

  if (!GOOGLE_API_KEY) {
    return res.status(500).json({ error: 'API Key de Google no configurada' });
  }

  try {
    const response = await axios.get(
      'https://maps.googleapis.com/maps/api/place/details/json',
      {
        params: {
          place_id: id,
          key: GOOGLE_API_KEY,
          language: 'es',
          fields:
            'name,rating,user_ratings_total,formatted_address,formatted_phone_number,website,opening_hours,reviews,photos,geometry,price_level,types',
        },
      }
    );

    const data = response.data;

    if (data.status !== 'OK') {
      return res.status(404).json({ error: 'Bar no encontrado', status: data.status });
    }

    const place = data.result;

    // Extraer especialidades de las reseñas
    const palabrasComida = [
      'tortilla', 'patata', 'jamón', 'queso', 'pulpo', 'gambas', 'croqueta',
      'pintxo', 'tapa', 'bocadillo', 'hamburguesa', 'ensalada', 'mejillones',
      'anchoas', 'bacalao', 'txistorra', 'chorizo', 'morcilla', 'calamares',
      'sepia', 'navaja', 'berberechos', 'almejas', 'rabas', 'pimientos',
      'champiñones', 'boquerones', 'sardinas', 'atún', 'salmón', 'bonito',
      'foie', 'trufa', 'gamba', 'langosta', 'txangurro', 'kokotxa',
      'marmitako', 'pil-pil', 'vizcaína', 'verde', 'rioja',
    ];

    const reseñasTexto = (place.reviews || [])
      .map(r => r.text?.toLowerCase() || '')
      .join(' ');

    const especialidades = palabrasComida
      .filter(p => reseñasTexto.includes(p))
      .slice(0, 6)
      .map(p => p.charAt(0).toUpperCase() + p.slice(1));

    const fotos = (place.photos || []).slice(0, 5).map(
      p =>
        `https://maps.googleapis.com/maps/api/place/photo?maxwidth=600&photoreference=${p.photo_reference}&key=${GOOGLE_API_KEY}`
    );

    res.json({
      id,
      nombre: place.name,
      valoracion: place.rating || 0,
      numOpiniones: place.user_ratings_total || 0,
      direccion: place.formatted_address || '',
      telefono: place.formatted_phone_number || null,
      web: place.website || null,
      horario: place.opening_hours?.weekday_text || [],
      abierto: place.opening_hours?.open_now ?? null,
      fotos,
      reseñas: (place.reviews || []).map(r => ({
        autor: r.author_name,
        valoracion: r.rating,
        texto: r.text,
        tiempo: r.relative_time_description,
        foto: r.profile_photo_url,
      })),
      especialidades: especialidades.length > 0 ? especialidades : null,
      lat: place.geometry?.location?.lat || 0,
      lng: place.geometry?.location?.lng || 0,
      nivelPrecio: place.price_level ?? null,
    });
  } catch (err) {
    console.error('Error en /api/bares/:id:', err.message);
    res.status(500).json({ error: 'Error al obtener detalle', detalle: err.message });
  }
});

// ─── INICIO ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🌶️  Pintxos Backend corriendo en puerto ${PORT}`);
  console.log(`   API Key configurada: ${GOOGLE_API_KEY ? '✅' : '❌ FALTA GOOGLE_MAPS_API_KEY'}`);
});
