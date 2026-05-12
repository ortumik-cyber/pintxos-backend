require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const axios = require('axios');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10kb' }));
app.use(rateLimit({ windowMs: 60000, max: 30 }));

const KEY = process.env.GOOGLE_MAPS_API_KEY;

// Normaliza texto para comparar sin tildes ni mayúsculas
function normalizar(str) {
  return (str || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

async function fetchPagina(query, pagetoken = null) {
  const params = { query, language: 'es', region: 'es', key: KEY };
  if (pagetoken) params.pagetoken = pagetoken;
  const res = await axios.get(
    'https://maps.googleapis.com/maps/api/place/textsearch/json',
    { params }
  );
  return res.data;
}

app.get('/api/bares', async (req, res) => {
  try {
    const { ciudad } = req.query;
    if (!ciudad) return res.status(400).json({ error: 'Ciudad requerida' });

    // Query específica: ciudad al principio para que Google la priorice
    const query = `bares restaurantes en ${ciudad} España`;
    const ciudadNorm = normalizar(ciudad);

    let todos = [];

    const pag1 = await fetchPagina(query);
    todos = [...pag1.results];

    if (pag1.next_page_token) {
      await new Promise(r => setTimeout(r, 2000));
      const pag2 = await fetchPagina(query, pag1.next_page_token);
      todos = [...todos, ...pag2.results];

      if (pag2.next_page_token) {
        await new Promise(r => setTimeout(r, 2000));
        const pag3 = await fetchPagina(query, pag2.next_page_token);
        todos = [...todos, ...pag3.results];
      }
    }

    // Filtrar: solo resultados cuya dirección mencione el pueblo buscado
    const baresDelPueblo = todos.filter(p => {
      const dir = normalizar(p.formatted_address || '');
      return dir.includes(ciudadNorm);
    });

    // Si el filtro es muy estricto y no hay nada, devolver todos (ciudades sin match exacto)
    const base = baresDelPueblo.length > 0 ? baresDelPueblo : todos;

    const bares = base
      .filter(p => p.rating && p.user_ratings_total > 0)
      .map(p => ({
        id: p.place_id,
        nombre: p.name,
        direccion: p.formatted_address || '',
        nota: p.rating || 0,
        numOpiniones: p.user_ratings_total || 0,
        lat: p.geometry.location.lat,
        lng: p.geometry.location.lng,
        abierto: p.opening_hours?.open_now,
        precio: p.price_level || 1,
        tipos: p.types || [],
      }));

    res.json({ bares, ciudad, total: bares.length });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al buscar bares' });
  }
});

app.get('/api/bares/:id', async (req, res) => {
  try {
    const response = await axios.get(
      'https://maps.googleapis.com/maps/api/place/details/json',
      {
        params: {
          place_id: req.params.id,
          fields: 'name,rating,formatted_address,formatted_phone_number,website,opening_hours,reviews,price_level,user_ratings_total',
          language: 'es',
          key: KEY,
        }
      }
    );
    const p = response.data.result;
    res.json({
      id: req.params.id,
      nombre: p.name,
      direccion: p.formatted_address,
      telefono: p.formatted_phone_number || null,
      web: p.website || null,
      nota: p.rating || 0,
      numOpiniones: p.user_ratings_total || 0,
      abierto: p.opening_hours?.open_now,
      horario: p.opening_hours?.weekday_text || [],
      opiniones: p.reviews?.slice(0, 5).map(r => ({
        autor: r.author_name,
        nota: r.rating,
        texto: r.text,
        fecha: r.relative_time_description,
      })) || [],
      precio: p.price_level || 1,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al obtener detalle' });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok', app: 'PINTXOS API' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`PINTXOS API corriendo en puerto ${PORT}`));
