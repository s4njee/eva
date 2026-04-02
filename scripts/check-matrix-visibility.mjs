import { spawn } from 'node:child_process'
import { inflateSync } from 'node:zlib'
import { once } from 'node:events'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import { chromium } from 'playwright'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '..')
const matrixRoot = resolve(repoRoot, 'visualizations/matrix')
const screenshotPath = resolve(repoRoot, '.tmp/matrix-visibility-check.png')
const port = Number(process.env.MATRIX_VISIBILITY_PORT ?? '4173')
const url = process.env.MATRIX_VISIBILITY_URL ?? `http://127.0.0.1:${port}/`
const headless = process.env.MATRIX_VISIBILITY_HEADLESS === '1'

function wait(ms) {
  return new Promise(resolvePromise => setTimeout(resolvePromise, ms))
}

async function waitForUrl(targetUrl, timeoutMs = 20_000) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(targetUrl, { method: 'GET' })
      if (response.ok) return
    } catch {
      // Keep polling until the dev server comes up.
    }

    await wait(250)
  }

  throw new Error(`Timed out waiting for ${targetUrl}`)
}

function parsePng(buffer) {
  const signature = '89504e470d0a1a0a'
  if (buffer.subarray(0, 8).toString('hex') !== signature) {
    throw new Error('Unsupported PNG signature')
  }

  let offset = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  let interlaceMethod = 0
  const idatParts = []

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    offset += 4
    const type = buffer.subarray(offset, offset + 4).toString('ascii')
    offset += 4
    const data = buffer.subarray(offset, offset + length)
    offset += length
    offset += 4

    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
      interlaceMethod = data[12]
    } else if (type === 'IDAT') {
      idatParts.push(data)
    } else if (type === 'IEND') {
      break
    }
  }

  if (bitDepth !== 8) {
    throw new Error(`Unsupported PNG bit depth: ${bitDepth}`)
  }

  if (interlaceMethod !== 0) {
    throw new Error('Interlaced PNGs are not supported')
  }

  const channelsByColorType = {
    2: 3,
    6: 4,
  }
  const channels = channelsByColorType[colorType]

  if (!channels) {
    throw new Error(`Unsupported PNG color type: ${colorType}`)
  }

  const bytesPerPixel = channels
  const stride = width * bytesPerPixel
  const inflated = inflateSync(Buffer.concat(idatParts))
  const pixels = Buffer.alloc(width * height * bytesPerPixel)

  let readOffset = 0
  let writeOffset = 0

  for (let row = 0; row < height; row += 1) {
    const filterType = inflated[readOffset]
    readOffset += 1

    for (let column = 0; column < stride; column += 1) {
      const raw = inflated[readOffset]
      readOffset += 1

      const left = column >= bytesPerPixel ? pixels[writeOffset - bytesPerPixel] : 0
      const up = row > 0 ? pixels[writeOffset - stride] : 0
      const upLeft = row > 0 && column >= bytesPerPixel
        ? pixels[writeOffset - stride - bytesPerPixel]
        : 0

      let value = 0

      if (filterType === 0) value = raw
      else if (filterType === 1) value = (raw + left) & 0xff
      else if (filterType === 2) value = (raw + up) & 0xff
      else if (filterType === 3) value = (raw + Math.floor((left + up) / 2)) & 0xff
      else if (filterType === 4) {
        const predictor = paethPredictor(left, up, upLeft)
        value = (raw + predictor) & 0xff
      } else {
        throw new Error(`Unsupported PNG filter type: ${filterType}`)
      }

      pixels[writeOffset] = value
      writeOffset += 1
    }
  }

  return {
    width,
    height,
    channels,
    pixels,
  }
}

function paethPredictor(left, up, upLeft) {
  const p = left + up - upLeft
  const pLeft = Math.abs(p - left)
  const pUp = Math.abs(p - up)
  const pUpLeft = Math.abs(p - upLeft)

  if (pLeft <= pUp && pLeft <= pUpLeft) return left
  if (pUp <= pUpLeft) return up
  return upLeft
}

function measureGreenDominance(png) {
  let greenPixels = 0
  let brightPixels = 0

  for (let i = 0; i < png.pixels.length; i += png.channels) {
    const r = png.pixels[i]
    const g = png.pixels[i + 1]
    const b = png.pixels[i + 2]

    if (r + g + b > 36) brightPixels += 1
    if (g > 70 && g > r * 1.45 && g > b * 1.45) greenPixels += 1
  }

  return {
    greenPixels,
    brightPixels,
  }
}

async function captureVisibilityMetrics(targetUrl) {
  await mkdir(dirname(screenshotPath), { recursive: true })

  const browser = await chromium.launch({
    headless,
    args: headless
      ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']
      : [],
  })

  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    })

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(4_000)
    await page.screenshot({ path: screenshotPath })

    const png = parsePng(await readFile(screenshotPath))
    const metrics = measureGreenDominance(png)

    return {
      ...metrics,
      screenshotPath,
      width: png.width,
      height: png.height,
    }
  } finally {
    await browser.close()
  }
}

async function main() {
  let serverProcess

  try {
    if (!process.env.MATRIX_VISIBILITY_URL) {
      serverProcess = spawn(
        'npm',
        ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port)],
        {
          cwd: matrixRoot,
          stdio: 'ignore',
        },
      )

      await waitForUrl(url)
    }

    const result = await captureVisibilityMetrics(url)
    const greenThreshold = 1_500
    const brightThreshold = 4_000
    const visible = result.greenPixels >= greenThreshold && result.brightPixels >= brightThreshold

    if (!visible) {
      throw new Error(
        `Matrix visibility check failed at ${url}. ` +
        `greenPixels=${result.greenPixels}, brightPixels=${result.brightPixels}, ` +
        `screenshot=${result.screenshotPath}`,
      )
    }

    console.log(
      `Matrix visibility confirmed at ${url} ` +
      `(greenPixels=${result.greenPixels}, brightPixels=${result.brightPixels}).`,
    )
    console.log(`Screenshot saved to ${result.screenshotPath}`)
  } finally {
    if (serverProcess) {
      serverProcess.kill('SIGTERM')
      await Promise.race([
        once(serverProcess, 'exit'),
        wait(2_000),
      ])
    }

    if (process.env.MATRIX_VISIBILITY_KEEP_SCREENSHOT !== '1') {
      await rm(screenshotPath, { force: true })
    }
  }
}

main().catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
