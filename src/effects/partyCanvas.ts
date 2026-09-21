import type { CakeGesture, Point } from '../types'

type CakeFrame = {
  indexTip: Point
  thumbTip: Point
  born: number
  progress: number
}

type CandleParticle = {
  phase: number
  speed: number
  lift: number
  size: number
  drift: number
}

type CandleFlameFrame = {
  born: number
  seed: number
  particles: CandleParticle[]
}

type BalloonBurstParticle = {
  angle: number
  speed: number
  size: number
  rotation: number
  rotationSpeed: number
  gravity: number
  curve: number
  fragmentWidth: number
  fragmentHeight: number
  tone: 'base' | 'shade' | 'highlight'
}

type CakeLayout = {
  centerX: number
  centerY: number
  width: number
  height: number
  radius: number
  reveal: number
}

type BalloonFrame = {
  point: Point
  size: number
  rotation: number
  floatSeed: number
  floatSpeed: number
  floatAmplitudeX: number
  floatAmplitudeY: number
  born: number
  progress: number
  base: string
  shade: string
  highlight: string
  burstAt: number | null
  burstParticles: BalloonBurstParticle[]
  burstOrigin: Point | null
}

const easeOut = (value: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, value)), 3)
const balloonBurstSpreadDuration = 500
const balloonBurstFallDuration = 1500
const balloonBurstFadeDuration = 600
const balloonBurstDuration = balloonBurstSpreadDuration + balloonBurstFallDuration + balloonBurstFadeDuration
const birthdayMessageDelayAfterFadeStart = 100

const balloonStyles = [
  { base: '#f4d9dc', shade: '#c9919c', highlight: '#fffaf7' },
  { base: '#f7e8df', shade: '#d5b0a3', highlight: '#fffdf9' },
  { base: '#e8e3df', shade: '#aaa6a4', highlight: '#ffffff' },
] as const

export type PartyDebugSnapshot = {
  cakeCount: number
  balloonCount: number
}

export class PartyCanvas {
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private width = 1
  private height = 1
  private dpr = 1
  private cakes: CakeFrame[] = []
  private candleFlames: CandleFlameFrame[] = []
  private balloons: BalloonFrame[] = []
  private cakeImage: HTMLImageElement | null = null
  private cakeImageReady = false
  private candleFlamesVisible = true
  private birthdayMessageAt: number | null = null
  private birthdayMessageStarted = false
  private birthdayMessageHandler: ((visible: boolean) => void) | null = null

  constructor() {
    const image = new Image()
    image.onload = () => { this.cakeImageReady = true }
    image.src = '/assets/pink-ribbon-cake-cutout.png'
    this.cakeImage = image

  }

  setBirthdayMessageHandler(handler: ((visible: boolean) => void) | null) {
    this.birthdayMessageHandler = handler
  }

  attach(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.resize()
    window.addEventListener('resize', this.resize)
  }

  render(now: number) {
    if (!this.ctx) return
    this.resizeIfNeeded()
    const ctx = this.ctx
    ctx.clearRect(0, 0, this.width, this.height)
    this.balloons = this.balloons.filter((balloon) => {
      if (balloon.burstAt !== null) {
        const burstElapsed = now - balloon.burstAt
        if (burstElapsed >= balloonBurstDuration) {
          return false
        }
        this.drawBalloonBurst(ctx, balloon, burstElapsed)
        return true
      }
      if (balloon.progress < 1) balloon.progress = Math.min(1, balloon.progress + 0.06)
      this.drawBalloon(ctx, balloon, now)
      return true
    })
    if (this.birthdayMessageAt !== null && !this.birthdayMessageStarted && now >= this.birthdayMessageAt) {
      this.birthdayMessageStarted = true
      this.birthdayMessageHandler?.(true)
    }
    this.cakes.forEach((cake) => {
      if (cake.progress < 1) cake.progress = Math.min(1, cake.progress + 0.045)
      this.drawCake(ctx, cake, now)
    })
    if (this.candleFlamesVisible) {
      this.cakes.forEach((cake, index) => {
        const flame = this.candleFlames[index]
        if (flame) this.drawCandleFlame(ctx, cake, flame, now)
      })
    }
  }

