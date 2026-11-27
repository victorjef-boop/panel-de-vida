import { google } from 'googleapis'
import { getGoogleTokens } from './auth'

const CARPETA_FACTURAS_LUZ = 'Panel de Vida/facturas-luz'

export type FacturaLuz = {
  archivo: string
  periodo_desde: string   // YYYY-MM-DD
  periodo_hasta: string   // YYYY-MM-DD
  kwh_total: number
  importe_total: number   // €
  precio_kwh: number      // €/kWh medio
  potencia_contratada?: number  // kW
  importe_potencia?: number     // €
  importe_energia?: number      // €
  numero_factura?: string
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

function parsearFechaIberdrola(s: string): string | null {
  // Formatos: "01/10/2024", "1 oct. 2024", "01-10-2024"
  s = s.trim()
  const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/)
  if (m1) return `${m1[3]}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}`

  const MESES: Record<string, string> = {
    ene: '01', feb: '02', mar: '03', abr: '04', may: '05', jun: '06',
    jul: '07', ago: '08', sep: '09', oct: '10', nov: '11', dic: '12',
    enero: '01', febrero: '02', marzo: '03', abril: '04', mayo: '05',
    junio: '06', julio: '07', agosto: '08', septiembre: '09', octubre: '10',
    noviembre: '11', diciembre: '12',
  }
  const m2 = s.match(/^(\d{1,2})\s+([a-záéíóú\.]+)\s+(\d{4})/i)
  if (m2) {
    const mes = MESES[m2[2].replace('.','').toLowerCase()]
    if (mes) return `${m2[3]}-${mes}-${m2[1].padStart(2,'0')}`
  }
  return null
}

function extraerNumero(texto: string, patron: RegExp): number | null {
  const m = texto.match(patron)
  if (!m) return null
  const s = m[1].replace(/\./g,'').replace(',','.')
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

/**
 * Parser para facturas Iberdrola en PDF (texto extraído).
 * Iberdrola estructura la factura con secciones reconocibles.
 */
function parsearIberdrola(texto: string): Omit<FacturaLuz, 'archivo'> | null {
  // Período de facturación
  // "Período de facturación: 01/10/2024 al 31/10/2024"
  // "Del 01/10/2024 al 31/10/2024"
  let periodoDesde: string | null = null
  let periodoHasta: string | null = null

  const mPeriodo = texto.match(/(?:per[ií]odo[^:]*:|del)\s+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})\s+al?\s+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i)
  if (mPeriodo) {
    periodoDesde = parsearFechaIberdrola(mPeriodo[1])
    periodoHasta = parsearFechaIberdrola(mPeriodo[2])
  }

  if (!periodoDesde || !periodoHasta) return null

  // kWh consumidos — "Consumo: 320 kWh" / "320,00 kWh"
  const kwh = extraerNumero(texto, /consumo[^:]*:\s*([\d\.,]+)\s*kwh/i)
    ?? extraerNumero(texto, /([\d\.,]+)\s*kwh\s+consumid/i)
    ?? extraerNumero(texto, /energ[ií]a activa[^:]*:\s*([\d\.,]+)\s*kwh/i)
    ?? extraerNumero(texto, /([\d\.,]+)\s*kwh/i)

  if (!kwh) return null

  // Importe total — "Total a pagar: 85,43 €" / "TOTAL FACTURA  85,43"
  const importe = extraerNumero(texto, /total\s+(?:a\s+pagar|factura)[^€\d]*([\d\.,]+)\s*€?/i)
    ?? extraerNumero(texto, /importe\s+total[^€\d]*([\d\.,]+)\s*€?/i)
    ?? extraerNumero(texto, /total[^€\d\n]{0,20}([\d\.,]+)\s*€/i)

  if (!importe) return null

  // Precio €/kWh — "0,15234 €/kWh" / "Precio energía: 0,152 €/kWh"
  const precioKwh = extraerNumero(texto, /([\d\.,]+)\s*€\s*\/\s*kwh/i)
    ?? (kwh > 0 ? Math.round((importe / kwh) * 100000) / 100000 : null)

  // Potencia contratada
  const potencia = extraerNumero(texto, /potencia[^:]*:\s*([\d\.,]+)\s*kw/i)

  // Importe potencia / energía
  const importePotencia = extraerNumero(texto, /(?:término|cargo)\s+de\s+potencia[^€\d]*([\d\.,]+)\s*€?/i)
  const importeEnergia = extraerNumero(texto, /(?:término|cargo)\s+de\s+energ[ií]a[^€\d]*([\d\.,]+)\s*€?/i)

  // Número de factura
  const mFactura = texto.match(/(?:n[uú]mero?\s+(?:de\s+)?factura|factura\s+n[uú]m\.?)[:\s]+([A-Z0-9\-\/]+)/i)
  const numeroFactura = mFactura?.[1]?.trim()

  return {
    periodo_desde: periodoDesde,
    periodo_hasta: periodoHasta,
    kwh_total: kwh,
    importe_total: importe,
    precio_kwh: precioKwh ?? (kwh > 0 ? importe / kwh : 0),
    potencia_contratada: potencia ?? undefined,
    importe_potencia: importePotencia ?? undefined,
    importe_energia: importeEnergia ?? undefined,
    numero_factura: numeroFactura,
  }
}

