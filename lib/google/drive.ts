import { google } from 'googleapis'
import { getGoogleTokens } from './auth'
import * as XLSX from 'xlsx'

// Carpeta en Google Drive donde subes los extractos XLS del banco
const CARPETA_EXTRACTOS = 'Panel de Vida/extractos'

export type Movimiento = {
  fecha: string        // YYYY-MM-DD
  concepto: string
  importe: number      // positivo = ingreso, negativo = gasto
  tipo: 'ingreso' | 'gasto'
}

/**
 * Navega la ruta de carpetas en Drive y devuelve el ID de la última.
 */
async function obtenerIdCarpeta(
  drive: ReturnType<typeof google.drive>,
  ruta: string
): Promise<string | null> {
  const partes = ruta.split('/')
  let parentId = 'root'

  for (const parte of partes) {
    const res = await drive.files.list({
      q: `name='${parte}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
      fields: 'files(id)',
      spaces: 'drive',
    })
    const carpeta = res.data.files?.[0]
    if (!carpeta?.id) return null
    parentId = carpeta.id
  }

  return parentId
}

/**
 * Convierte una fecha Excel (número de serie o string dd/mm/yyyy) a YYYY-MM-DD.
 */
function parsearFecha(val: unknown): string | null {
  if (!val) return null

  // Número de serie Excel
  if (typeof val === 'number') {
    const date = XLSX.SSF.parse_date_code(val)
    if (!date) return null
    const m = String(date.m).padStart(2, '0')
    const d = String(date.d).padStart(2, '0')
    return `${date.y}-${m}-${d}`
  }

  // String dd/mm/yyyy o dd-mm-yyyy
  if (typeof val === 'string') {
    const match = val.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})/)
    if (match) return `${match[3]}-${match[2]}-${match[1]}`
  }

  return null
}

/**
 * Parsea una hoja de cálculo del extracto CaixaBank.
 * Columnas esperadas (índice 0):
 *   0: Número de cuenta
 *   3: F. Operación
 *   5: Ingreso (+)
 *   6: Gasto (-)
 *  13: Concepto complementario 1  (descripción del comercio)
 *   9: Concepto común             (fallback)
 */
function parsearHojaCaixabank(sheet: XLSX.WorkSheet): Movimiento[] {
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  const movimientos: Movimiento[] = []

  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 7) continue

    const cuenta = String(row[0] ?? '').trim()
    // Saltamos filas de cabecera o vacías
    if (!cuenta || cuenta.startsWith('Número') || cuenta.startsWith('MOVIMIENTOS')) continue
    // La cuenta CaixaBank tiene espacios: "2100 3115 52 ..."
    if (!cuenta.includes(' ') && cuenta.length < 10) continue

    const fecha = parsearFecha(row[3])
    if (!fecha) continue

    const ingresoRaw = row[5]
    const gastoRaw = row[6]
    const concepto13 = String(row[13] ?? '').replace(/\s+/g, ' ').trim()
    const concepto9 = String(row[9] ?? '').replace(/\s+/g, ' ').trim()
    const concepto = concepto13 || concepto9 || 'Sin concepto'

    const ingreso = typeof ingresoRaw === 'number' ? ingresoRaw : parseFloat(String(ingresoRaw).replace(',', '.')) || 0
    const gasto = typeof gastoRaw === 'number' ? gastoRaw : parseFloat(String(gastoRaw).replace(',', '.')) || 0

    if (!ingreso && !gasto) continue

    movimientos.push({
      fecha,
      concepto,
      importe: ingreso > 0 ? ingreso : -gasto,
      tipo: ingreso > 0 ? 'ingreso' : 'gasto',
    })
  }

  return movimientos
}

/**
 * Descarga y parsea todos los archivos XLS de la carpeta Drive.
 * Devuelve movimientos de todos los meses, ordenados por fecha desc.
 */
export async function getMovimientosDrive(): Promise<{
  movimientos: Movimiento[]
  archivos: string[]
  error?: string
}> {
  try {
    const auth = await getGoogleTokens()
    if (!auth) {
      return { movimientos: [], archivos: [], error: 'No autenticado con Google' }
    }

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
      q: `'${carpetaId}' in parents and trashed=false and (name contains '.xls' or name contains '.XLS' or name contains '.xlsx')`,
      fields: 'files(id, name)',
      orderBy: 'name',
      spaces: 'drive',
    })

    const archivos = listaRes.data.files ?? []
    if (archivos.length === 0) {
      return {
        movimientos: [],
        archivos: [],
        error: `No hay archivos XLS en "${CARPETA_EXTRACTOS}". Sube los extractos mensuales del banco.`,
      }
    }

    const nombresArchivos: string[] = []
    const todosMovimientos: Movimiento[] = []

    for (const archivo of archivos) {
      if (!archivo.id) continue
      nombresArchivos.push(archivo.name ?? archivo.id)

      // Descargar el binario del archivo
      const res = await drive.files.get(
        { fileId: archivo.id, alt: 'media' },
        { responseType: 'arraybuffer' }
      )

      const buffer = Buffer.from(res.data as ArrayBuffer)
      const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false })

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName]
        const movs = parsearHojaCaixabank(sheet)
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
