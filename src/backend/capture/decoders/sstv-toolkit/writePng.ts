import { writeFile } from 'node:fs/promises'
import { deflateSync } from 'node:zlib'

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

function crc32(buf: Buffer): number {
  const table = crc32Table()
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc = (table[((crc ^ (buf[i] ?? 0)) & 0xff) >>> 0] ?? 0) ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

let _crcTable: Uint32Array | null = null
function crc32Table(): Uint32Array {
  if (_crcTable) return _crcTable
  _crcTable = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    _crcTable[i] = c
  }
  return _crcTable
}

function chunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, 'ascii')
  const len = Buffer.allocUnsafe(4)
  len.writeUInt32BE(data.length, 0)
  const crcBuf = Buffer.concat([typeBytes, data])
  const crcValue = Buffer.allocUnsafe(4)
  crcValue.writeUInt32BE(crc32(crcBuf), 0)
  return Buffer.concat([len, typeBytes, data, crcValue])
}

/**
 * Write RGBA pixel data as a PNG file.
 * Pure Node.js implementation using built-in zlib — no native modules required.
 */
export async function writePng(
  outputPath: string,
  pixels: Uint8ClampedArray,
  width: number,
  height: number
): Promise<void> {
  // IHDR chunk: width, height, bit depth 8, colour type 2 (RGB), compression 0, filter 0, interlace 0
  const ihdrData = Buffer.allocUnsafe(13)
  ihdrData.writeUInt32BE(width, 0)
  ihdrData.writeUInt32BE(height, 4)
  ihdrData[8] = 8 // bit depth
  ihdrData[9] = 2 // colour type: RGB (strip alpha)
  ihdrData[10] = 0 // compression method
  ihdrData[11] = 0 // filter method
  ihdrData[12] = 0 // interlace method

  // Build raw scanline data: filter byte 0x00 + RGB per row (strip alpha channel)
  const rawSize = height * (1 + width * 3)
  const raw = Buffer.allocUnsafe(rawSize)
  let rawPos = 0
  for (let y = 0; y < height; y++) {
    raw[rawPos++] = 0 // filter type: None
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4
      raw[rawPos++] = pixels[src] ?? 0
      raw[rawPos++] = pixels[src + 1] ?? 0
      raw[rawPos++] = pixels[src + 2] ?? 0
    }
  }

  const compressed = deflateSync(raw, { level: 6 })

  const png = Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdrData),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ])

  await writeFile(outputPath, png)
}
