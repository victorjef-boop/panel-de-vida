import { google } from 'googleapis'
import { getGoogleTokens } from './auth'
import * as XLSX from 'xlsx'

const CARPETA_EXTRACTOS = 'Panel de Vida/extractos'

export type Movimiento = {
  fecha: string        // YYYY-MM-DD
  concepto: string
  importe: number      // positivo = ingreso, negativo = gasto
  tipo: 'ingreso' | 'gasto'
}

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

function parsearFechaStr(val: unknown): string | null {
  if (!val) return null
  const s = String(val).trim()
  // dd/mm/yyyy o dd-mm-yyyy
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/)
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`
  // yyyy-mm-dd
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m2) return s.slice(0, 10)
  // número de serie Excel
  if (typeof val === 'number') {
    const date = XLSX.SSF.parse_date_code(val)
    if (date) return `${date.y}-${String(date.m).padStart(2,'0')}-${String(date.d).padStart(2,'0')}`
  }
  return null
}

function parsearImporte(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0
  if (typeof val === 'number') return val
  const s = String(val).trim().replace(/\./g, '').replace(',', '.')
  return parseFloat(s) || 0
}

/**
 * CaixaBank OLE2 XLS:
 * Fila 0: vacía (MOVIMIENTOS DESDE...)
 * Fila 1: cabecera columnas
 * Filas de datos: col[0]=vacío, col[1]=cuenta, col[3]=fecha, col[5]=ingreso, col[6]=gasto, col[13]=concepto
 */
function parsearCaixabank(sheet: XLSX.WorkSheet): Movimiento[] {
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  const movimientos: Movimiento[] = []

  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 7) continue

    // La cuenta está en col 1 (col 0 vacía)
    const cuenta = String(row[1] ?? '').trim()
    if (!cuenta || cuenta.startsWith('N') || !cuenta.includes(' ')) continue

    const fecha = parsearFechaStr(row[3])
    if (!fecha) continue

    const ingreso = parsearImporte(row[5])
    const gasto = parsearImporte(row[6])
    if (!ingreso && !gasto) continue

    // Concepto: col 13 tiene descripción del comercio, col 9 concepto común
    const concepto13 = String(row[13] ?? '').replace(/\s+/g, ' ').trim()
    const concepto9 = String(row[9] ?? '').replace(/\s+/g, ' ').trim()
    // La col 13 de CaixaBank tiene formato "Fecha de operación: XX-XX-XXXX  NOMBRE COMERCIO"
    // Extraemos solo el nombre del comercio
    const concepto13clean = concepto13.replace(/Fecha de operaci[oó]n:\s*\d{2}-\d{2}-\d{4}\s*/i, '').trim()
    const concepto = concepto13clean || concepto9 || 'Sin concepto'

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
 * Openbank HTML-XLS:
 * Cabecera en fila 10: Fecha Operación, Fecha Valor, Concepto, Importe, Saldo
 * Columnas (con celdas vacías intercaladas): 1=fecha, 5=concepto, 7=importe
 */
function parsearOpenbank(html: string): Movimiento[] {
  const movimientos: Movimiento[] = []
  // Extraer filas de la tabla
  const rowMatches = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) ?? []

  for (const rowHtml of rowMatches) {
    const cells = (rowHtml.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) ?? [])
      .map(td => td.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim())

    if (cells.length < 8) continue

    const fecha = parsearFechaStr(cells[1])
    if (!fecha) continue

    const concepto = cells[5]
    if (!concepto || concepto === 'Concepto') continue

    const importeRaw = cells[7]
    if (!importeRaw || importeRaw === 'Importe') continue

    const importe = parsearImporte(importeRaw)
    if (importe === 0) continue

    movimientos.push({
      fecha,
      concepto,
      importe,
      tipo: importe >= 0 ? 'ingreso' : 'gasto',
    })
  }

  return movimientos
}

export async function getMovimientosDrive(): Promise<{
  movimientos: Movimiento[]
  archivos: string[]
  error?: string
}> {
  try {
    const auth = await getGoogleTokens()
    if (!auth) return { movimientos: [], archivos: [], error: 'No autenticado con Google' }

    const drive = google.drive({ version: 'v3', auth })
    const carpetaId = await obtenerIdCarpeta(drive, CARPETA_EXTRACTOS)
    if (!carpetaId) {
      return {
        movimientos: [], archivos: [],
        error: `Carpeta "${CARPETA_EXTRACTOS}" no encontrada en Drive.`,
      }
    }

    const listaRes = await drive.files.list({
      q: `'${carpetaId}' in parents and trashed=false and (name contains '.xls' or name contains '.XLS' or name contains '.xlsx')`,
      fields: 'files(id, name)',
      orderBy: 'name',
      spaces: 'drive',
    })

    const archivos = listaRes.data.files ?? []
    if (archivos.length === 0) {
      return {
        movimientos: [], archivos: [],
        error: `No hay archivos XLS en "${CARPETA_EXTRACTOS}".`,
      }
    }

    const nombresArchivos: string[] = []
    const todosMovimientos: Movimiento[] = []

    for (const archivo of archivos) {
      if (!archivo.id) continue
      nombresArchivos.push(archivo.name ?? archivo.id)

      const res = await drive.files.get(
        { fileId: archivo.id, alt: 'media' },
        { responseType: 'arraybuffer' }
      )

      const buffer = Buffer.from(res.data as ArrayBuffer)

      // Detectar si es HTML disfrazado de XLS (Openbank)
      const inicio = buffer.slice(0, 20).toString('utf8').toLowerCase()
      if (inicio.includes('<!doctype') || inicio.includes('<html')) {
        const html = buffer.toString('latin1')
        const movs = parsearOpenbank(html)
        todosMovimientos.push(...movs)
      } else {
        // OLE2 real (CaixaBank)
        const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false })
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName]
          const movs = parsearCaixabank(sheet)
          todosMovimientos.push(...movs)
        }
      }
    }

    todosMovimientos.sort((a, b) => b.fecha.localeCompare(a.fecha))
    return { movimientos: todosMovimientos, archivos: nombresArchivos }

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido'
    return { movimientos: [], archivos: [], error: msg }
  }
}
