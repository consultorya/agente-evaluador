'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import * as pdfjsLib from 'pdfjs-dist';
import * as XLSX from 'xlsx';

// Configurar el worker para pdfjs-dist
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

interface Resultado {
  id: number;
  estudiante_email: string;
  seccion: string;
  titulo_examen: string;
  nota: number;
  correctas: number;
  total_preguntas: number;
  created_at?: string;
  fecha_registro?: string;
}

interface SeccionBD {
  id: number;
  nombre: string;
}

export default function AdminPage() {
  // Estado de Autenticación
  const [autenticado, setAutenticado] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [errorPassword, setErrorPassword] = useState('');

  // Estado de Pestañas
  const [pestana, setPestana] = useState<'examen' | 'secciones' | 'resultados'>('examen');

  // Estado del Examen
  const [titulo, setTitulo] = useState('');
  const [textoBase, setTextoBase] = useState('');
  const [cantidadPreguntas, setCantidadPreguntas] = useState(5);
  const [activo, setActivo] = useState(false);
  const [guardandoExamen, setGuardandoExamen] = useState(false);
  const [cargandoPdf, setCargandoPdf] = useState(false);
  const [msgExamen, setMsgExamen] = useState('');

  // Estado de Secciones
  const [secciones, setSecciones] = useState<SeccionBD[]>([]);
  const [nuevaSeccion, setNuevaSeccion] = useState('');

  // Estado de Resultados
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [seccionFiltro, setSeccionFiltro] = useState<string>('TODAS');

  // Verificar si ya inició sesión previamente en la sesión actual
  useEffect(() => {
    const esAdmin = sessionStorage.getItem('admin_authenticated');
    if (esAdmin === 'true') {
      setAutenticado(true);
    }
  }, []);

  useEffect(() => {
    if (autenticado) {
      cargarDatosExamen();
      cargarSecciones();
      cargarResultados();
    }
  }, [autenticado]);

  // Manejar Login Docente
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const claveCorrecta = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || 'admin123';

    if (passwordInput === claveCorrecta) {
      sessionStorage.setItem('admin_authenticated', 'true');
      setAutenticado(true);
      setErrorPassword('');
    } else {
      setErrorPassword('Contraseña incorrecta. Inténtalo nuevamente.');
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('admin_authenticated');
    setAutenticado(false);
  };

  const cargarDatosExamen = async () => {
    const { data, error } = await supabase.from('examenes').select('*').eq('id', 1).single();
    if (!error && data) {
      setTitulo(data.titulo || '');
      setTextoBase(data.texto_base || '');
      setCantidadPreguntas(data.cantidad_preguntas || 5);
      setActivo(data.activo || false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      alert('Por favor selecciona un archivo en formato PDF.');
      return;
    }

    setCargandoPdf(true);
    setMsgExamen('Leyendo contenido del PDF...');

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      let textoExtraido = '';

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        textoExtraido += pageText + '\n\n';
      }

      setTextoBase(textoExtraido.trim());
      setMsgExamen(`✅ PDF cargado con éxito (${pdf.numPages} páginas leídas).`);
    } catch (err) {
      setMsgExamen('❌ Error al leer el archivo PDF.');
      console.error(err);
    } finally {
      setCargandoPdf(false);
    }
  };

  const handleGuardarExamen = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardandoExamen(true);
    setMsgExamen('');

    const { error } = await supabase.from('examenes').upsert({
      id: 1,
      titulo,
      texto_base: textoBase,
      cantidad_preguntas: cantidadPreguntas,
      activo,
    });

    if (error) {
      setMsgExamen(`Error al guardar: ${error.message}`);
    } else {
      setMsgExamen('✅ Configuración del examen actualizada con éxito.');
    }
    setGuardandoExamen(false);
  };

  const cargarSecciones = async () => {
    const { data } = await supabase.from('secciones').select('*').order('nombre', { ascending: true });
    if (data) setSecciones(data);
  };

  const handleAgregarSeccion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevaSeccion.trim()) return;

    const { error } = await supabase.from('secciones').insert({ nombre: nuevaSeccion.trim() });
    if (!error) {
      setNuevaSeccion('');
      cargarSecciones();
    }
  };

  const handleEliminarSeccion = async (id: number) => {
    if (!confirm('¿Seguro de eliminar esta sección?')) return;
    const { error } = await supabase.from('secciones').delete().eq('id', id);
    if (!error) cargarSecciones();
  };

  const cargarResultados = async () => {
    const { data, error } = await supabase.from('resultados').select('*');

    if (error) {
      console.error('Error al cargar resultados:', error.message);
      alert(`Error al cargar reporte: ${error.message}`);
    } else if (data) {
      setResultados(data);
    }
  };

  const exportarExcel = () => {
    if (resultadosFiltrados.length === 0) {
      alert('No hay resultados para exportar.');
      return;
    }

    const datosExcel = resultadosFiltrados.map((item, index) => ({
      'N°': index + 1,
      'Correo Estudiante': item.estudiante_email,
      'Sección': item.seccion,
      'Evaluación': item.titulo_examen,
      'Respuestas Correctas': `${item.correctas} / ${item.total_preguntas}`,
      'Nota (sobre 20)': item.nota,
      'Fecha y Hora': item.created_at || item.fecha_registro
        ? new Date(item.created_at || item.fecha_registro!).toLocaleString('es-PE')
        : 'Sin fecha',
    }));

    const worksheet = XLSX.utils.json_to_sheet(datosExcel);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Calificaciones');

    const nombreArchivo = `Reporte_Notas_${seccionFiltro}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(workbook, nombreArchivo);
  };

  const resultadosFiltrados = seccionFiltro === 'TODAS'
    ? resultados
    : resultados.filter((r) => r.seccion === seccionFiltro);

  // --- VISTA DE LOGIN SI NO ESTÁ AUTENTICADO ---
  if (!autenticado) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-xl shadow-md max-w-md w-full space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-800">Acceso Docente</h1>
            <p className="text-sm text-gray-500 mt-1">Ingresa la contraseña del Panel de Administración</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Contraseña de Administrador</label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="mt-1 w-full p-3 border rounded-lg text-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            {errorPassword && (
              <p className="text-xs text-red-600 font-semibold">{errorPassword}</p>
            )}

            <button
              type="submit"
              className="w-full py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors"
            >
              Ingresar al Panel
            </button>
          </form>

          <div className="text-center pt-2">
            <a href="/" className="text-xs text-gray-500 hover:text-gray-700">
              ← Regresar a la vista de estudiantes
            </a>
          </div>
        </div>
      </div>
    );
  }

  // --- VISTA DEL PANEL DE ADMINISTRACIÓN (AUTENTICADO) ---
  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Encabezado */}
        <div className="bg-white p-6 rounded-lg shadow-md flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Panel Docente - UCV Evaluaciones</h1>
            <p className="text-sm text-gray-500">Gestión de lecturas, exámenes y reporte de calificaciones</p>
          </div>
          <div className="flex gap-2">
            <a
              href="/"
              className="px-4 py-2 bg-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-300 text-sm"
            >
              Vista Estudiante
            </a>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-100 text-red-700 font-semibold rounded-lg hover:bg-red-200 text-sm"
            >
              Cerrar Sesión
            </button>
          </div>
        </div>

        {/* Pestañas */}
        <div className="flex border-b border-gray-200 bg-white rounded-t-lg">
          <button
            onClick={() => setPestana('examen')}
            className={`px-6 py-3 font-semibold text-sm ${
              pestana === 'examen'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Configuración del Examen
          </button>
          <button
            onClick={() => setPestana('secciones')}
            className={`px-6 py-3 font-semibold text-sm ${
              pestana === 'secciones'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Gestión de Secciones
          </button>
          <button
            onClick={() => {
              setPestana('resultados');
              cargarResultados();
            }}
            className={`px-6 py-3 font-semibold text-sm ${
              pestana === 'resultados'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Reporte de Calificaciones ({resultados.length})
          </button>
        </div>

        {/* Pestaña 1: Configuración del Examen */}
        {pestana === 'examen' && (
          <div className="bg-white p-6 rounded-b-lg shadow-md space-y-6">
            <form onSubmit={handleGuardarExamen} className="space-y-6">
              <div className="flex justify-between items-center bg-gray-50 p-4 rounded-lg border">
                <div>
                  <h3 className="font-bold text-gray-800">Estado del Examen</h3>
                  <p className="text-xs text-gray-500">Si está inactivo, ningún alumno podrá ingresar.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={activo}
                    onChange={(e) => setActivo(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                  <span className="ml-3 text-sm font-semibold text-gray-700">
                    {activo ? 'ACTIVADO' : 'DESACTIVADO'}
                  </span>
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Título de la Evaluación / Lectura</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Evaluación N° 2 - Comprensión Lectora Semana 3"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  className="mt-1 w-full p-3 border rounded-lg text-gray-800"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Cantidad de Preguntas a Generar con Gemini
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  required
                  value={cantidadPreguntas}
                  onChange={(e) => setCantidadPreguntas(Number(e.target.value))}
                  className="mt-1 w-32 p-3 border rounded-lg text-gray-800"
                />
              </div>

              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
                <label className="block text-sm font-bold text-blue-900">
                  📄 Subir nueva lectura en PDF (Opcional)
                </label>
                <p className="text-xs text-blue-700">
                  Selecciona un archivo PDF para extraer su texto e insertarlo automáticamente en el campo inferior.
                </p>
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handleFileUpload}
                  disabled={cargandoPdf}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Texto Base Extraído / Lectura o Banco de Preguntas
                </label>
                <textarea
                  rows={8}
                  required
                  placeholder="El texto extraído del PDF aparecerá aquí, o puedes pegarlo/editarlo manualmente..."
                  value={textoBase}
                  onChange={(e) => setTextoBase(e.target.value)}
                  className="mt-1 w-full p-3 border rounded-lg text-gray-800 font-mono text-sm"
                />
              </div>

              {msgExamen && (
                <div className={`p-3 rounded-lg text-sm ${msgExamen.includes('❌') || msgExamen.includes('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                  {msgExamen}
                </div>
              )}

              <button
                type="submit"
                disabled={guardandoExamen || cargandoPdf}
                className="px-6 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400"
              >
                {guardandoExamen ? 'Guardando...' : 'Guardar y Actualizar Evaluación'}
              </button>
            </form>
          </div>
        )}

        {/* Pestaña 2: Gestión de Secciones */}
        {pestana === 'secciones' && (
          <div className="bg-white p-6 rounded-b-lg shadow-md space-y-6">
            <form onSubmit={handleAgregarSeccion} className="flex gap-4">
              <input
                type="text"
                placeholder="Nombre de sección (ej: A1, B2, C1)"
                value={nuevaSeccion}
                onChange={(e) => setNuevaSeccion(e.target.value)}
                className="flex-1 p-3 border rounded-lg text-gray-800"
              />
              <button
                type="submit"
                className="px-6 py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700"
              >
                + Agregar Sección
              </button>
            </form>

            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-left text-sm text-gray-600">
                <thead className="bg-gray-100 text-gray-700 uppercase font-semibold">
                  <tr>
                    <th className="p-3">ID</th>
                    <th className="p-3">Sección</th>
                    <th className="p-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {secciones.map((sec) => (
                    <tr key={sec.id} className="hover:bg-gray-50">
                      <td className="p-3">{sec.id}</td>
                      <td className="p-3 font-semibold text-gray-800">{sec.nombre}</td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => handleEliminarSeccion(sec.id)}
                          className="text-red-600 hover:text-red-800 text-xs font-bold"
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                  {secciones.length === 0 && (
                    <tr>
                      <td colSpan={3} className="p-4 text-center text-gray-400">
                        No hay secciones registradas.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Pestaña 3: Reporte de Calificaciones */}
        {pestana === 'resultados' && (
          <div className="bg-white p-6 rounded-b-lg shadow-md space-y-6">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <label className="text-sm font-semibold text-gray-700">Filtrar por sección:</label>
                <select
                  value={seccionFiltro}
                  onChange={(e) => setSeccionFiltro(e.target.value)}
                  className="p-2 border rounded-lg text-sm bg-white text-gray-800"
                >
                  <option value="TODAS">Todas las secciones</option>
                  {secciones.map((s) => (
                    <option key={s.id} value={s.nombre}>
                      Sección {s.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={exportarExcel}
                  className="px-4 py-2 bg-green-600 text-white text-xs font-bold rounded hover:bg-green-700 flex items-center gap-1"
                >
                  📊 Descargar Excel
                </button>
                <button
                  onClick={cargarResultados}
                  className="px-4 py-2 bg-gray-100 text-gray-700 text-xs font-bold rounded hover:bg-gray-200"
                >
                  🔄 Actualizar Tabla
                </button>
              </div>
            </div>

            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-600">
                <thead className="bg-gray-100 text-gray-700 uppercase font-semibold text-xs">
                  <tr>
                    <th className="p-3">Correo Estudiante</th>
                    <th className="p-3">Sección</th>
                    <th className="p-3">Evaluación</th>
                    <th className="p-3 text-center">Correctas</th>
                    <th className="p-3 text-center">Nota / 20</th>
                    <th className="p-3 text-right">Fecha</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {resultadosFiltrados.map((res) => (
                    <tr key={res.id} className="hover:bg-gray-50">
                      <td className="p-3 font-medium text-gray-800">{res.estudiante_email}</td>
                      <td className="p-3">
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-semibold">
                          {res.seccion}
                        </span>
                      </td>
                      <td className="p-3 text-xs text-gray-600">{res.titulo_examen}</td>
                      <td className="p-3 text-center">
                        {res.correctas} / {res.total_preguntas}
                      </td>
                      <td className="p-3 text-center">
                        <span
                          className={`font-bold px-2 py-1 rounded text-xs ${
                            res.nota >= 11
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {res.nota}
                        </span>
                      </td>
                      <td className="p-3 text-right text-xs text-gray-400">
                        {res.created_at || res.fecha_registro
                          ? new Date(res.created_at || res.fecha_registro!).toLocaleString('es-PE')
                          : 'Sin fecha'}
                      </td>
                    </tr>
                  ))}
                  {resultadosFiltrados.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-gray-400">
                        No hay calificaciones para mostrar.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}