  beginCake(gesture: CakeGesture, now: number) {
    this.cakes.push({
      indexTip: { ...gesture.indexTip },
      thumbTip: { ...gesture.thumbTip },
      born: now,
      progress: 0,
    })
    this.candleFlames.push(this.createCandleFlame(now))
    if (this.cakes.length > 18) {
      this.cakes.shift()
      this.candleFlames.shift()
    }
  }

  beginBalloon(point: Point, now: number) {
    const style = balloonStyles[Math.floor(Math.random() * balloonStyles.length)]
    const baseSize = Math.min(this.width, this.height) * (0.05 + Math.random() * 0.04) * 1.32
    this.balloons.push({
      point: { ...point },
      size: baseSize,
      rotation: (Math.random() - 0.5) * 0.16,
      floatSeed: Math.random() * Math.PI * 2,
      floatSpeed: 0.72 + Math.random() * 0.34,
      floatAmplitudeX: baseSize * (0.06 + Math.random() * 0.08),
      floatAmplitudeY: baseSize * (0.14 + Math.random() * 0.12),
      born: now,
      progress: 0,
      ...style,
      burstAt: null,
      burstParticles: [],
      burstOrigin: null,
    })
    if (this.balloons.length > 48) this.balloons.shift()
  }

  explodeBalloons(now: number) {
    const balloonsToBurst = this.balloons.filter((balloon) => balloon.burstAt === null)
    if (!balloonsToBurst.length) return
    // Start the wordmark 100ms after the balloon fade begins.
    this.birthdayMessageAt = now
      + balloonBurstSpreadDuration
      + balloonBurstFallDuration
      + birthdayMessageDelayAfterFadeStart
    balloonsToBurst.forEach((balloon) => {
      if (balloon.burstAt !== null) return
      balloon.burstAt = now
      balloon.burstParticles = this.createBalloonBurstParticles()
      const position = this.getBalloonPosition(balloon, now)
      balloon.burstOrigin = { x: position.x, y: position.y }
    })
  }

  updateCake(gesture: CakeGesture) {
    const cake = this.cakes[this.cakes.length - 1]
    if (!cake) return
    // A light blend removes camera jitter without making the rectangle lag behind the hand.
    cake.indexTip = this.lerpPoint(cake.indexTip, gesture.indexTip, 0.34)
    cake.thumbTip = this.lerpPoint(cake.thumbTip, gesture.thumbTip, 0.34)
  }

  setCandleFlamesVisible(visible: boolean) {
    this.candleFlamesVisible = visible
  }

  getDebugSnapshot(): PartyDebugSnapshot {
    return { cakeCount: this.cakes.length, balloonCount: this.balloons.length }
  }

