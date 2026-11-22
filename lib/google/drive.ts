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

function parsearFecha(val: unknown): string | null {
  if (!val) return null

  if (typeof val === 'number') {
    const date = XLSX.SSF.parse_date_code(val)
    if (!date) return null
    const m = String(date.m).padStart(2, '0')
    const d = String(date.d).padStart(2, '0')
    return `${date.y}-${m}-${d}`
  }

  if (typeof val === 'string') {
    // dd/mm/yyyy o dd-mm-yyyy
    const match = val.trim().match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})/)
    if (match) return `${match[3]}-${match[2]}-${match[1]}`
  }

  return null
}

function parsearImporte(val: unknown): number {
  if (typeof val === 'number') return val
  if (typeof val === 'string') {
    // quitar puntos de miles y cambiar coma decimal
    const limpio = val.trim().replace(/\./g, '').replace(',', '.')
    return parseFloat(limpio) || 0
  }
  return 0
}

/**
 * Parsea extracto formato HTML-XLS (Openbank, algunos bancos españoles).
 * Columnas: Fecha Operación | Fecha Valor | Concepto | Importe | Saldo
 * SheetJS lee el HTML como tabla, con celdas vacías intercaladas (separadores).
 */
function parsearFormatoHTML(rows: unknown[][]): Movimiento[] {
  const movimientos: Movimiento[] = []

  for (const row of rows) {
    if (!Array.isArray(row)) continue
    // Buscar una celda con fecha en cualquier posición
    // La fila tiene separadores vacíos: [sep, fecha, sep, fechaValor, sep, concepto, sep, importe, sep, saldo]
    // O en formato compacto sin separadores

    // Buscar índice de la primera fecha
    let fechaIdx = -1
    for (let i = 0; i < row.length; i++) {
      if (parsearFecha(row[i]) !== null) {
        fechaIdx = i
        break
      }
    }
    if (fechaIdx === -1) continue

    const fecha = parsearFecha(row[fechaIdx])
    if (!fecha) continue

    // Buscar concepto e importe después de la fecha
    // Probamos con y sin separadores intercalados
    let concepto = ''
    let importe = 0
    let encontrado = false

    // Patrón con separadores: fecha, sep, fechaValor, sep, concepto, sep, importe
    // fechaIdx+2 = fechaValor, fechaIdx+4 = concepto, fechaIdx+6 = importe
    if (fechaIdx + 6 < row.length) {
      const c = String(row[fechaIdx + 4] ?? '').trim()
      const imp = parsearImporte(row[fechaIdx + 6])
      if (c && imp !== 0) {
        concepto = c
        importe = imp
        encontrado = true
      }
    }

    // Patrón sin separadores: fecha, fechaValor, concepto, importe
    if (!encontrado && fechaIdx + 3 < row.length) {
      const c = String(row[fechaIdx + 2] ?? '').trim()
      const imp = parsearImporte(row[fechaIdx + 3])
      if (c && imp !== 0) {
        concepto = c
        importe = imp
        encontrado = true
      }
    }

    if (!encontrado || !concepto) continue

    movimientos.push({
      fecha,
      concepto: concepto.replace(/\s+/g, ' ').trim(),
      importe,
      tipo: importe >= 0 ? 'ingreso' : 'gasto',
    })
  }

  return movimientos
}

/**
 * Parsea extracto formato BIFF real (CaixaBank TT*.XLS).
 * Columnas fijas (índice base 0):
 *   0: Número de cuenta  3: F.Operación  5: Ingreso  6: Gasto
 *   9: Concepto común   13: Concepto complementario 1
 */
function parsearFormatoBIFF(rows: unknown[][]): Movimiento[] {
  const movimientos: Movimiento[] = []

  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 7) continue

    // Detectar fila de datos: columna 3 debe tener fecha
    const fecha = parsearFecha(row[3])
    if (!fecha) continue

    // Saltar si columna 0 es cabecera o no parece cuenta
    const col0 = String(row[0] ?? '').trim()
    if (col0.startsWith('N') && col0.length < 5) continue  // "Nº" cabecera
    if (col0.startsWith('MOVIMIENTOS')) continue

    const ingresoRaw = row[5]
    const gastoRaw = row[6]
    const concepto13 = String(row[13] ?? '').replace(/\s+/g, ' ').trim()
    const concepto9 = String(row[9] ?? '').replace(/\s+/g, ' ').trim()
    const concepto = concepto13 || concepto9 || 'Sin concepto'

    const ingreso = parsearImporte(ingresoRaw)
    const gasto = parsearImporte(gastoRaw)

    if (!ingreso && !gasto) continue

    const importe = ingreso > 0 ? ingreso : -Math.abs(gasto)

    movimientos.push({
      fecha,
      concepto,
      importe,
      tipo: importe >= 0 ? 'ingreso' : 'gasto',
    })
  }

  return movimientos
}

function parsearHoja(sheet: XLSX.WorkSheet): Movimiento[] {
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  if (rows.length === 0) return []

  // Detectar formato: BIFF tiene columna 0 con número de cuenta (largo)
  // HTML tiene columnas con separadores y la fecha en columna 1 o similar
  // Heurística: si la primera fila con fecha tiene fecha en col 3, es BIFF
  for (const row of rows) {
    if (!Array.isArray(row)) continue
    if (parsearFecha(row[3]) !== null) {
      return parsearFormatoBIFF(rows)
    }
    // Si tiene fecha en col 1 o más adelante con separadores, es HTML
    for (let i = 0; i < Math.min(row.length, 10); i++) {
      if (parsearFecha(row[i]) !== null) {
        return parsearFormatoHTML(rows)
      }
    }
  }

  return []
}

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

      const res = await drive.files.get(
        { fileId: archivo.id, alt: 'media' },
        { responseType: 'arraybuffer' }
      )

      const buffer = Buffer.from(res.data as ArrayBuffer)

      // Detectar si es HTML disfrazado de XLS
      const inicio = buffer.slice(0, 20).toString('utf8').trimStart()
      let movs: Movimiento[] = []

      if (inicio.startsWith('<') || inicio.startsWith('<!')) {
        // Es HTML: parsear como tabla HTML
        const html = buffer.toString('latin1')
        const workbook = XLSX.read(html, { type: 'string' })
        for (const sheetName of workbook.SheetNames) {
          movs.push(...parsearHoja(workbook.Sheets[sheetName]))
        }
      } else {
        // Es binario real
        const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false })
        for (const sheetName of workbook.SheetNames) {
          movs.push(...parsearHoja(workbook.Sheets[sheetName]))
        }
      }

      todosMovimientos.push(...movs)
    }

    todosMovimientos.sort((a, b) => b.fecha.localeCompare(a.fecha))

    return { movimientos: todosMovimientos, archivos: nombresArchivos }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido'
    return { movimientos: [], archivos: [], error: msg }
  }
}
