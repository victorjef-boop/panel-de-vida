import { google } from 'googleapis'
import { getGoogleTokens } from './auth'

// Nombre de la carpeta en Google Drive donde subes los extractos
const CARPETA_EXTRACTOS = 'Panel de Vida/extractos'

export type Movimiento = {
  fecha: string        // YYYY-MM-DD
  concepto: string
  importe: number      // positivo = ingreso, negativo = gasto
  tipo: 'ingreso' | 'gasto'
  referencia?: string
}

/**
 * Busca la carpeta por ruta (crea la estructura si no existe) y devuelve su ID.
 */
async function obtenerIdCarpeta(drive: ReturnType<typeof google.drive>, ruta: string): Promise<string | null> {
  const partes = ruta.split('/')
  let parentId = 'root'

  for (const parte of partes) {
    const res = await drive.files.list({
      q: `name='${parte}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
      fields: 'files(id, name)',
      spaces: 'drive',
    })
    const carpeta = res.data.files?.[0]
    if (!carpeta?.id) return null
    parentId = carpeta.id
  }

  return parentId
}

/**
 * Parsea una fecha del formato dd/mm/yyyy o dd-mm-yyyy a YYYY-MM-DD.
 */
function parsearFecha(str: string): string {
  const [d, m, y] = str.includes('/') ? str.split('/') : str.split('-')
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

/**
 * Parsea el contenido TSV de un extracto bancario CaixaBank (formato XLS exportado).
 * Columnas relevantes: F. Operación (col 3), Ingreso (col 5), Gasto (col 6), Concepto complementario 1 (col 13)
 */
function parsearExtractoCaixabank(tsv: string): Movimiento[] {
  const lineas = tsv.split('\n').filter(l => l.trim())
  const movimientos: Movimiento[] = []

  for (const linea of lineas) {
    const cols = linea.split('\t')
    // Saltamos cabeceras y filas sin número de cuenta
    if (!cols[0]?.trim() || !cols[0].includes(' ') || cols[0].trim().startsWith('Número')) continue
    if (cols.length < 7) continue

    const fechaRaw = cols[3]?.trim()
    const ingresoRaw = cols[5]?.trim()
    const gastoRaw = cols[6]?.trim()
    // Concepto: tomamos el complementario 1 (col 13) si existe, si no el común (col 9)
    const conceptoRaw = (cols[13]?.trim() || cols[9]?.trim() || '').replace(/\s+/g, ' ').trim()

    if (!fechaRaw || !fechaRaw.match(/\d{2}[\/\-]\d{2}[\/\-]\d{4}/)) continue

    const ingreso = ingresoRaw ? parseFloat(ingresoRaw.replace(',', '.')) : 0
    const gasto = gastoRaw ? parseFloat(gastoRaw.replace(',', '.')) : 0

    if (!ingreso && !gasto) continue

    movimientos.push({
      fecha: parsearFecha(fechaRaw),
      concepto: conceptoRaw || 'Sin concepto',
      importe: ingreso > 0 ? ingreso : -gasto,
      tipo: ingreso > 0 ? 'ingreso' : 'gasto',
    })
  }

  return movimientos
}

/**
 * Descarga y parsea todos los XLS de extractos desde Google Drive.
 * Devuelve los movimientos de todos los archivos encontrados, ordenados por fecha desc.
 */
export async function getMovimientosDrive(): Promise<{ movimientos: Movimiento[]; archivos: string[]; error?: string }> {
  try {
    const auth = await getGoogleTokens()
    if (!auth) return { movimientos: [], archivos: [], error: 'No autenticado con Google' }

    const drive = google.drive({ version: 'v3', auth })

    const carpetaId = await obtenerIdCarpeta(drive, CARPETA_EXTRACTOS)
    if (!carpetaId) {
      return {
        movimientos: [],
        archivos: [],
        error: `Carpeta "${CARPETA_EXTRACTOS}" no encontrada en Drive. Créala y sube los XLS del banco ahí.`,
      }
    }

    // Listar archivos XLS/XLSX en la carpeta
    const listaRes = await drive.files.list({
      q: `'${carpetaId}' in parents and trashed=false and (name contains '.xls' or name contains '.XLS')`,
      fields: 'files(id, name)',
      orderBy: 'name',
      spaces: 'drive',
    })

    const archivos = listaRes.data.files ?? []
    if (archivos.length === 0) {
      return { movimientos: [], archivos: [], error: `No hay archivos XLS en "${CARPETA_EXTRACTOS}"` }
    }

    const nombresArchivos: string[] = []
    const todosMovimientos: Movimiento[] = []

    for (const archivo of archivos) {
      if (!archivo.id) continue
      nombresArchivos.push(archivo.name ?? archivo.id)

      // Exportar como TSV para parsear sin librerías de Excel
      const exportRes = await drive.files.export(
        { fileId: archivo.id, mimeType: 'text/tab-separated-values' },
        { responseType: 'text' }
      ).catch(async () => {
        // Si no es un Google Sheet, descargarlo directamente como texto
        return drive.files.get(
          { fileId: archivo.id, alt: 'media' },
          { responseType: 'text' }
        )
      })

      const contenido = exportRes.data as string
      if (contenido) {
        const movs = parsearExtractoCaixabank(contenido)
        todosMovimientos.push(...movs)
      }
    }

    // Ordenar por fecha descendente
    todosMovimientos.sort((a, b) => b.fecha.localeCompare(a.fecha))

    return { movimientos: todosMovimientos, archivos: nombresArchivos }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido'
    return { movimientos: [], archivos: [], error: msg }
  }
}
