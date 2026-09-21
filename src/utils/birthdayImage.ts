type Rgb = { r: number; g: number; b: number }

let birthdayCutoutPromise: Promise<HTMLCanvasElement | null> | null = null

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value))
const smoothstep = (value: number) => {
  const t = clamp(value)
  return t * t * (3 - 2 * t)
}

function estimateBackground(pixels: Uint8ClampedArray, width: number, height: number): Rgb {
  let red = 0
  let green = 0
  let blue = 0
  let count = 0
  const sample = (x: number, y: number) => {
    const index = (y * width + x) * 4
    const r = pixels[index]
    const g = pixels[index + 1]
    const b = pixels[index + 2]
    const chroma = Math.max(r, g, b) - Math.min(r, g, b)
    if (chroma < 58) {
      red += r
      green += g
      blue += b
      count += 1
    }
  }
  const edge = Math.min(24, Math.floor(Math.min(width, height) * 0.08))
  for (let y = 0; y < edge; y += 1) {
    for (let x = 0; x < width; x += 1) sample(x, y)
  }
  for (let y = Math.max(edge, height - edge); y < height; y += 1) {
    for (let x = 0; x < width; x += 1) sample(x, y)
  }
  for (let y = edge; y < height - edge; y += 1) {
    sample(0, y)
    sample(width - 1, y)
  }
  if (!count) return { r: 96, g: 89, b: 89 }
  return { r: red / count, g: green / count, b: blue / count }
}

export function prepareBirthdayCutout(image: HTMLImageElement, scale = 2) {
  const source = document.createElement('canvas')
  source.width = Math.max(1, Math.round(image.naturalWidth * scale))
  source.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const sourceContext = source.getContext('2d')
  if (!sourceContext) return null
  sourceContext.imageSmoothingEnabled = true
  sourceContext.imageSmoothingQuality = 'high'
  sourceContext.drawImage(image, 0, 0, source.width, source.height)

  const imageData = sourceContext.getImageData(0, 0, source.width, source.height)
  const pixels = imageData.data
  const background = estimateBackground(pixels, source.width, source.height)
  let minX = source.width
  let minY = source.height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const index = (y * source.width + x) * 4
      const red = pixels[index]
      const green = pixels[index + 1]
      const blue = pixels[index + 2]
      const brightest = Math.max(red, green, blue)
      const darkest = Math.min(red, green, blue)
      const chroma = brightest - darkest
      const backgroundDistance = Math.hypot(red - background.r, green - background.g, blue - background.b)
      const pinkness = Math.max(0, red - green) + Math.max(0, blue - green) * 0.34
      const backgroundLike = brightest < 190 && chroma < 48 && pinkness < 25
      let alpha = 0

      if (!backgroundLike) {
        const separation = smoothstep((backgroundDistance - 8) / 34)
        const pinkSignal = smoothstep((pinkness - 8) / 27)
        alpha = Math.max(separation, pinkSignal)
        if (brightest > 185 && chroma < 82 && backgroundDistance > 20) {
          alpha = Math.max(alpha, smoothstep((brightest - 165) / 58))
        }
        // Keep the darker pink contour/shading from the reference, but reject its gray matte.
        if (pinkness > 30) alpha = Math.max(alpha, 0.88)
        if (alpha < 0.24 || (alpha < 0.5 && brightest < 150)) alpha = 0
      }

      pixels[index + 3] = Math.round(clamp(alpha) * 255)
    }
  }

  // Remove only low-alpha dark pixels that sit directly on the transparent outside.
  for (let y = 1; y < source.height - 1; y += 1) {
    for (let x = 1; x < source.width - 1; x += 1) {
      const index = (y * source.width + x) * 4
      const alpha = pixels[index + 3]
      const brightest = Math.max(pixels[index], pixels[index + 1], pixels[index + 2])
      if (alpha === 0 || brightest >= 190) continue
      let transparentNeighbors = 0
      for (let offsetY = -2; offsetY <= 2; offsetY += 1) {
        for (let offsetX = -2; offsetX <= 2; offsetX += 1) {
          if (offsetX === 0 && offsetY === 0) continue
          const neighborX = x + offsetX
          const neighborY = y + offsetY
          if (neighborX < 0 || neighborX >= source.width || neighborY < 0 || neighborY >= source.height) continue
          const neighborIndex = (neighborY * source.width + neighborX) * 4
          if (pixels[neighborIndex + 3] < 16) transparentNeighbors += 1
        }
      }
      if (transparentNeighbors >= 1) pixels[index + 3] = 0
    }
  }

  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      if (pixels[(y * source.width + x) * 4 + 3] > 8) {
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
    }
  }
  if (maxX < minX || maxY < minY) return null

  sourceContext.putImageData(imageData, 0, 0)
  const cropped = document.createElement('canvas')
  cropped.width = maxX - minX + 1
  cropped.height = maxY - minY + 1
  const croppedContext = cropped.getContext('2d')
  if (!croppedContext) return null
  croppedContext.imageSmoothingEnabled = true
  croppedContext.imageSmoothingQuality = 'high'
  croppedContext.drawImage(source, minX, minY, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height)
  return cropped
}

export function loadBirthdayCutout(scale = 2) {
  if (!birthdayCutoutPromise) {
    birthdayCutoutPromise = new Promise((resolve) => {
      const image = new Image()
      image.onload = () => resolve(prepareBirthdayCutout(image, scale))
      image.onerror = () => resolve(null)
      image.src = '/assets/happy-birthday-source.png'
    })
  }
  return birthdayCutoutPromise
}