export async function getFacturasLuz(): Promise<{
  facturas: FacturaLuz[]
  archivos: string[]
  error?: string
}> {
  try {
    const auth = await getGoogleTokens()
    if (!auth) return { facturas: [], archivos: [], error: 'No autenticado con Google' }

    const drive = google.drive({ version: 'v3', auth })
    const carpetaId = await obtenerIdCarpeta(drive, CARPETA_FACTURAS_LUZ)
    if (!carpetaId) {
      return {
        facturas: [], archivos: [],
        error: `Carpeta "${CARPETA_FACTURAS_LUZ}" no encontrada. Créala en Drive y sube tus facturas PDF.`,
      }
    }

    const listaRes = await drive.files.list({
      q: `'${carpetaId}' in parents and trashed=false and (name contains '.pdf' or name contains '.PDF')`,
      fields: 'files(id, name)',
      orderBy: 'name',
      spaces: 'drive',
    })

    const archivos = listaRes.data.files ?? []
    if (archivos.length === 0) {
      return {
        facturas: [], archivos: [],
        error: `No hay facturas PDF en "${CARPETA_FACTURAS_LUZ}".`,
      }
    }

    const nombresArchivos: string[] = []
    const facturas: FacturaLuz[] = []

    for (const archivo of archivos) {
      if (!archivo.id) continue
      nombresArchivos.push(archivo.name ?? archivo.id)

      // Descargar PDF como texto usando exportLinks o extrayendo texto
      // Google Drive puede exportar PDFs como texto plano
      let texto = ''
      try {
        // Intentar exportar como texto plano (funciona con PDFs que tienen texto seleccionable)
        const exportRes = await drive.files.export(
          { fileId: archivo.id, mimeType: 'text/plain' },
          { responseType: 'text' }
        ).catch(() => null)

        if (exportRes?.data) {
          texto = exportRes.data as string
        } else {
          // Si no se puede exportar (PDF nativo, no Google Doc), descargamos y anotamos
          // Por ahora marcamos como no parseable
          facturas.push({
            archivo: archivo.name ?? archivo.id,
            periodo_desde: '',
            periodo_hasta: '',
            kwh_total: 0,
            importe_total: 0,
            precio_kwh: 0,
            numero_factura: 'PDF no legible — sube el texto copiado',
          })
          continue
        }
      } catch {
        continue
      }

      const datos = parsearIberdrola(texto)
      if (datos) {
        facturas.push({ archivo: archivo.name ?? archivo.id, ...datos })
      }
    }

    facturas.sort((a, b) => b.periodo_desde.localeCompare(a.periodo_desde))
    return { facturas, archivos: nombresArchivos }

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido'
    return { facturas: [], archivos: [], error: msg }
  }
}
