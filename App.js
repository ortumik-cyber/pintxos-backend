import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet,
  SafeAreaView, StatusBar, Image, ScrollView, ActivityIndicator,
  Alert, Linking, Share, Platform, KeyboardAvoidingView,
  Animated, Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import CONFIG from './config';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const API_URL = CONFIG.API_URL;
const ADMIN_PASSWORD = CONFIG.ADMIN_PASSWORD;
const PALABRAS_PROHIBIDAS = CONFIG.PALABRAS_PROHIBIDAS;

// ─── COLORES ──────────────────────────────────────────────────────────────────
const C = {
  rojo: '#E61E4D',
  rojoOscuro: '#BD1B3E',
  negro: '#1A1A1A',
  gris: '#2D2D2D',
  grisClaro: '#444',
  grisMedio: '#888',
  blanco: '#FFFFFF',
  blancoSuave: '#F7F7F7',
  amarillo: '#FFB400',
  verde: '#00B578',
};

// ─── CATEGORÍAS ───────────────────────────────────────────────────────────────
const CATEGORIAS = [
  { id: 'todos', label: 'Todos', emoji: '🍽️' },
  { id: 'tortilla', label: 'Tortilla', emoji: '🥚' },
  { id: 'carne', label: 'Carne', emoji: '🥩' },
  { id: 'pescado', label: 'Pescado', emoji: '🐟' },
  { id: 'verdura', label: 'Verdura', emoji: '🥗' },
  { id: 'especialidad', label: 'Especial', emoji: '⭐' },
  { id: 'hamburguesa', label: 'Burger', emoji: '🍔' },
  { id: 'bocadillo', label: 'Bocadillo', emoji: '🥖' },
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const calcularDistancia = (lat1, lng1, lat2, lng2) => {
  if (!lat1 || !lat2) return 9999;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const estrellasTexto = (val) => {
  const llenas = Math.floor(val);
  const media = val - llenas >= 0.5 ? 1 : 0;
  return '★'.repeat(llenas) + (media ? '½' : '') + '☆'.repeat(5 - llenas - media);
};

const contienePalabraProhibida = (texto) =>
  PALABRAS_PROHIBIDAS.some(p => texto.toLowerCase().includes(p));

// ─── COMPONENTE: ESTRELLAS ────────────────────────────────────────────────────
const Estrellas = ({ valor, size = 14 }) => (
  <Text style={{ fontSize: size, color: C.amarillo, letterSpacing: 1 }}>
    {estrellasTexto(valor)}
  </Text>
);

// ─── COMPONENTE: BADGE ABIERTO ────────────────────────────────────────────────
const BadgeAbierto = ({ abierto }) => {
  if (abierto === null) return null;
  return (
    <View style={[styles.badge, { backgroundColor: abierto ? C.verde : '#FF4444' }]}>
      <Text style={styles.badgeText}>{abierto ? 'Abierto' : 'Cerrado'}</Text>
    </View>
  );
};

// ─── COMPONENTE: TARJETA DE BAR ───────────────────────────────────────────────
const TarjetaBar = ({ bar, onPress, enRuta, onToggleRuta, miPosicion }) => {
  const distancia = miPosicion
    ? calcularDistancia(miPosicion.lat, miPosicion.lng, bar.lat, bar.lng)
    : null;

  return (
    <TouchableOpacity style={styles.tarjeta} onPress={onPress} activeOpacity={0.85}>
      {bar.foto ? (
        <Image source={{ uri: bar.foto }} style={styles.tarjetaFoto} />
      ) : (
        <View style={[styles.tarjetaFoto, styles.tarjetaSinFoto]}>
          <Text style={{ fontSize: 36 }}>🌶️</Text>
        </View>
      )}
      <BadgeAbierto abierto={bar.abierto} />
      <View style={styles.tarjetaInfo}>
        <Text style={styles.tarjetaNombre} numberOfLines={1}>{bar.nombre}</Text>
        <Text style={styles.tarjetaDireccion} numberOfLines={1}>{bar.direccion}</Text>
        <View style={styles.tarjetaRow}>
          <Estrellas valor={bar.valoracion} />
          <Text style={styles.tarjetaVal}> {bar.valoracion.toFixed(1)}</Text>
          <Text style={styles.tarjetaOps}> ({bar.numOpiniones})</Text>
          {distancia && distancia < 9999 && (
            <Text style={styles.tarjetaDist}> · {distancia.toFixed(1)} km</Text>
          )}
        </View>
      </View>
      <TouchableOpacity
        style={[styles.btnRuta, enRuta && styles.btnRutaActivo]}
        onPress={() => onToggleRuta(bar)}
      >
        <Text style={styles.btnRutaIcon}>{enRuta ? '✓' : '+'}</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
};

// ─── PANTALLA: DETALLE DE BAR ─────────────────────────────────────────────────
const PantallaDetalle = ({ bar, onVolver, reseñasUsuario, onNuevaReseña }) => {
  const [detalle, setDetalle] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [textoReseña, setTextoReseña] = useState('');
  const [estrellaReseña, setEstrellaReseña] = useState(5);
  const [enviandoReseña, setEnviandoReseña] = useState(false);
  const [tab, setTab] = useState('info'); // 'info' | 'horario' | 'reseñas'

  useEffect(() => {
    cargarDetalle();
  }, []);

  const cargarDetalle = async () => {
    try {
      setCargando(true);
      const res = await fetch(`${API_URL}/api/bares/${bar.id}`);
      const data = await res.json();
      setDetalle(data);
    } catch (err) {
      Alert.alert('Error', 'No se pudo cargar el detalle del bar');
    } finally {
      setCargando(false);
    }
  };

  const enviarReseña = async () => {
    if (!textoReseña.trim()) {
      Alert.alert('Escribe algo', 'La reseña no puede estar vacía');
      return;
    }
    if (textoReseña.length > 500) {
      Alert.alert('Demasiado larga', 'Máximo 500 caracteres');
      return;
    }
    if (contienePalabraProhibida(textoReseña)) {
      Alert.alert('Reseña rechazada', 'Tu reseña contiene palabras no permitidas');
      return;
    }
    setEnviandoReseña(true);
    const nueva = {
      id: Date.now().toString(),
      barId: bar.id,
      barNombre: bar.nombre,
      texto: textoReseña.trim(),
      valoracion: estrellaReseña,
      fecha: new Date().toLocaleDateString('es-ES'),
      estado: 'pendiente',
    };
    await onNuevaReseña(nueva);
    setTextoReseña('');
    setEstrellaReseña(5);
    setEnviandoReseña(false);
    Alert.alert('✅ Enviada', 'Tu reseña está pendiente de moderación. ¡Gracias!');
  };

  const abrirMapa = () => {
    const url = Platform.OS === 'ios'
      ? `maps://?daddr=${detalle.lat},${detalle.lng}`
      : `geo:${detalle.lat},${detalle.lng}?q=${encodeURIComponent(detalle.nombre)}`;
    Linking.openURL(url);
  };

  const reseñasAprobadas = (reseñasUsuario || []).filter(
    r => r.barId === bar.id && r.estado === 'aprobada'
  );

  if (cargando) {
    return (
      <SafeAreaView style={styles.contenedor}>
        <TouchableOpacity style={styles.btnVolver} onPress={onVolver}>
          <Text style={styles.btnVolverTexto}>← Volver</Text>
        </TouchableOpacity>
        <ActivityIndicator size="large" color={C.rojo} style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.contenedor}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Foto */}
        {detalle?.fotos?.[0] ? (
          <Image source={{ uri: detalle.fotos[0] }} style={styles.detalleHero} />
        ) : (
          <View style={[styles.detalleHero, { backgroundColor: C.gris, justifyContent: 'center', alignItems: 'center' }]}>
            <Text style={{ fontSize: 64 }}>🌶️</Text>
          </View>
        )}

        {/* Botón volver */}
        <TouchableOpacity style={styles.btnVolverFlotante} onPress={onVolver}>
          <Text style={{ color: C.blanco, fontSize: 18 }}>←</Text>
        </TouchableOpacity>

        <View style={styles.detalleBody}>
          {/* Nombre y rating */}
          <Text style={styles.detalleNombre}>{detalle?.nombre || bar.nombre}</Text>
          <View style={styles.detalleRatingRow}>
            <Estrellas valor={detalle?.valoracion || 0} size={18} />
            <Text style={styles.detalleRatingVal}> {(detalle?.valoracion || 0).toFixed(1)}</Text>
            <Text style={styles.detalleOps}> ({detalle?.numOpiniones || 0} opiniones)</Text>
            <BadgeAbierto abierto={detalle?.abierto} />
          </View>

          {/* Especialidades */}
          {detalle?.especialidades && (
            <View style={styles.seccion}>
              <Text style={styles.seccionTitulo}>🍽️ Especialidades detectadas</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {detalle.especialidades.map((e, i) => (
                    <View key={i} style={styles.chip}>
                      <Text style={styles.chipTexto}>{e}</Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
          )}

          {/* Tabs */}
          <View style={styles.tabs}>
            {['info', 'horario', 'reseñas'].map(t => (
              <TouchableOpacity
                key={t}
                style={[styles.tab, tab === t && styles.tabActivo]}
                onPress={() => setTab(t)}
              >
                <Text style={[styles.tabTexto, tab === t && styles.tabTextoActivo]}>
                  {t === 'info' ? 'Info' : t === 'horario' ? 'Horario' : 'Reseñas'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Tab: Info */}
          {tab === 'info' && (
            <View>
              <View style={styles.infoFila}>
                <Text style={styles.infoIcono}>📍</Text>
                <Text style={styles.infoTexto}>{detalle?.direccion}</Text>
              </View>
              {detalle?.telefono && (
                <TouchableOpacity
                  style={styles.infoFila}
                  onPress={() => Linking.openURL(`tel:${detalle.telefono}`)}
                >
                  <Text style={styles.infoIcono}>📞</Text>
                  <Text style={[styles.infoTexto, { color: C.rojo }]}>{detalle.telefono}</Text>
                </TouchableOpacity>
              )}
              {detalle?.web && (
                <TouchableOpacity
                  style={styles.infoFila}
                  onPress={() => Linking.openURL(detalle.web)}
                >
                  <Text style={styles.infoIcono}>🌐</Text>
                  <Text style={[styles.infoTexto, { color: C.rojo }]} numberOfLines={1}>
                    {detalle.web}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.btnPrimario} onPress={abrirMapa}>
                <Text style={styles.btnPrimarioTexto}>🗺️ Abrir en Maps</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Tab: Horario */}
          {tab === 'horario' && (
            <View>
              {detalle?.horario?.length > 0 ? (
                detalle.horario.map((linea, i) => (
                  <Text key={i} style={styles.horarioLinea}>{linea}</Text>
                ))
              ) : (
                <Text style={styles.sinDatos}>Horario no disponible</Text>
              )}
            </View>
          )}

          {/* Tab: Reseñas */}
          {tab === 'reseñas' && (
            <View>
              {/* Reseñas aprobadas de usuarios */}
              {reseñasAprobadas.length > 0 && (
                <View style={{ marginBottom: 16 }}>
                  <Text style={styles.seccionTitulo}>📝 Reseñas de usuarios</Text>
                  {reseñasAprobadas.map(r => (
                    <View key={r.id} style={styles.reseñaCard}>
                      <View style={styles.reseñaHeader}>
                        <Text style={styles.reseñaAutor}>Usuario</Text>
                        <Estrellas valor={r.valoracion} size={12} />
                      </View>
                      <Text style={styles.reseñaTexto}>{r.texto}</Text>
                      <Text style={styles.reseñaFecha}>{r.fecha}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Reseñas de Google */}
              {detalle?.reseñas?.length > 0 && (
                <View style={{ marginBottom: 16 }}>
                  <Text style={styles.seccionTitulo}>🔍 Reseñas de Google</Text>
                  {detalle.reseñas.map((r, i) => (
                    <View key={i} style={styles.reseñaCard}>
                      <View style={styles.reseñaHeader}>
                        <Text style={styles.reseñaAutor}>{r.autor}</Text>
                        <Estrellas valor={r.valoracion} size={12} />
                        <Text style={styles.reseñaTiempo}>{r.tiempo}</Text>
                      </View>
                      <Text style={styles.reseñaTexto} numberOfLines={4}>{r.texto}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Escribir reseña */}
              <View style={styles.nuevaReseña}>
                <Text style={styles.seccionTitulo}>✍️ Escribe tu reseña</Text>
                <View style={styles.estrellasSelector}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <TouchableOpacity key={n} onPress={() => setEstrellaReseña(n)}>
                      <Text style={{
                        fontSize: 28,
                        color: n <= estrellaReseña ? C.amarillo : C.grisClaro,
                      }}>★</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={styles.inputReseña}
                  placeholder="¿Qué te pareció este bar? (máx. 500 caracteres)"
                  placeholderTextColor={C.grisMedio}
                  multiline
                  maxLength={500}
                  value={textoReseña}
                  onChangeText={setTextoReseña}
                />
                <Text style={styles.contador}>{textoReseña.length}/500</Text>
                <TouchableOpacity
                  style={[styles.btnPrimario, enviandoReseña && { opacity: 0.6 }]}
                  onPress={enviarReseña}
                  disabled={enviandoReseña}
                >
                  <Text style={styles.btnPrimarioTexto}>
                    {enviandoReseña ? 'Enviando...' : 'Enviar reseña'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

// ─── PANTALLA: PANEL ADMIN ────────────────────────────────────────────────────
const PantallaAdmin = ({ reseñas, onAprobar, onRechazar, onVolver }) => {
  const pendientes = reseñas.filter(r => r.estado === 'pendiente');

  return (
    <SafeAreaView style={styles.contenedor}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onVolver}>
          <Text style={styles.btnVolverTexto}>← Volver</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitulo}>Panel Admin 🔐</Text>
        <View style={{ width: 60 }} />
      </View>
      {pendientes.length === 0 ? (
        <View style={styles.vacio}>
          <Text style={{ fontSize: 48 }}>✅</Text>
          <Text style={styles.vacioTexto}>No hay reseñas pendientes</Text>
        </View>
      ) : (
        <FlatList
          data={pendientes}
          keyExtractor={r => r.id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <View style={styles.adminCard}>
              <Text style={styles.adminBarNombre}>{item.barNombre}</Text>
              <Estrellas valor={item.valoracion} size={14} />
              <Text style={styles.adminReseñaTexto}>{item.texto}</Text>
              <Text style={styles.reseñaFecha}>{item.fecha}</Text>
              <View style={styles.adminBotones}>
                <TouchableOpacity
                  style={[styles.btnAdmin, { backgroundColor: C.verde }]}
                  onPress={() => onAprobar(item.id)}
                >
                  <Text style={styles.btnAdminTexto}>✓ Aprobar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btnAdmin, { backgroundColor: '#FF4444' }]}
                  onPress={() => onRechazar(item.id)}
                >
                  <Text style={styles.btnAdminTexto}>✗ Rechazar</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
};

// ─── APP PRINCIPAL ────────────────────────────────────────────────────────────
export default function App() {
  const [pantalla, setPantalla] = useState('inicio'); // inicio | lista | detalle | admin
  const [ciudad, setCiudad] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [bares, setBares] = useState([]);
  const [barSeleccionado, setBarSeleccionado] = useState(null);
  const [categoriaActiva, setCategoriaActiva] = useState('todos');
  const [orden, setOrden] = useState('valoracion'); // valoracion | distancia
  const [rutaSeleccionada, setRutaSeleccionada] = useState([]);
  const [miPosicion, setMiPosicion] = useState(null);
  const [reseñas, setReseñas] = useState([]);
  const [mostrandoAdmin, setMostrandoAdmin] = useState(false);
  const [inputAdmin, setInputAdmin] = useState('');
  const [error, setError] = useState(null);
  const [cidadBuscada, setCidadBuscada] = useState('');

  // Cargar reseñas guardadas
  useEffect(() => {
    (async () => {
      try {
        const guardadas = await AsyncStorage.getItem('pintxos_reseñas');
        if (guardadas) setReseñas(JSON.parse(guardadas));
      } catch {}
    })();
  }, []);

  // Guardar reseñas cuando cambian
  useEffect(() => {
    if (reseñas.length > 0) {
      AsyncStorage.setItem('pintxos_reseñas', JSON.stringify(reseñas));
    }
  }, [reseñas]);

  // Pedir permiso GPS
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({});
        setMiPosicion({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      }
    })();
  }, []);

  const buscarBares = async (cat = categoriaActiva) => {
    if (!ciudad.trim()) {
      Alert.alert('¿Dónde?', 'Escribe una ciudad o pueblo');
      return;
    }
    setBuscando(true);
    setError(null);
    try {
      const params = new URLSearchParams({ ciudad: ciudad.trim() });
      if (cat !== 'todos') params.append('categoria', cat);
      const res = await fetch(`${API_URL}/api/bares?${params}`);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      setBares(data.bares || []);
      setCidadBuscada(data.ciudad || ciudad);
      setPantalla('lista');
    } catch (err) {
      setError(`No se pudo conectar con el servidor.\nComprueba que el backend está en marcha.\n\n${API_URL}`);
    } finally {
      setBuscando(false);
    }
  };

  const cambiarCategoria = (cat) => {
    setCategoriaActiva(cat);
    if (pantalla === 'lista') buscarBares(cat);
  };

  const baresOrdenados = [...bares].sort((a, b) => {
    if (orden === 'distancia' && miPosicion) {
      const dA = calcularDistancia(miPosicion.lat, miPosicion.lng, a.lat, a.lng);
      const dB = calcularDistancia(miPosicion.lat, miPosicion.lng, b.lat, b.lng);
      return dA - dB;
    }
    return b.valoracion - a.valoracion;
  });

  const toggleRuta = (bar) => {
    setRutaSeleccionada(prev =>
      prev.some(b => b.id === bar.id)
        ? prev.filter(b => b.id !== bar.id)
        : [...prev, bar]
    );
  };

  const abrirRuta = () => {
    if (rutaSeleccionada.length === 0) {
      Alert.alert('Ruta vacía', 'Añade bares a la ruta pulsando el botón +');
      return;
    }
    const destinos = rutaSeleccionada
      .map(b => `${b.lat},${b.lng}`)
      .join('/');
    const url = Platform.OS === 'ios'
      ? `maps://?daddr=${rutaSeleccionada[rutaSeleccionada.length - 1].lat},${rutaSeleccionada[rutaSeleccionada.length - 1].lng}`
      : `https://www.google.com/maps/dir/${destinos}`;
    Linking.openURL(url);
  };

  const compartirBares = async () => {
    const texto = rutaSeleccionada.length > 0
      ? `🌶️ Mi ruta pintxos en ${cidadBuscada}:\n` +
        rutaSeleccionada.map((b, i) => `${i + 1}. ${b.nombre} (${b.valoracion}⭐)`).join('\n')
      : `🌶️ Mejores bares en ${cidadBuscada}:\n` +
        baresOrdenados.slice(0, 5).map((b, i) => `${i + 1}. ${b.nombre} (${b.valoracion}⭐)`).join('\n');
    await Share.share({ message: texto });
  };

  const nuevaReseña = async (reseña) => {
    const nuevas = [...reseñas, reseña];
    setReseñas(nuevas);
    await AsyncStorage.setItem('pintxos_reseñas', JSON.stringify(nuevas));
  };

  const aprobarReseña = async (id) => {
    const actualizadas = reseñas.map(r => r.id === id ? { ...r, estado: 'aprobada' } : r);
    setReseñas(actualizadas);
    await AsyncStorage.setItem('pintxos_reseñas', JSON.stringify(actualizadas));
  };

  const rechazarReseña = async (id) => {
    const filtradas = reseñas.filter(r => r.id !== id);
    setReseñas(filtradas);
    await AsyncStorage.setItem('pintxos_reseñas', JSON.stringify(filtradas));
  };

  const pedirPasswordAdmin = () => {
    Alert.prompt(
      '🔐 Acceso Admin',
      'Introduce la contraseña:',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Entrar',
          onPress: (pwd) => {
            if (pwd === ADMIN_PASSWORD) {
              setMostrandoAdmin(true);
            } else {
              Alert.alert('❌ Contraseña incorrecta');
            }
          },
        },
      ],
      'secure-text'
    );
  };

  // ── Pantalla Admin ──
  if (mostrandoAdmin) {
    return (
      <PantallaAdmin
        reseñas={reseñas}
        onAprobar={aprobarReseña}
        onRechazar={rechazarReseña}
        onVolver={() => setMostrandoAdmin(false)}
      />
    );
  }

  // ── Pantalla Detalle ──
  if (pantalla === 'detalle' && barSeleccionado) {
    return (
      <PantallaDetalle
        bar={barSeleccionado}
        onVolver={() => setPantalla('lista')}
        reseñasUsuario={reseñas}
        onNuevaReseña={nuevaReseña}
      />
    );
  }

  // ── Pantalla Lista ──
  if (pantalla === 'lista') {
    return (
      <SafeAreaView style={styles.contenedor}>
        <StatusBar barStyle="light-content" backgroundColor={C.negro} />

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setPantalla('inicio')}>
            <Text style={styles.btnVolverTexto}>← Inicio</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitulo}>{cidadBuscada}</Text>
          <TouchableOpacity onPress={compartirBares}>
            <Text style={{ color: C.rojo, fontSize: 22 }}>⬆</Text>
          </TouchableOpacity>
        </View>

        {/* Categorías */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoriasScroll}
          contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}
        >
          {CATEGORIAS.map(cat => (
            <TouchableOpacity
              key={cat.id}
              style={[styles.categoriaBtn, categoriaActiva === cat.id && styles.categoriaBtnActivo]}
              onPress={() => cambiarCategoria(cat.id)}
            >
              <Text style={styles.categoriaEmoji}>{cat.emoji}</Text>
              <Text style={[styles.categoriaLabel, categoriaActiva === cat.id && { color: C.blanco }]}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Orden */}
        <View style={styles.ordenRow}>
          <Text style={styles.ordenLabel}>{bares.length} bares · Ordenar por:</Text>
          <TouchableOpacity
            style={[styles.ordenBtn, orden === 'valoracion' && styles.ordenBtnActivo]}
            onPress={() => setOrden('valoracion')}
          >
            <Text style={[styles.ordenBtnTexto, orden === 'valoracion' && { color: C.blanco }]}>⭐ Nota</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.ordenBtn, orden === 'distancia' && styles.ordenBtnActivo]}
            onPress={() => setOrden('distancia')}
          >
            <Text style={[styles.ordenBtnTexto, orden === 'distancia' && { color: C.blanco }]}>📍 Distancia</Text>
          </TouchableOpacity>
        </View>

        {/* Lista */}
        {buscando ? (
          <View style={styles.vacio}>
            <ActivityIndicator size="large" color={C.rojo} />
            <Text style={styles.vacioTexto}>Buscando los mejores bares...</Text>
          </View>
        ) : (
          <FlatList
            data={baresOrdenados}
            keyExtractor={b => b.id}
            renderItem={({ item }) => (
              <TarjetaBar
                bar={item}
                onPress={() => { setBarSeleccionado(item); setPantalla('detalle'); }}
                enRuta={rutaSeleccionada.some(b => b.id === item.id)}
                onToggleRuta={toggleRuta}
                miPosicion={miPosicion}
              />
            )}
            contentContainerStyle={{ padding: 12, paddingBottom: 100 }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.vacio}>
                <Text style={{ fontSize: 48 }}>🔍</Text>
                <Text style={styles.vacioTexto}>No se encontraron bares</Text>
              </View>
            }
          />
        )}

        {/* Barra ruta */}
        {rutaSeleccionada.length > 0 && (
          <View style={styles.barraRuta}>
            <Text style={styles.barraRutaTexto}>
              🗺️ {rutaSeleccionada.length} bar{rutaSeleccionada.length > 1 ? 'es' : ''}
            </Text>
            <TouchableOpacity style={styles.btnRutaAbrir} onPress={abrirRuta}>
              <Text style={styles.btnRutaAbrirTexto}>Abrir ruta →</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setRutaSeleccionada([])}>
              <Text style={{ color: C.grisMedio, fontSize: 18 }}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    );
  }

  // ── Pantalla Inicio ──
  return (
    <SafeAreaView style={styles.contenedor}>
      <StatusBar barStyle="light-content" backgroundColor={C.negro} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
          {/* Hero */}
          <View style={styles.hero}>
            <Image
              source={require('./assets/hero.jpg')}
              style={styles.heroImg}
              defaultSource={require('./assets/hero.jpg')}
            />
            <View style={styles.heroOverlay} />
            <View style={styles.heroContent}>
              <Text style={styles.heroEmoji}>🌶️</Text>
              <Text style={styles.heroTitulo}>PINTXOS</Text>
              <Text style={styles.heroSubtitulo}>
                Los mejores bares de España{'\n'}en la palma de tu mano
              </Text>
            </View>
          </View>

          {/* Buscador */}
          <View style={styles.buscadorContainer}>
            <View style={styles.buscadorRow}>
              <TextInput
                style={styles.inputCiudad}
                placeholder="¿En qué ciudad o pueblo?"
                placeholderTextColor={C.grisMedio}
                value={ciudad}
                onChangeText={setCiudad}
                onSubmitEditing={() => buscarBares()}
                returnKeyType="search"
                autoCapitalize="words"
              />
              <TouchableOpacity
                style={[styles.btnBuscar, buscando && { opacity: 0.7 }]}
                onPress={() => buscarBares()}
                disabled={buscando}
              >
                {buscando
                  ? <ActivityIndicator color={C.blanco} size="small" />
                  : <Text style={styles.btnBuscarTexto}>Buscar</Text>
                }
              </TouchableOpacity>
            </View>

            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorTexto}>{error}</Text>
              </View>
            )}

            {/* Ciudades rápidas */}
            <Text style={styles.ciudadesLabel}>Búsquedas frecuentes</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {['Bilbao', 'San Sebastián', 'Madrid', 'Barcelona', 'Durango', 'Vitoria', 'Pamplona', 'Logroño'].map(c => (
                  <TouchableOpacity
                    key={c}
                    style={styles.ciudadChip}
                    onPress={() => { setCiudad(c); }}
                  >
                    <Text style={styles.ciudadChipTexto}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Botón admin */}
            <TouchableOpacity style={styles.btnAdminAcceso} onPress={pedirPasswordAdmin}>
              <Text style={styles.btnAdminAccesoTexto}>🔐 Panel moderación</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── ESTILOS ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: C.negro },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: C.negro,
    borderBottomWidth: 1, borderBottomColor: C.gris,
  },
  headerTitulo: { color: C.blanco, fontSize: 16, fontWeight: '700', flex: 1, textAlign: 'center' },
  btnVolverTexto: { color: C.rojo, fontSize: 15, fontWeight: '600' },

  // Hero
  hero: { height: 280, position: 'relative' },
  heroImg: { width: '100%', height: '100%', resizeMode: 'cover' },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  heroContent: {
    position: 'absolute', bottom: 24, left: 0, right: 0,
    alignItems: 'center',
  },
  heroEmoji: { fontSize: 48 },
  heroTitulo: {
    color: C.blanco, fontSize: 42, fontWeight: '900',
    letterSpacing: 4, marginTop: 4,
  },
  heroSubtitulo: {
    color: 'rgba(255,255,255,0.85)', fontSize: 14, textAlign: 'center',
    marginTop: 4, lineHeight: 20,
  },

  // Buscador
  buscadorContainer: { padding: 20, backgroundColor: C.negro },
  buscadorRow: { flexDirection: 'row', gap: 10 },
  inputCiudad: {
    flex: 1, backgroundColor: C.gris, color: C.blanco,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, borderWidth: 1, borderColor: C.grisClaro,
  },
  btnBuscar: {
    backgroundColor: C.rojo, borderRadius: 12,
    paddingHorizontal: 20, justifyContent: 'center', alignItems: 'center',
    minWidth: 80,
  },
  btnBuscarTexto: { color: C.blanco, fontWeight: '700', fontSize: 15 },

  // Error
  errorBox: {
    backgroundColor: '#3D1515', borderRadius: 10, padding: 12, marginTop: 12,
    borderWidth: 1, borderColor: '#FF4444',
  },
  errorTexto: { color: '#FF8888', fontSize: 13, lineHeight: 18 },

  // Ciudades rápidas
  ciudadesLabel: { color: C.grisMedio, fontSize: 12, marginTop: 16, marginBottom: 8, fontWeight: '600' },
  ciudadChip: {
    backgroundColor: C.gris, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  ciudadChipTexto: { color: C.blanco, fontSize: 13 },

  // Botón admin
  btnAdminAcceso: {
    marginTop: 24, alignItems: 'center', paddingVertical: 10,
  },
  btnAdminAccesoTexto: { color: C.grisMedio, fontSize: 13 },

  // Categorías
  categoriasScroll: { maxHeight: 60, paddingVertical: 8 },
  categoriaBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: C.gris, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  categoriaBtnActivo: { backgroundColor: C.rojo },
  categoriaEmoji: { fontSize: 14 },
  categoriaLabel: { color: C.grisMedio, fontSize: 12, fontWeight: '600' },

  // Orden
  ordenRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  ordenLabel: { color: C.grisMedio, fontSize: 12, flex: 1 },
  ordenBtn: {
    borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: C.gris,
  },
  ordenBtnActivo: { backgroundColor: C.rojo },
  ordenBtnTexto: { color: C.grisMedio, fontSize: 11, fontWeight: '600' },

  // Tarjeta bar
  tarjeta: {
    backgroundColor: C.gris, borderRadius: 16, marginBottom: 12,
    flexDirection: 'row', overflow: 'hidden',
  },
  tarjetaFoto: { width: 90, height: 90 },
  tarjetaSinFoto: { backgroundColor: C.grisClaro, justifyContent: 'center', alignItems: 'center' },
  tarjetaInfo: { flex: 1, padding: 10, justifyContent: 'center' },
  tarjetaNombre: { color: C.blanco, fontSize: 14, fontWeight: '700', marginBottom: 3 },
  tarjetaDireccion: { color: C.grisMedio, fontSize: 11, marginBottom: 5 },
  tarjetaRow: { flexDirection: 'row', alignItems: 'center' },
  tarjetaVal: { color: C.amarillo, fontSize: 13, fontWeight: '700' },
  tarjetaOps: { color: C.grisMedio, fontSize: 11 },
  tarjetaDist: { color: C.grisMedio, fontSize: 11 },

  // Badge
  badge: {
    position: 'absolute', top: 6, left: 6,
    borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2,
  },
  badgeText: { color: C.blanco, fontSize: 9, fontWeight: '700' },

  // Botón ruta en tarjeta
  btnRuta: {
    width: 36, backgroundColor: C.grisClaro,
    justifyContent: 'center', alignItems: 'center',
  },
  btnRutaActivo: { backgroundColor: C.rojo },
  btnRutaIcon: { color: C.blanco, fontSize: 18, fontWeight: '700' },

  // Barra ruta
  barraRuta: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: C.negro, flexDirection: 'row',
    alignItems: 'center', padding: 16, gap: 12,
    borderTopWidth: 1, borderTopColor: C.gris,
  },
  barraRutaTexto: { color: C.blanco, fontSize: 14, flex: 1 },
  btnRutaAbrir: { backgroundColor: C.rojo, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  btnRutaAbrirTexto: { color: C.blanco, fontWeight: '700' },

  // Volver flotante
  btnVolverFlotante: {
    position: 'absolute', top: 44, left: 16,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 20,
    width: 36, height: 36, justifyContent: 'center', alignItems: 'center',
  },

  // Detalle
  detalleHero: { width: '100%', height: 240 },
  detalleBody: { padding: 16 },
  detalleNombre: { color: C.blanco, fontSize: 22, fontWeight: '800', marginBottom: 6 },
  detalleRatingRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 4 },
  detalleRatingVal: { color: C.amarillo, fontSize: 16, fontWeight: '700' },
  detalleOps: { color: C.grisMedio, fontSize: 13 },

  // Sección
  seccion: { marginBottom: 16 },
  seccionTitulo: { color: C.blanco, fontSize: 14, fontWeight: '700', marginBottom: 10 },

  // Chip especialidad
  chip: {
    backgroundColor: '#3D1B26', borderRadius: 16,
    paddingHorizontal: 12, paddingVertical: 5,
    borderWidth: 1, borderColor: C.rojo,
  },
  chipTexto: { color: C.rojo, fontSize: 12, fontWeight: '600' },

  // Tabs
  tabs: { flexDirection: 'row', marginBottom: 16, gap: 4 },
  tab: {
    flex: 1, paddingVertical: 8, borderRadius: 10,
    backgroundColor: C.gris, alignItems: 'center',
  },
  tabActivo: { backgroundColor: C.rojo },
  tabTexto: { color: C.grisMedio, fontSize: 13, fontWeight: '600' },
  tabTextoActivo: { color: C.blanco },

  // Info fila
  infoFila: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12, gap: 10 },
  infoIcono: { fontSize: 16, marginTop: 1 },
  infoTexto: { color: C.blancoSuave, fontSize: 14, flex: 1, lineHeight: 20 },

  // Horario
  horarioLinea: { color: C.blancoSuave, fontSize: 13, paddingVertical: 4, lineHeight: 18 },

  // Botón primario
  btnPrimario: {
    backgroundColor: C.rojo, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginTop: 8,
  },
  btnPrimarioTexto: { color: C.blanco, fontWeight: '700', fontSize: 15 },

  // Reseñas
  reseñaCard: {
    backgroundColor: C.gris, borderRadius: 12,
    padding: 12, marginBottom: 10,
  },
  reseñaHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  reseñaAutor: { color: C.blanco, fontSize: 13, fontWeight: '700', flex: 1 },
  reseñaTiempo: { color: C.grisMedio, fontSize: 11 },
  reseñaTexto: { color: C.blancoSuave, fontSize: 13, lineHeight: 18 },
  reseñaFecha: { color: C.grisMedio, fontSize: 11, marginTop: 4 },

  // Nueva reseña
  nuevaReseña: { backgroundColor: C.gris, borderRadius: 12, padding: 14, marginTop: 8 },
  estrellasSelector: { flexDirection: 'row', gap: 4, marginBottom: 12 },
  inputReseña: {
    backgroundColor: C.negro, color: C.blanco,
    borderRadius: 10, padding: 12, fontSize: 14,
    borderWidth: 1, borderColor: C.grisClaro,
    minHeight: 80, textAlignVertical: 'top',
  },
  contador: { color: C.grisMedio, fontSize: 11, textAlign: 'right', marginTop: 4 },

  // Admin
  adminCard: {
    backgroundColor: C.gris, borderRadius: 12, padding: 14, marginBottom: 12,
  },
  adminBarNombre: { color: C.rojo, fontSize: 14, fontWeight: '700', marginBottom: 6 },
  adminReseñaTexto: { color: C.blanco, fontSize: 13, marginVertical: 6, lineHeight: 18 },
  adminBotones: { flexDirection: 'row', gap: 10, marginTop: 8 },
  btnAdmin: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  btnAdminTexto: { color: C.blanco, fontWeight: '700', fontSize: 13 },

  // Vacío
  vacio: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  vacioTexto: { color: C.grisMedio, fontSize: 16, marginTop: 12, textAlign: 'center' },

  // Sin datos
  sinDatos: { color: C.grisMedio, fontSize: 14, textAlign: 'center', paddingVertical: 20 },
});