  drawDebugLandmarks(landmarks: Point[][], gestures: string[] = []) {
    if (!this.ctx) return
    const ctx = this.ctx
    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [0, 9], [9, 10], [10, 11], [11, 12],
      [0, 13], [13, 14], [14, 15], [15, 16],
      [0, 17], [17, 18], [18, 19], [19, 20],
      [5, 9], [9, 13], [13, 17],
    ]
    ctx.save()
    ctx.lineWidth = 1.3
    ctx.strokeStyle = 'rgba(255,235,204,.82)'
    ctx.fillStyle = 'rgba(255,255,255,.96)'
    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.textBaseline = 'bottom'
    landmarks.forEach((hand, handIndex) => {
      connections.forEach(([from, to]) => {
        const a = hand[from]
        const b = hand[to]
        if (!a || !b) return
        ctx.beginPath()
        ctx.moveTo(a.x * this.width, a.y * this.height)
        ctx.lineTo(b.x * this.width, b.y * this.height)
        ctx.stroke()
      })
      hand.forEach((point) => {
        ctx.beginPath()
        ctx.arc(point.x * this.width, point.y * this.height, 3.5, 0, Math.PI * 2)
        ctx.fill()
      })
      this.drawDebugTip(ctx, hand[4], '#ffd1d8')
      this.drawDebugTip(ctx, hand[8], '#ffe2ae')

      const xs = hand.map((point) => point.x * this.width)
      const ys = hand.map((point) => point.y * this.height)
      if (!xs.length || !ys.length) return
      const left = Math.min(...xs)
      const right = Math.max(...xs)
      const top = Math.min(...ys)
      const bottom = Math.max(...ys)
      ctx.strokeStyle = 'rgba(255,255,255,.62)'
      ctx.strokeRect(left - 8, top - 8, right - left + 16, bottom - top + 16)

      const label = gestures[handIndex] ?? 'None'
      const labelWidth = Math.max(70, ctx.measureText(label).width + 12)
      ctx.fillStyle = 'rgba(35,32,28,.76)'
      ctx.fillRect(left - 6, Math.max(4, top - 25), labelWidth, 18)
      ctx.fillStyle = '#fff4df'
      ctx.fillText(label, left, Math.max(18, top - 11))
      ctx.fillStyle = 'rgba(255,255,255,.96)'
    })
    ctx.restore()
  }

  reset() {
    this.cakes = []
    this.candleFlames = []
    this.balloons = []
    this.birthdayMessageAt = null
    this.birthdayMessageStarted = false
    this.birthdayMessageHandler?.(false)
  }

  private drawBalloon(ctx: CanvasRenderingContext2D, balloon: BalloonFrame, now: number) {
    const reveal = easeOut((now - balloon.born) / 360)
    const scale = reveal * (0.97 + Math.sin(now / 700 + balloon.born) * 0.03)
    const width = balloon.size * 0.72 * scale
    const height = balloon.size * 1.08 * scale
    const position = this.getBalloonPosition(balloon, now)
    const anchorX = position.x
    const anchorY = position.y
    // The stored point is the index fingertip, so the balloon itself is centered
    // on that point. This keeps the visible object aligned with the gesture.
    const centerY = 0

    ctx.save()
    ctx.translate(anchorX, anchorY)
    ctx.rotate(position.rotation)
    ctx.globalAlpha = reveal

    ctx.shadowColor = 'rgba(75,52,48,.18)'
    ctx.shadowBlur = Math.max(7, width * 0.2)
    ctx.shadowOffsetY = Math.max(3, height * 0.06)
    const gradient = ctx.createRadialGradient(-width * 0.24, centerY - height * 0.2, width * 0.04, 0, centerY, height * 0.72)
    gradient.addColorStop(0, balloon.highlight)
    gradient.addColorStop(0.3, balloon.base)
    gradient.addColorStop(1, balloon.shade)
    ctx.fillStyle = gradient
    this.balloonPath(ctx, centerY, width, height)
    ctx.fill()
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
    ctx.shadowOffsetY = 0

    ctx.fillStyle = 'rgba(255,255,255,.48)'
    ctx.beginPath()
    ctx.ellipse(-width * 0.22, centerY - height * 0.2, width * 0.1, height * 0.22, -0.22, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = balloon.shade
    ctx.beginPath()
    ctx.moveTo(-width * 0.065, height * 0.44)
    ctx.lineTo(width * 0.065, height * 0.44)
    ctx.lineTo(0, height * 0.58)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  private drawBalloonBurst(ctx: CanvasRenderingContext2D, balloon: BalloonFrame, elapsed: number) {
    const originX = balloon.burstOrigin?.x ?? balloon.point.x * this.width
    const originY = balloon.burstOrigin?.y ?? balloon.point.y * this.height
    const burstScale = Math.min(this.width, this.height) * 0.065
    const spreadProgress = easeOut(Math.min(1, elapsed / balloonBurstSpreadDuration))
    const fallProgress = Math.max(0, Math.min(1, (elapsed - balloonBurstSpreadDuration) / balloonBurstFallDuration))
    const fadeProgress = Math.max(0, Math.min(1, (elapsed - balloonBurstSpreadDuration - balloonBurstFallDuration) / balloonBurstFadeDuration))
    // Keep the downward motion linear so the fragments fall at a constant speed.
    const drop = fallProgress
    const fade = 1 - easeOut(fadeProgress)

    balloon.burstParticles.forEach((particle) => {
      const distance = burstScale * (0.32 + particle.speed * 1.34) * spreadProgress
      const sideArc = Math.sin(spreadProgress * Math.PI) * burstScale * particle.curve * 0.22
      const fallArc = fallProgress * burstScale * particle.curve * 0.4
      const x = originX
        + Math.cos(particle.angle) * distance
        + Math.cos(particle.angle + Math.PI / 2) * sideArc
        + Math.cos(particle.angle + Math.PI / 2) * fallArc
      const y = originY
        + Math.sin(particle.angle) * distance
        + Math.sin(particle.angle + Math.PI / 2) * sideArc
        + Math.sin(particle.angle + Math.PI / 2) * fallArc
        + this.height * 0.12 * drop * particle.gravity
      // The fragments should read as small pieces of latex, not new balloons.
      // Shrink the current fragment size by 50% while preserving the
      // intentionally wide random size range between fragments.
      const size = Math.max(0.7, burstScale * particle.size * 0.1465 * (1 - fallProgress * 0.22))
      const fragmentWidth = size * particle.fragmentWidth
      const fragmentHeight = size * particle.fragmentHeight
      const particleColor = particle.tone === 'highlight'
        ? balloon.highlight
        : particle.tone === 'shade'
          ? balloon.shade
          : balloon.base

      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(particle.rotation + particle.rotationSpeed * elapsed * 0.001)
      ctx.globalAlpha = fade * 0.94
      // Flat fill plus one highlight stroke is substantially cheaper than
      // allocating a new gradient and shadow for every fragment on every frame.
      ctx.fillStyle = particleColor
      this.balloonFragmentPath(ctx, fragmentWidth, fragmentHeight, particle.curve)
      ctx.fill()

      // Layer lightweight additive highlights to bring back the glossy,
      // dreamy latex feeling without allocating gradients per fragment.
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = fade * 0.98
      ctx.strokeStyle = balloon.highlight
      ctx.lineWidth = Math.max(0.75, size * 0.2)
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(-fragmentWidth * 0.24, -fragmentHeight * 0.22)
      ctx.quadraticCurveTo(fragmentWidth * 0.04, -fragmentHeight * 0.4, fragmentWidth * 0.28, -fragmentHeight * 0.08)
      ctx.stroke()

      ctx.globalAlpha = fade * 0.62
      ctx.fillStyle = balloon.highlight
      ctx.beginPath()
      ctx.ellipse(-fragmentWidth * 0.2, -fragmentHeight * 0.18, fragmentWidth * 0.16, fragmentHeight * 0.24, -0.35, 0, Math.PI * 2)
      ctx.fill()

      ctx.globalAlpha = fade * 0.58
      ctx.lineWidth = Math.max(0.55, size * 0.1)
      ctx.beginPath()
      ctx.moveTo(-fragmentWidth * 0.06, fragmentHeight * 0.18)
      ctx.quadraticCurveTo(fragmentWidth * 0.16, fragmentHeight * 0.06, fragmentWidth * 0.32, fragmentHeight * 0.16)
      ctx.stroke()
      ctx.restore()
    })
  }

  private getBalloonPosition(balloon: BalloonFrame, now: number) {
    const elapsed = Math.max(0, now - balloon.born)
    const time = elapsed * 0.001 * balloon.floatSpeed
    const settle = easeOut(Math.min(1, elapsed / 700))
    const waveX = Math.sin(time + balloon.floatSeed) + Math.sin(time * 0.53 + balloon.floatSeed * 1.7) * 0.32
    const waveY = Math.sin(time * 0.82 + balloon.floatSeed * 1.3) + Math.sin(time * 0.37 + balloon.floatSeed * 0.6) * 0.24
    const sway = Math.sin(time * 0.74 + balloon.floatSeed * 1.9) * 0.035 + Math.sin(time * 0.31 + balloon.floatSeed) * 0.018
    return {
      x: balloon.point.x * this.width + waveX * balloon.floatAmplitudeX * settle,
      y: balloon.point.y * this.height + waveY * balloon.floatAmplitudeY * settle,
      rotation: balloon.rotation + sway * settle,
    }
  }

  private balloonPath(ctx: CanvasRenderingContext2D, centerY: number, width: number, height: number) {
    const top = centerY - height * 0.5
    const bottom = centerY + height * 0.5
    ctx.beginPath()
    ctx.moveTo(0, top)
    ctx.bezierCurveTo(width * 0.58, top, width * 0.62, centerY - height * 0.08, width * 0.42, centerY + height * 0.28)
    ctx.bezierCurveTo(width * 0.25, centerY + height * 0.46, width * 0.12, bottom, 0, bottom)
    ctx.bezierCurveTo(-width * 0.12, bottom, -width * 0.25, centerY + height * 0.46, -width * 0.42, centerY + height * 0.28)
    ctx.bezierCurveTo(-width * 0.62, centerY - height * 0.08, -width * 0.58, top, 0, top)
    ctx.closePath()
  }

  private drawCake(ctx: CanvasRenderingContext2D, cake: CakeFrame, now: number) {
    const layout = this.getCakeLayout(cake, now)
    if (!layout) return

    const { centerX, centerY, width, height, radius, reveal } = layout

    ctx.save()
    ctx.translate(centerX, centerY)
    ctx.globalAlpha = reveal
    ctx.shadowColor = 'rgba(71,43,45,.2)'
    ctx.shadowBlur = Math.max(8, height * 0.16)
    ctx.shadowOffsetY = Math.max(4, height * 0.12)
    if (this.cakeImageReady && this.cakeImage) {
      ctx.save()
      this.roundedRect(ctx, -width / 2, -height / 2, width, height, radius)
      ctx.clip()
      ctx.drawImage(this.cakeImage, -width / 2, -height / 2, width, height)
      ctx.restore()
    } else {
      ctx.fillStyle = '#f1d8d3'
      this.roundedRect(ctx, -width / 2, -height / 2, width, height, radius)
      ctx.fill()
    }
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
    ctx.shadowOffsetY = 0
    ctx.restore()
  }

  private drawCandleFlame(ctx: CanvasRenderingContext2D, cake: CakeFrame, flame: CandleFlameFrame, now: number) {
    const layout = this.getCakeLayout(cake, now)
    if (!layout) return

    const reveal = easeOut((now - flame.born - 120) / 320)
    if (reveal <= 0) return

    // These coordinates follow the candle tip in the transparent cake asset.
    const candleTipX = layout.centerX + layout.width * 0.005
    const candleTipY = layout.centerY - layout.height * 0.425
    const elapsed = Math.max(0, now - flame.born)
    const pulse = 0.94 + Math.sin(elapsed * 0.013 + flame.seed) * 0.06
    const flameHeight = Math.max(14, layout.height * 0.052) * pulse
    const flameWidth = flameHeight * 0.56
    const sway = Math.sin(elapsed * 0.011 + flame.seed) * flameWidth * 0.1

    ctx.save()
    ctx.globalAlpha = reveal

    const glow = ctx.createRadialGradient(candleTipX + sway, candleTipY - flameHeight * 0.42, 0, candleTipX + sway, candleTipY - flameHeight * 0.42, flameHeight * 1.15)
    glow.addColorStop(0, 'rgba(255,211,123,.38)')
    glow.addColorStop(0.42, 'rgba(255,166,74,.16)')
    glow.addColorStop(1, 'rgba(255,145,54,0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(candleTipX + sway, candleTipY - flameHeight * 0.42, flameHeight * 1.15, 0, Math.PI * 2)
    ctx.fill()

    ctx.save()
    ctx.translate(candleTipX + sway, candleTipY)
    flame.particles.forEach((particle) => {
      const cycle = (elapsed * 0.001 * particle.speed + particle.phase) % 1
      const particleAlpha = Math.sin(cycle * Math.PI) * 0.72
      const particleX = Math.sin(elapsed * 0.003 * particle.speed + particle.phase * 7 + flame.seed) * flameWidth * particle.drift
      const particleY = -flameHeight * (0.12 + cycle * (0.92 + particle.lift))
      const particleSize = Math.max(0.8, flameHeight * particle.size * (1 - cycle * 0.38))
      ctx.globalAlpha = reveal * particleAlpha
      ctx.fillStyle = 'rgba(255,194,103,.9)'
      ctx.shadowColor = 'rgba(255,164,54,.8)'
      ctx.shadowBlur = flameHeight * 0.18
      ctx.beginPath()
      ctx.arc(particleX, particleY, particleSize, 0, Math.PI * 2)
      ctx.fill()
    })

    const tipX = Math.sin(elapsed * 0.017 + flame.seed) * flameWidth * 0.18
    ctx.globalAlpha = reveal
    ctx.shadowColor = 'rgba(255,152,50,.62)'
    ctx.shadowBlur = flameHeight * 0.25
    const outerGradient = ctx.createLinearGradient(0, 0, 0, -flameHeight)
    outerGradient.addColorStop(0, '#ff8d32')
    outerGradient.addColorStop(0.52, '#ffc35f')
    outerGradient.addColorStop(1, '#fff2bb')
    ctx.fillStyle = outerGradient
    this.flamePath(ctx, flameWidth, flameHeight, tipX)
    ctx.fill()

    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
    const innerHeight = flameHeight * 0.62
    const innerWidth = flameWidth * 0.58
    const innerGradient = ctx.createLinearGradient(0, 0, 0, -innerHeight)
    innerGradient.addColorStop(0, '#fff1aa')
    innerGradient.addColorStop(0.68, '#fffbe2')
    innerGradient.addColorStop(1, '#ffffff')
    ctx.fillStyle = innerGradient
    this.flamePath(ctx, innerWidth, innerHeight, tipX * 0.42)
    ctx.fill()
    ctx.restore()
    ctx.restore()
  }

  private getCakeLayout(cake: CakeFrame, now: number): CakeLayout | null {
    const dx = (cake.indexTip.x - cake.thumbTip.x) * this.width
    const dy = (cake.indexTip.y - cake.thumbTip.y) * this.height
    const diagonal = Math.hypot(dx, dy)
    if (diagonal < 18) return null

    const centerX = (cake.indexTip.x + cake.thumbTip.x) * 0.5 * this.width
    const centerY = (cake.indexTip.y + cake.thumbTip.y) * 0.5 * this.height
    const aspect = this.cakeImage?.naturalWidth && this.cakeImage.naturalHeight
      ? this.cakeImage.naturalWidth / this.cakeImage.naturalHeight
      : 0.806
    // Keep the fingertip midpoint as the anchor, while giving the placed cake
    // a little more visual presence than the raw hand span.
    const cakeWidth = diagonal * 1.69 / Math.sqrt(1 + 1 / (aspect * aspect))
    const cakeHeight = cakeWidth / aspect
    const reveal = easeOut((now - cake.born) / 460)
    const scale = reveal * (0.985 + Math.sin(now / 900 + cake.born) * 0.015)
    const width = cakeWidth * scale
    const height = cakeHeight * scale
    const radius = Math.min(14, height * 0.16)

    return { centerX, centerY, width, height, radius, reveal }
  }

  private flamePath(ctx: CanvasRenderingContext2D, width: number, height: number, tipX: number) {
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.bezierCurveTo(-width * 0.72, -height * 0.18, -width * 0.5, -height * 0.55, tipX, -height)
    ctx.bezierCurveTo(width * 0.52, -height * 0.64, width * 0.68, -height * 0.24, 0, 0)
    ctx.closePath()
  }

  private createCandleFlame(now: number): CandleFlameFrame {
    return {
      born: now,
      seed: Math.random() * Math.PI * 2,
      particles: Array.from({ length: 10 }, () => ({
        phase: Math.random(),
        speed: 0.7 + Math.random() * 0.65,
        lift: Math.random() * 0.3,
        size: 0.025 + Math.random() * 0.028,
        drift: 0.55 + Math.random() * 0.7,
      })),
    }
  }

  private createBalloonBurstParticles() {
    return Array.from({ length: 16 }, () => ({
      angle: Math.random() * Math.PI * 2,
      speed: 0.58 + Math.random() * 1.1,
      size: Math.random() < 0.25
        ? 0.92 + Math.random() * 0.78
        : 0.14 + Math.random() * 0.48,
      rotation: Math.random() * Math.PI,
      rotationSpeed: (Math.random() - 0.5) * 10,
      gravity: 0.45 + Math.random() * 0.85,
      curve: (Math.random() - 0.5) * 1.8,
      fragmentWidth: 0.68 + Math.random() * 0.98,
      fragmentHeight: 0.58 + Math.random() * 1.08,
      tone: Math.random() > 0.72 ? 'highlight' as const : Math.random() > 0.52 ? 'shade' as const : 'base' as const,
    }))
  }

  private balloonFragmentPath(ctx: CanvasRenderingContext2D, width: number, height: number, curve: number) {
    const halfWidth = width / 2
    const halfHeight = height / 2
    const fold = curve * halfWidth * 0.16
    ctx.beginPath()
    ctx.moveTo(-halfWidth * 0.86, -halfHeight * 0.18)
    ctx.bezierCurveTo(-halfWidth * 0.52, -halfHeight * 0.92, halfWidth * 0.18 + fold, -halfHeight * 0.76, halfWidth * 0.88, -halfHeight * 0.18)
    ctx.bezierCurveTo(halfWidth * 0.56, halfHeight * 0.72, -halfWidth * 0.1 + fold, halfHeight * 0.9, -halfWidth * 0.86, halfHeight * 0.18)
    ctx.bezierCurveTo(-halfWidth * 0.72, 0, -halfWidth * 0.72, -halfHeight * 0.04, -halfWidth * 0.86, -halfHeight * 0.18)
    ctx.closePath()
  }

  private drawDebugTip(ctx: CanvasRenderingContext2D, point: Point | undefined, color: string) {
    if (!point) return
    ctx.save()
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(point.x * this.width, point.y * this.height, 5.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  private roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
    const r = Math.min(radius, width / 2, height / 2)
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + width - r, y)
    ctx.quadraticCurveTo(x + width, y, x + width, y + r)
    ctx.lineTo(x + width, y + height - r)
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
    ctx.lineTo(x + r, y + height)
    ctx.quadraticCurveTo(x, y + height, x, y + height - r)
    ctx.lineTo(x, y + r)
    ctx.quadraticCurveTo(x, y, x + r, y)
    ctx.closePath()
  }

  private lerpPoint(a: Point, b: Point, amount: number) {
    return { x: a.x + (b.x - a.x) * amount, y: a.y + (b.y - a.y) * amount }
  }

  private resize = () => {
    if (!this.canvas) return
    this.width = window.innerWidth
    this.height = window.innerHeight
    this.dpr = Math.min(2, window.devicePixelRatio || 1)
    this.canvas.width = this.width * this.dpr
    this.canvas.height = this.height * this.dpr
    this.canvas.style.width = `${this.width}px`
    this.canvas.style.height = `${this.height}px`
    this.ctx?.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
  }

  private resizeIfNeeded() {
    if (this.canvas && (this.canvas.clientWidth !== this.width || this.canvas.clientHeight !== this.height)) this.resize()
  }
}
