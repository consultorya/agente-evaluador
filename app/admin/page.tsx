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

interface EstudianteBD {
  id: number;
  nombre: string;
  email: string;
  seccion: string;
}

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
  const [generando, setGenerando] = useState(false);

  // Estado de Autenticación
  const [autenticado, setAutenticado] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [errorPassword, setErrorPassword] = useState('');

  // Estado de Pestañas
  const [pestana, setPestana] = useState<'examen' | 'secciones' | 'estudiantes' | 'resultados'>('examen');

  // Estados para gestión de estudiantes
  const [estudiantes, setEstudiantes] = useState<EstudianteBD[]>([]);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoEmail, setNuevoEmail] = useState('');
  const [nuevaSeccionEstudiante, setNuevaSeccionEstudiante] = useState('');

  // Estado de Secciones
  const [secciones, setSecciones] = useState<SeccionBD[]>([]);
  const [nuevaSeccion, setNuevaSeccion] = useState('');

  // Estado de Resultados y Filtros
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [seccionFiltro, setSeccionFiltro] = useState<string>('TODAS');
  const [tituloFiltro, setTituloFiltro] = useState<string>('TODOS');

  const [examenes, setExamenes] = useState<any[]>([]);
  const [cargandoExamenes, setCargandoExamenes] = useState(true);

  const cargarTodasLasSecciones = async () => {
    setCargandoExamenes(true);
    const { data, error } = await supabase
      .from('examenes')
      .select('id, titulo, texto_base, cantidad_preguntas, activo, seccion')
      .order('id', { ascending: true });

    if (!error && data) {
      setExamenes(data);
    }
    setCargandoExamenes(false);
  };

  useEffect(() => {
    cargarTodasLasSecciones();
  }, []);

  const cargarEstudiantes = async () => {
    const { data } = await supabase.from('estudiantes').select('*').order('nombre', { ascending: true });
    if (data) setEstudiantes(data);
  };

  useEffect(() => {
    const esAdmin = sessionStorage.getItem('admin_authenticated');
    if (esAdmin === 'true') {
      setAutenticado(true);
    }
  }, []);

  useEffect(() => {
    if (autenticado) {
      cargarSecciones();
      cargarResultados();
      cargarEstudiantes();
    }
  }, [autenticado]);

  const handleAgregarEstudiante = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailLimpio = nuevoEmail.trim().toLowerCase();

    if (!nuevoNombre.trim() || !emailLimpio || !nuevaSeccionEstudiante) {
      alert('Completa todos los campos');
      return;
    }

    const { data: estudianteExistente, error: errorConsulta } = await supabase
      .from('estudiantes')
      .select('id, email')
      .eq('email', emailLimpio)
      .maybeSingle();

    if (errorConsulta) {
      alert(`Error al verificar correo: ${errorConsulta.message}`);
      return;
    }

    if (estudianteExistente) {
      alert(`⚠️ El estudiante con correo "${emailLimpio}" ya se encuentra registrado.`);
      return;
    }

    const { error } = await supabase.from('estudiantes').insert({
      nombre: nuevoNombre.trim(),
      email: emailLimpio,
      seccion: nuevaSeccionEstudiante,
    });

    if (error) {
      alert(`Error al registrar estudiante: ${error.message}`);
    } else {
      alert('✅ Estudiante registrado exitosamente.');
      setNuevoNombre('');
      setNuevoEmail('');
      setNuevaSeccionEstudiante('');
      cargarEstudiantes();
    }
  };

  const handleEliminarEstudiante = async (id: number) => {
    if (!confirm('¿Eliminar a este estudiante del padrón?')) return;
    const { error } = await supabase.from('estudiantes').delete().eq('id', id);
    if (!error) cargarEstudiantes();
  };

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

  const titulosDisponibles = Array.from(
    new Set(resultados.map((r: any) => r.titulo_examen).filter(Boolean))
  );

  const resultadosFiltrados = resultados.filter((item: any) => {
    const secItem = item.seccion?.toLowerCase().replace('sección', '').replace('seccion', '').trim() || '';
    const secFiltro = seccionFiltro.toLowerCase().replace('sección', '').replace('seccion', '').trim();

    const coincideSeccion =
      seccionFiltro === 'TODAS' || secItem === secFiltro;

    const coincideTitulo =
      tituloFiltro === 'TODOS' ||
      item.titulo_examen?.trim().toLowerCase() === tituloFiltro.trim().toLowerCase();

    return coincideSeccion && coincideTitulo;
  });

  const exportarExcel = () => {
    if (resultadosFiltrados.length === 0) {
      alert('No hay resultados para exportar.');
      return;
    }

    const datosExcel = resultadosFiltrados.map((item, index) => {
      const fecha = item.created_at || item.fecha_registro;
      return {
        'N°': index + 1,
        'Correo Estudiante': item.estudiante_email,
        'Sección': item.seccion,
        'Evaluación': item.titulo_examen,
        'Respuestas Correctas': `${item.correctas} / ${item.total_preguntas}`,
        'Nota (sobre 20)': item.nota,
        'Fecha y Hora': fecha ? new Date(fecha).toLocaleString('es-PE') : 'Sin fecha',
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(datosExcel);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Calificaciones');

    const nombreArchivo = `Reporte_Notas_${seccionFiltro}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(workbook, nombreArchivo);
  };

  const handleRegenerarPreguntas = async () => {
    if (!confirm('¿Deseas re-generar un nuevo examen para TODAS las secciones?')) return;

    setGenerando(true);
    try {
      const res = await fetch('/api/regenerar-preguntas', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error en la solicitud');

      alert(data.mensaje || 'Preguntas regeneradas correctamente');
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setGenerando(false);
    }
  };

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
            <button
              type="button"
              onClick={handleRegenerarPreguntas}
              disabled={generando}
              className="px-4 py-2 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 disabled:opacity-50"
            >
              {generando ? '⏳ Generando preguntas...' : '🔄 Re-generar Preguntas desde PDF Guardado'}
            </button>
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
          <button
            onClick={() => {
              setPestana('estudiantes');
              cargarEstudiantes();
            }}
            className={`px-6 py-3 font-semibold text-sm ${
              pestana === 'estudiantes'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Padrón de Estudiantes ({estudiantes.length})
          </button>
        </div>

        {/* Pestaña 1: Configuración de Exámenes por Sección */}
        {pestana === 'examen' && (
          <div className="bg-white p-6 rounded-b-lg shadow-md space-y-6">
            <div className="bg-blue-50 border-l-4 border-blue-600 p-4 rounded-r-lg">
              <h3 className="font-bold text-blue-900 text-sm">Configuración de Exámenes por Sección</h3>
              <p className="text-xs text-blue-700 mt-1">
                Cada sección detectada en la base de datos cuenta con su propio contenido y estado de activación independiente.
              </p>
            </div>

            {cargandoExamenes ? (
              <p className="text-xs text-gray-500 font-semibold">Cargando secciones...</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {examenes.map((examenItem) => (
                  <ConfiguracionExamenSeccion
                    key={examenItem.id}
                    datosExamen={examenItem}
                    supabase={supabase}
                    pdfjsLib={pdfjsLib}
                  />
                ))}
              </div>
            )}
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
            <div className="flex flex-wrap justify-between items-center gap-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-semibold text-gray-700">Sección:</label>
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

                <div className="flex items-center gap-2">
                  <label className="text-sm font-semibold text-gray-700">Examen:</label>
                  <select
                    value={tituloFiltro}
                    onChange={(e) => setTituloFiltro(e.target.value)}
                    className="p-2 border rounded-lg text-sm bg-white text-gray-800"
                  >
                    <option value="TODOS">Todos los exámenes</option>
                    {titulosDisponibles.map((t: any) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
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
                  {resultadosFiltrados.map((res) => {
                    const fecha = res.created_at || res.fecha_registro;
                    return (
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
                          {fecha ? new Date(fecha).toLocaleString('es-PE') : 'Sin fecha'}
                        </td>
                      </tr>
                    );
                  })}
                  {resultadosFiltrados.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-gray-400">
                        No hay calificaciones que coincidan con los criterios de búsqueda.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Pestaña 4: Padrón de Estudiantes */}
        {pestana === 'estudiantes' && (
          <div className="bg-white p-6 rounded-b-lg shadow-md space-y-6">
            <form onSubmit={handleAgregarEstudiante} className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <input
                type="text"
                placeholder="Nombre Completo"
                value={nuevoNombre}
                onChange={(e) => setNuevoNombre(e.target.value)}
                className="p-3 border rounded-lg text-gray-800"
                required
              />
              <input
                type="email"
                placeholder="correo@ucvvirtual.edu.pe"
                value={nuevoEmail}
                onChange={(e) => setNuevoEmail(e.target.value)}
                className="p-3 border rounded-lg text-gray-800"
                required
              />
              <select
                value={nuevaSeccionEstudiante}
                onChange={(e) => setNuevaSeccionEstudiante(e.target.value)}
                className="p-3 border rounded-lg text-gray-800 bg-white"
                required
              >
                <option value="">Seleccionar Sección</option>
                {secciones.map((s) => (
                  <option key={s.id} value={s.nombre}>Sección {s.nombre}</option>
                ))}
              </select>
              <button type="submit" className="py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700">
                + Registrar Estudiante
              </button>
            </form>

            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-600">
                <thead className="bg-gray-100 text-gray-700 uppercase font-semibold text-xs">
                  <tr>
                    <th className="p-3">Nombre</th>
                    <th className="p-3">Correo</th>
                    <th className="p-3">Sección</th>
                    <th className="p-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {estudiantes.map((est) => (
                    <tr key={est.id} className="hover:bg-gray-50">
                      <td className="p-3 font-medium text-gray-800">{est.nombre}</td>
                      <td className="p-3">{est.email}</td>
                      <td className="p-3">
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-semibold">
                          {est.seccion}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => handleEliminarEstudiante(est.id)}
                          className="text-red-600 font-bold text-xs hover:underline"
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                  {estudiantes.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-gray-400">
                        No hay estudiantes registrados.
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

interface PropsSeccion {
  datosExamen: any;
  supabase: any;
  pdfjsLib: any;
}

function ConfiguracionExamenSeccion({ datosExamen, supabase, pdfjsLib }: PropsSeccion) {
  const [archivoPdf, setArchivoPdf] = useState<File | null>(null);
  const [titulo, setTitulo] = useState(datosExamen.titulo || '');
  const [textoBase, setTextoBase] = useState(datosExamen.texto_base || '');
  const [cantidadPreguntas, setCantidadPreguntas] = useState(datosExamen.cantidad_preguntas || 5);
  const [activo, setActivo] = useState(datosExamen.activo ?? false);
  const [guardando, setGuardando] = useState(false);
  const [cargandoPdf, setCargandoPdf] = useState(false);
  const [msg, setMsg] = useState('');

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setArchivoPdf(file);
    setCargandoPdf(true);
    setMsg('Leyendo PDF...');

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
      setMsg(`✅ PDF cargado (${pdf.numPages} pág).`);
    } catch (err: any) {
      console.error('Error lectura PDF:', err);
      setMsg('❌ Error al leer PDF.');
    } finally {
      setCargandoPdf(false);
    }
  };

  const [msgExamen, setMsgExamen] = useState<string | null>(null);
  const [msgPreguntas, setMsgPreguntas] = useState<string | null>(null);

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setMsgExamen('Guardando datos del examen...');
    setMsgPreguntas(null);

    try {
      // -----------------------------------------------------------------
      // 1. ACTUALIZAR TABLA 'examenes' (titulo, texto_base, activo, etc.)
      // -----------------------------------------------------------------
      const { error: errorExamen } = await supabase
        .from('examenes')
        .update({
          titulo: titulo.trim(),
          texto_base: textoBase.trim(),
          cantidad_preguntas: cantidadPreguntas,
          activo: activo,
        })
        .eq('id', datosExamen.id);

      if (errorExamen) {
        setMsgExamen(`❌ Error al actualizar el examen: ${errorExamen.message}`);
        setGuardando(false);
        return; // Si falla la BD principal, detendremos el proceso
      }

      setMsgExamen('✅ Datos del examen (título, lectura y estado) actualizados correctamente.');

      // -----------------------------------------------------------------
      // 2. GENERAR Y GUARDAR PREGUNTAS EN 'secciones' (Gemini + Supabase)
      // -----------------------------------------------------------------
      if (!textoBase.trim()) {
        setMsgPreguntas('⚠️ No se generaron preguntas porque el texto de lectura está vacío.');
        setGuardando(false);
        return;
      }

      setMsgPreguntas('⏳ Generando preguntas con la IA...');

      let preguntasGeneradas: any[] = [];
      const formData = new FormData();
      formData.append('textoBase', textoBase.trim());
      formData.append('cantidadPreguntas', cantidadPreguntas.toString());

      if (archivoPdf) {
        formData.append('file', archivoPdf);
      }

      const resGenerar = await fetch('/api/generar-preguntas', {
        method: 'POST',
        body: formData,
      });

      const dataGenerar = await resGenerar.json();

      if (!resGenerar.ok) {
        // En caso de error 503 o falla de modelo, capturamos el mensaje de la IA
        setMsgPreguntas(`⚠️ Las preguntas NO se generaron por alta demanda/error de la IA: ${dataGenerar.error || 'Intente nuevamente más tarde.'}`);
      } else {
        preguntasGeneradas = dataGenerar.preguntas || [];

        // Guardar las preguntas generadas en la tabla 'secciones'
        const nombreSeccion = datosExamen.seccion || datosExamen.nombre;

        if (nombreSeccion && preguntasGeneradas.length > 0) {
          const { error: errorSeccion } = await supabase
            .from('secciones')
            .update({
              preguntas: preguntasGeneradas,
            })
            .eq('nombre', nombreSeccion);

          if (errorSeccion) {
            setMsgPreguntas(`❌ Preguntas generadas por la IA, pero falló al guardarlas en la BD: ${errorSeccion.message}`);
          } else {
            setMsgPreguntas(`✅ ¡Preguntas generadas y guardadas exitosamente! (${preguntasGeneradas.length} preguntas)`);
          }
        } else {
          setMsgPreguntas('⚠️ Se generaron 0 preguntas. Verifica el contenido del texto base.');
        }
      }

    } catch (error: any) {
      const mensajeDetallado = error?.message || String(error);
      console.error('Error general en handleGuardar:', mensajeDetallado);
      setMsgExamen(`❌ Error en el proceso: ${mensajeDetallado}`);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-4 shadow-sm flex flex-col justify-between">
      <form onSubmit={handleGuardar} className="space-y-4">
        <div className="flex justify-between items-center border-b pb-3">
          <div>
            <h3 className="font-bold text-gray-800 text-sm">
              Sección: {datosExamen.seccion || datosExamen.nombre || `ID ${datosExamen.id}`}
            </h3>
            <span className="text-xs text-gray-500">ID Fila: {datosExamen.id}</span>
          </div>

          <label className="inline-flex items-center cursor-pointer gap-2">
            <span className="text-xs font-semibold text-gray-700">
              {activo ? 'Activo' : 'Bloqueado'}
            </span>
            <input
              type="checkbox"
              checked={activo}
              onChange={(e) => setActivo(e.target.checked)}
              className="sr-only peer"
            />
            <div className="relative w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
          </label>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            Título del Examen (Versión)
          </label>
          <input
            type="text"
            required
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            className="w-full p-2 border rounded text-sm text-gray-800 focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="Ej: Control 1, Examen Parcial"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            Cargar nueva lectura (PDF)
          </label>
          <input
            type="file"
            accept="application/pdf"
            onChange={handleFileUpload}
            disabled={cargandoPdf}
            className="w-full text-xs text-gray-500 file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            Texto de la Lectura
          </label>
          <textarea
            rows={4}
            value={textoBase}
            onChange={(e) => setTextoBase(e.target.value)}
            className="w-full p-2 border rounded text-xs text-gray-800 focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="Pega el texto aquí o sube un PDF..."
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">N° Preguntas a Generar</label>
          <input
            type="number"
            min={1}
            max={20}
            value={cantidadPreguntas}
            onChange={(e) => setCantidadPreguntas(Number(e.target.value))}
            className="w-24 p-2 border rounded text-sm text-gray-800 focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        {/* Alerta para Datos del Examen (Estado, Título, Texto Base) */}
        {msgExamen && (
          <div className={`p-3 rounded-md mb-3 text-sm font-medium ${
            msgExamen.startsWith('✅') ? 'bg-green-100 text-green-800 border border-green-300' : 'bg-red-100 text-red-800 border border-red-300'
          }`}>
            {msgExamen}
          </div>
        )}

        {/* Alerta para Generación y Guardado de Preguntas (IA + Secciones) */}
        {msgPreguntas && (
          <div className={`p-3 rounded-md mb-3 text-sm font-medium ${
            msgPreguntas.startsWith('✅') ? 'bg-green-100 text-green-800 border border-green-300' :
            msgPreguntas.startsWith('⚠️') ? 'bg-amber-100 text-amber-800 border border-amber-300' :
            'bg-red-100 text-red-800 border border-red-300'
          }`}>
            {msgPreguntas}
          </div>
        )}

        <button
          type="submit"
          disabled={guardando || cargandoPdf}
          className="w-full py-2.5 bg-blue-600 text-white font-bold rounded text-xs hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
        >
          {guardando ? '⏳ Guardando y generando...' : '💾 Guardar Cambios de Sección'}
        </button>
      </form>
    </div>
  );
}