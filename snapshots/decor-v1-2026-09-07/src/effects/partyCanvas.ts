import { interactionConfig } from '../config/interactionConfig'
import { visualConfig } from '../config/visualConfig'
import type { Point } from '../types'

type DecorZoneId = 'top-left' | 'top-center' | 'top-right' | 'left-side' | 'right-side' | 'upper-middle'
type DecorTemplate = 'Top Corner Balloon Cluster' | 'Side Hanging Decor' | 'Floating Mid-Air Accent' | 'Ribbon Fall Accent' | 'Single Balloon Accent'
type ZoneKind = 'corner' | 'side' | 'light'

type Balloon = {
  x: number; y: number; size: number; depth: number; born: number; delay: number; life: number
  phase: number; drift: number; rotation: number; opacity: number; color: string; zone: DecorZoneId; clusterId: number; burst: number
}
type Ribbon = {
  x: number; y: number; length: number; width: number; born: number; delay: number; phase: number
  sway: number; rotation: number; opacity: number; color: string; zone: DecorZoneId; clusterId: number
}
type Confetti = { x: number; y: number; vx: number; vy: number; size: number; color: string; rotation: number; spin: number; life: number; maxLife: number }
type Disc = { x: number; y: number; size: number; vx: number; vy: number; rotation: number; spin: number; depth: number; opacity: number }
type CakeData = { x: number; y: number; scale: number; progress: number; candleOut: number; flameLean: number; blowFeedback: number }
type ZoneDefinition = { id: DecorZoneId; x: number; y: number; capacity: number; kind: ZoneKind }

const random = (min: number, max: number) => min + Math.random() * (max - min)
const pick = <T,>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)]
const easeOut = (value: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, value)), 3)
const zoneDefinitions: readonly ZoneDefinition[] = [
  { id: 'top-left', x: .14, y: .14, capacity: 2, kind: 'corner' },
  { id: 'top-center', x: .5, y: .105, capacity: 1, kind: 'light' },
  { id: 'top-right', x: .86, y: .14, capacity: 2, kind: 'corner' },
  { id: 'left-side', x: .1, y: .49, capacity: 2, kind: 'side' },
  { id: 'right-side', x: .9, y: .49, capacity: 2, kind: 'side' },
  { id: 'upper-middle', x: .5, y: .255, capacity: 1, kind: 'light' },
]
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

const balloonPalette = ['#f5eee2', '#e8b9c0', '#d8d5d0', '#f0d9c3'] as const
const ribbonPalette = ['#e7b8c0', '#efd1d1', '#ead8cb', '#d9d4cf'] as const
const confettiPalette = ['#efc9cc', '#e4d8cc', '#d4d0ca', '#f0dfd5'] as const

export type PartyDebugSnapshot = {
  activeZones: DecorZoneId[]
  zoneDensity: Record<DecorZoneId, string>
  lastClusterTemplate: DecorTemplate | '—'
  clusterCount: number
}

export class PartyCanvas {
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private width = 1
  private height = 1
  private dpr = 1
  private balloons: Balloon[] = []
  private ribbons: Ribbon[] = []
  private confetti: Confetti[] = []
  private discs: Disc[] = []
  private clusters = new Map<number, { zone: DecorZoneId; template: DecorTemplate; createdAt: number }>()
  private nextClusterId = 1
  private lastClusterTemplate: DecorTemplate | '—' = '—'
  private cake: CakeData | null = null
  private celebrationStarted = 0

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
    this.updateBalloons(now)
    this.updateRibbons(now)
    this.updateConfetti(now)
    this.updateDiscs()
    if (this.cake && this.cake.progress < 1) this.cake.progress = Math.min(1, this.cake.progress + 0.025)
    if (this.cake && this.cake.candleOut > 0 && this.cake.candleOut < 1) this.cake.candleOut = Math.min(1, this.cake.candleOut + 0.075)
    this.ribbons.forEach((ribbon) => this.drawRibbon(ctx, ribbon, now))
    this.confetti.forEach((piece) => this.drawConfetti(ctx, piece))
    this.discs.forEach((disc) => this.drawDisc(ctx, disc))
    this.balloons.sort((a, b) => a.depth - b.depth).forEach((balloon) => this.drawBalloon(ctx, balloon, now))
    if (this.cake) this.drawCake(ctx, this.cake, now)
  }

  spawnAt(point: Point, now: number) {
    const requested = this.nearestZone(point)
    const zone = this.selectAvailableZone(requested, point)
    if (!zone) return
    // One Point is one small piece of decoration: either one balloon or a few ribbons.
    const template: DecorTemplate = Math.random() < .56 ? 'Single Balloon Accent' : 'Ribbon Fall Accent'
    const clusterId = this.nextClusterId++
    this.clusters.set(clusterId, { zone: zone.id, template, createdAt: now })
    this.lastClusterTemplate = template
    this.buildCluster(template, zone, clusterId, now, point)
  }

  getDebugSnapshot(): PartyDebugSnapshot {
    const density = {} as Record<DecorZoneId, string>
    const activeZones: DecorZoneId[] = []
    zoneDefinitions.forEach((zone) => {
      const count = [...this.clusters.values()].filter((cluster) => cluster.zone === zone.id).length
      density[zone.id] = `${count}/${zone.capacity}`
      if (count > 0) activeZones.push(zone.id)
    })
    return { activeZones, zoneDensity: density, lastClusterTemplate: this.lastClusterTemplate, clusterCount: this.clusters.size }
  }

  setCake(target: Point, handDistance: number, now: number) {
    const safeTarget = { x: Math.max(0.16, Math.min(0.84, target.x)), y: Math.max(0.32, Math.min(0.72, target.y)) }
    const scale = Math.max(interactionConfig.cakeMinScale, Math.min(interactionConfig.cakeMaxScale, 0.78 + handDistance * 0.9))
    if (!this.cake) this.cake = { x: safeTarget.x, y: safeTarget.y, scale, progress: 0, candleOut: 0, flameLean: 0, blowFeedback: 0 }
    this.cake.x += (safeTarget.x - this.cake.x) * interactionConfig.cakeFollowSmoothing
    this.cake.y += (safeTarget.y - this.cake.y) * interactionConfig.cakeFollowSmoothing
    this.cake.scale += (scale - this.cake.scale) * 0.08
    this.cake.progress = Math.min(1, this.cake.progress + 0.025)
    if (this.cake.progress === 1 && this.cake.candleOut === 0) this.cake.flameLean = Math.sin(now / 190) * 0.12
  }

  extinguishCandle(now: number) {
    if (!this.cake) return
    this.cake.candleOut = Math.min(1, this.cake.candleOut + 0.09)
    this.celebrationStarted = now
  }

  setBlowFeedback(score: number, now: number) {
    if (!this.cake) return
    const feedback = Math.max(0, Math.min(1, score))
    this.cake.blowFeedback += (feedback - this.cake.blowFeedback) * 0.28
    this.cake.flameLean = Math.sin(now / 190) * 0.12 + this.cake.blowFeedback * 0.72
  }

  beginCelebration(now: number) {
    this.balloons.forEach((balloon, index) => { window.setTimeout(() => this.burstBalloon(balloon, now + index * 90), index * 75) })
    window.setTimeout(() => {
      for (let i = 0; i < 25; i += 1) this.spawnConfetti({ x: random(.04, .96), y: random(.02, .42) }, 1, true)
      for (let i = 0; i < 25; i += 1) this.discs.push(this.makeDisc())
    }, 460)
  }

  drawDebugLandmarks(landmarks: Point[][]) {
    if (!this.ctx) return
    const ctx = this.ctx
    ctx.save()
    ctx.fillStyle = 'rgba(255,255,255,.8)'
    landmarks.forEach((hand) => hand.forEach((point) => {
      ctx.beginPath(); ctx.arc(point.x * this.width, point.y * this.height, 3, 0, Math.PI * 2); ctx.fill()
    }))
    ctx.restore()
  }

  reset() {
    this.balloons = []; this.ribbons = []; this.confetti = []; this.discs = []; this.clusters.clear(); this.nextClusterId = 1; this.lastClusterTemplate = '—'; this.cake = null; this.celebrationStarted = 0
  }

  private nearestZone(point: Point) {
    return zoneDefinitions.reduce((closest, zone) => distance(point, zone) < distance(point, closest) ? zone : closest, zoneDefinitions[0])
  }

  private selectAvailableZone(requested: ZoneDefinition, point: Point) {
    const available = zoneDefinitions.filter((zone) => {
      const count = [...this.clusters.values()].filter((cluster) => cluster.zone === zone.id).length
      return count < zone.capacity
    })
    return available.sort((a, b) => {
      const aDistance = distance(point, a)
      const bDistance = distance(point, b)
      const aPenalty = a.id === requested.id ? 0 : .06
      const bPenalty = b.id === requested.id ? 0 : .06
      return aDistance + aPenalty - (bDistance + bPenalty)
    })[0] ?? requested
  }

  private chooseTemplate(kind: ZoneKind): DecorTemplate {
    const roll = Math.random()
    if (kind === 'corner') return roll < .78 ? 'Top Corner Balloon Cluster' : 'Ribbon Fall Accent'
    if (kind === 'side') return roll < .78 ? 'Side Hanging Decor' : 'Ribbon Fall Accent'
    return roll < .52 ? 'Floating Mid-Air Accent' : 'Ribbon Fall Accent'
  }

  private buildCluster(template: DecorTemplate, zone: ZoneDefinition, clusterId: number, now: number, point: Point) {
    // The zone controls composition and capacity; the user's point controls the actual placement.
    const anchor = { x: Math.max(.08, Math.min(.92, point.x)), y: Math.max(.08, Math.min(.72, point.y)) }
    if (template === 'Single Balloon Accent') {
      this.addBalloon(anchor, zone, clusterId, now, 0, random(.075, .098))
      return
    }
    if (template === 'Top Corner Balloon Cluster') {
      const offsets = zone.id === 'top-left' ? [-.07, -.015, .055, .1] : [.1, .045, -.025, -.08]
      offsets.forEach((offset, index) => this.addBalloon({ x: anchor.x + offset, y: anchor.y + random(-.02, .035) }, zone, clusterId, now, index, random(.075, .108)))
      for (let i = 0; i < 5; i += 1) this.addRibbon({ x: anchor.x + random(-.1, .1), y: anchor.y + .045, length: random(.045, .09), width: random(2, 3), zone, clusterId, now, delay: 230 + i * 55 })
      return
    }
    if (template === 'Side Hanging Decor') {
      const side = zone.id === 'left-side' ? -1 : 1
      const offsets = [0, .065, -.06, .1].slice(0, Math.random() < .45 ? 2 : 3)
      offsets.forEach((offset, index) => this.addBalloon({ x: anchor.x + side * Math.abs(offset), y: anchor.y + offset * .7 }, zone, clusterId, now, index, random(.07, .1)))
      for (let i = 0; i < 3; i += 1) this.addRibbon({ x: anchor.x + side * random(.01, .1), y: anchor.y + .055, length: random(.052, .096), width: random(2, 3), zone, clusterId, now, delay: 250 + i * 65 })
      return
    }
    if (template === 'Floating Mid-Air Accent') {
      const balloonCount = Math.random() < .58 ? 1 : 2
      for (let i = 0; i < balloonCount; i += 1) this.addBalloon({ x: anchor.x + random(-.07, .07), y: anchor.y + random(-.03, .045) }, zone, clusterId, now, i, random(.065, .09))
      for (let i = 0; i < (balloonCount === 1 ? 1 : 2); i += 1) this.addRibbon({ x: anchor.x + random(-.06, .06), y: anchor.y + .04, length: random(.032, .064), width: random(2, 3), zone, clusterId, now, delay: 300 + i * 90 })
      return
    }
    const ribbonOffsets = [-.028, 0, .028]
    ribbonOffsets.forEach((offset, i) => this.addRibbon({ x: anchor.x + offset, y: anchor.y, length: random(.04, .08), width: random(2, 3), zone, clusterId, now, delay: i * 75 }))
  }

  private addBalloon(point: Point, zone: ZoneDefinition, clusterId: number, now: number, index: number, size: number) {
    if (this.balloons.length >= visualConfig.maxBalloons) return
    this.balloons.push({ x: point.x, y: point.y, size, depth: random(.2, .82), born: now, delay: index * 115, life: random(visualConfig.balloonMinLife, visualConfig.balloonMaxLife), phase: random(0, Math.PI * 2), drift: random(.004, .011), rotation: random(-.08, .08), opacity: random(.78, .94), color: pick(balloonPalette), zone: zone.id, clusterId, burst: 0 })
  }

  private addRibbon({ x, y, length, width, zone, clusterId, now, delay }: { x: number; y: number; length: number; width: number; zone: ZoneDefinition; clusterId: number; now: number; delay: number }) {
    if (this.ribbons.length >= visualConfig.maxRibbons) return
    this.ribbons.push({ x, y, length, width, born: now, delay, phase: random(0, Math.PI * 2), sway: random(.025, .07), rotation: random(-.16, .16), opacity: random(.66, .88), color: pick(ribbonPalette), zone: zone.id, clusterId })
  }

  private spawnConfetti(point: Point, count: number, wide = false) {
    for (let i = 0; i < count; i += 1) {
      if (this.confetti.length >= visualConfig.maxParticles) this.confetti.shift()
      this.confetti.push({ x: point.x, y: point.y, vx: wide ? random(-.35, .35) : random(-.12, .12), vy: wide ? random(-.42, .04) : random(-.25, -.04), size: random(.006, .014), color: pick(confettiPalette), rotation: random(0, Math.PI), spin: random(-8, 8), life: 0, maxLife: random(1400, 3000) })
    }
  }

  private burstBalloon(balloon: Balloon, now: number) {
    if (balloon.burst > 0) return
    balloon.burst = now
    this.spawnConfetti({ x: balloon.x, y: balloon.y }, 8, true)
  }

  private makeDisc(): Disc { return { x: random(.03, .97), y: random(.03, .75), size: random(.012, .034), vx: random(-.0003, .0003), vy: random(.0002, .0011), rotation: random(0, Math.PI), spin: random(-.025, .025), depth: random(.1, .95), opacity: random(.3, .72) } }

  private updateBalloons(now: number) {
    this.balloons = this.balloons.filter((balloon) => balloon.burst === 0 || now - balloon.burst < 700)
    this.balloons.forEach((balloon) => { balloon.y -= .00006 * (1.2 - balloon.depth); balloon.x += Math.sin(now / 1600 + balloon.phase) * balloon.drift * .00055; balloon.rotation += Math.sin(now / 2200 + balloon.phase) * .00045 })
  }

  private updateRibbons(now: number) {
    // Decor remains in the room until the user resets the experience.
  }

  private updateConfetti(now: number) {
    this.confetti.forEach((piece) => { piece.life += 16; piece.x += piece.vx * .001; piece.y += piece.vy * .001; piece.vy += .00022; piece.vx *= .995; piece.rotation += piece.spin * .001 })
    this.confetti = this.confetti.filter((piece) => piece.life < piece.maxLife && piece.y < 1.12)
  }

  private updateDiscs() { this.discs.forEach((disc) => { disc.x += disc.vx; disc.y += disc.vy; disc.rotation += disc.spin; if (disc.y > 1.1) { disc.y = -.05; disc.x = random(0, 1) } }) }

  private entrance(item: { born: number; delay: number }, now: number, duration = 380) { return easeOut((now - item.born - item.delay) / duration) }

  private drawBalloon(ctx: CanvasRenderingContext2D, balloon: Balloon, now: number) {
    const entrance = this.entrance(balloon, now, 650)
    if (entrance <= 0) return
    const x = balloon.x * this.width; const y = balloon.y * this.height; const w = balloon.size * this.height; const h = w * 1.18; const burst = balloon.burst ? Math.min(1, (now - balloon.burst) / 230) : 0
    const alpha = balloon.opacity * entrance * (balloon.burst ? 1 - burst : 1)
    const rgb = this.hexToRgb(balloon.color)
    ctx.save(); ctx.translate(x, y + (1 - entrance) * 16); ctx.rotate(balloon.rotation + Math.sin(now / 1800 + balloon.phase) * .035); ctx.scale(1 + burst * .18, 1 + burst * .18); ctx.globalAlpha = alpha; ctx.filter = balloon.depth < .24 ? 'blur(.45px)' : 'none'
    ctx.shadowColor = 'rgba(55,40,37,.16)'; ctx.shadowBlur = 9; ctx.shadowOffsetY = 7
    const gradient = ctx.createRadialGradient(-w * .2, -h * .26, w * .03, w * .08, h * .08, w * .76)
    gradient.addColorStop(0, 'rgba(255,255,255,.98)'); gradient.addColorStop(.12, 'rgba(255,255,255,.66)'); gradient.addColorStop(.28, `rgba(${rgb.r},${rgb.g},${rgb.b},.94)`); gradient.addColorStop(.72, `rgba(${Math.max(0, rgb.r - 18)},${Math.max(0, rgb.g - 18)},${Math.max(0, rgb.b - 15)},.9)`); gradient.addColorStop(1, `rgba(${Math.max(0, rgb.r - 32)},${Math.max(0, rgb.g - 32)},${Math.max(0, rgb.b - 26)},.82)`)
    ctx.fillStyle = gradient
    ctx.beginPath(); ctx.moveTo(0, -h * .51); ctx.bezierCurveTo(-w * .42, -h * .52, -w * .56, -h * .18, -w * .48, h * .14); ctx.bezierCurveTo(-w * .4, h * .4, -w * .2, h * .49, 0, h * .46); ctx.bezierCurveTo(w * .2, h * .49, w * .42, h * .4, w * .48, h * .14); ctx.bezierCurveTo(w * .56, -h * .18, w * .42, -h * .52, 0, -h * .51); ctx.closePath(); ctx.fill()
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0
    ctx.fillStyle = 'rgba(255,255,255,.56)'; ctx.beginPath(); ctx.ellipse(-w * .22, -h * .25, w * .075, h * .14, -.4, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,.26)'; ctx.beginPath(); ctx.ellipse(-w * .14, -h * .09, w * .18, h * .08, -.55, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = `rgba(${Math.max(0, rgb.r - 35)},${Math.max(0, rgb.g - 35)},${Math.max(0, rgb.b - 30)},.75)`; ctx.beginPath(); ctx.moveTo(-w * .055, h * .44); ctx.lineTo(w * .055, h * .44); ctx.lineTo(w * .025, h * .57); ctx.lineTo(-w * .025, h * .57); ctx.closePath(); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,.78)'; ctx.beginPath(); ctx.ellipse(0, h * .56, w * .065, h * .045, 0, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = 'rgba(244,236,227,.68)'; ctx.lineWidth = Math.max(.7, w * .012); ctx.beginPath(); ctx.moveTo(0, h * .59); ctx.bezierCurveTo(Math.sin(now / 900 + balloon.phase) * 5, h * .68, Math.sin(now / 1100 + balloon.phase) * 7, h * .75, Math.sin(now / 1300 + balloon.phase) * 8, h * .82); ctx.stroke()
    ctx.restore()
  }

  private drawRibbon(ctx: CanvasRenderingContext2D, ribbon: Ribbon, now: number) {
    const entrance = this.entrance(ribbon, now, 500)
    if (entrance <= 0) return
    const x = ribbon.x * this.width; const y = ribbon.y * this.height; const length = ribbon.length * this.height * entrance; const sway = ribbon.sway * this.width; const phase = ribbon.phase + now / 1700
    ctx.save(); ctx.translate(x, y); ctx.rotate(ribbon.rotation); ctx.globalAlpha = ribbon.opacity * entrance
    const gradient = ctx.createLinearGradient(-ribbon.width, 0, ribbon.width, 0); gradient.addColorStop(0, 'rgba(255,255,255,.18)'); gradient.addColorStop(.28, ribbon.color); gradient.addColorStop(.52, 'rgba(255,255,255,.72)'); gradient.addColorStop(.78, ribbon.color); gradient.addColorStop(1, 'rgba(184,139,145,.25)')
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(90,65,66,.08)'; ctx.lineWidth = ribbon.width + 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(sway, length * .2, -sway, length * .48, Math.sin(phase) * sway * .6, length); ctx.stroke()
    ctx.strokeStyle = gradient; ctx.lineWidth = ribbon.width; ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(sway, length * .2, -sway, length * .48, Math.sin(phase) * sway * .6, length); ctx.stroke()
    ctx.strokeStyle = 'rgba(255,255,255,.42)'; ctx.lineWidth = Math.max(.7, ribbon.width * .2); ctx.beginPath(); ctx.moveTo(-ribbon.width * .16, 0); ctx.bezierCurveTo(sway * .96, length * .2, -sway * .96, length * .48, Math.sin(phase) * sway * .6 - ribbon.width * .12, length); ctx.stroke()
    ctx.restore()
  }

  private drawConfetti(ctx: CanvasRenderingContext2D, piece: Confetti) {
    ctx.save(); ctx.translate(piece.x * this.width, piece.y * this.height); ctx.rotate(piece.rotation); ctx.globalAlpha = Math.min(1, 1 - piece.life / piece.maxLife); ctx.fillStyle = piece.color
    ctx.fillRect(-piece.size * this.height * .6, -piece.size * this.height * .18, piece.size * this.height * 1.2, piece.size * this.height * .36); ctx.restore()
  }

  private drawDisc(ctx: CanvasRenderingContext2D, disc: Disc) {
    const x = disc.x * this.width; const y = disc.y * this.height; const r = disc.size * this.height; const shine = Math.abs(Math.sin(disc.rotation))
    ctx.save(); ctx.translate(x, y); ctx.scale(.72 + shine * .28, 1); ctx.globalAlpha = disc.opacity; const gradient = ctx.createLinearGradient(-r, 0, r, 0); gradient.addColorStop(0, '#aaa69d'); gradient.addColorStop(.48, '#ffffff'); gradient.addColorStop(1, '#d8cfc3'); ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.restore()
  }

  private drawCake(ctx: CanvasRenderingContext2D, cake: CakeData, now: number) {
    const base = Math.min(this.width, this.height) * .13 * cake.scale; const x = cake.x * this.width; const y = cake.y * this.height; const progress = cake.progress; const rise = (1 - progress) * 22; const candleOut = cake.candleOut
    ctx.save(); ctx.translate(x, y + rise); ctx.scale(progress, progress); ctx.globalAlpha = progress; ctx.shadowColor = 'rgba(58,36,34,.16)'; ctx.shadowBlur = 13; ctx.shadowOffsetY = 10
    const bodyGradient = ctx.createLinearGradient(-base, 0, base, 0); bodyGradient.addColorStop(0, '#dcaeb5'); bodyGradient.addColorStop(.18, '#f7dfe0'); bodyGradient.addColorStop(.52, '#fff3ec'); bodyGradient.addColorStop(.82, '#e9c4c8'); bodyGradient.addColorStop(1, '#c7909a')
    ctx.fillStyle = bodyGradient; ctx.beginPath(); ctx.moveTo(-base * .62, -base * .22); ctx.lineTo(-base * .62, base * .6); ctx.quadraticCurveTo(0, base * .82, base * .62, base * .6); ctx.lineTo(base * .62, -base * .22); ctx.closePath(); ctx.fill()
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0
    ctx.fillStyle = '#fff0eb'; ctx.beginPath(); ctx.ellipse(0, -base * .22, base * .63, base * .2, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = 'rgba(194,143,150,.52)'; ctx.lineWidth = 1.2; ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,.72)'; ctx.beginPath(); ctx.moveTo(-base * .6, -.12 * base); ctx.bezierCurveTo(-base * .42, -.01 * base, -base * .34, -.23 * base, -base * .18, -.1 * base); ctx.bezierCurveTo(-base * .03, .03 * base, base * .06, -.22 * base, base * .2, -.08 * base); ctx.bezierCurveTo(base * .35, .05 * base, base * .46, -.19 * base, base * .6, -.08 * base); ctx.lineTo(base * .6, base * .16); ctx.bezierCurveTo(base * .4, base * .08, base * .26, base * .25, base * .08, base * .14); ctx.bezierCurveTo(-base * .1, base * .05, -base * .26, base * .25, -base * .6, base * .16); ctx.closePath(); ctx.fill()
    for (let i = 0; i < 11; i += 1) { const pearlX = -base * .48 + i * base * .096; ctx.fillStyle = i % 3 === 0 ? '#d3c3c2' : '#fffaf2'; ctx.beginPath(); ctx.arc(pearlX, base * .58 + Math.sin(i) * 1.4, base * .042, 0, Math.PI * 2); ctx.fill() }
    this.drawCakeBow(ctx, base, -base * .24, base * .23)
    ctx.strokeStyle = '#e4d8ce'; ctx.lineWidth = Math.max(2, base * .04); ctx.beginPath(); ctx.moveTo(0, -base * .34); ctx.lineTo(0, -base * .94); ctx.stroke()
    this.drawCakeBow(ctx, base * .34, 0, -base * .92)
    ctx.globalAlpha = 1 - candleOut; ctx.shadowColor = 'rgba(247,180,91,.6)'; ctx.shadowBlur = base * (.18 + cake.blowFeedback * .1); ctx.fillStyle = '#f1b45f'; ctx.beginPath(); ctx.ellipse(cake.flameLean * base, -base * 1.08, base * (.065 - cake.blowFeedback * .02), base * (.13 - cake.blowFeedback * .035 + Math.sin(now / 120) * .025), cake.flameLean, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = '#fffdf1'; ctx.beginPath(); ctx.ellipse(cake.flameLean * base, -base * 1.09, base * .028, base * .065, cake.flameLean, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = Math.max(0, .25 - candleOut * .35); ctx.strokeStyle = '#dedbd1'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -base * 1.15); ctx.bezierCurveTo(-base * .22, -base * 1.45, base * .2, -base * 1.45, 0, -base * 1.72); ctx.stroke(); ctx.restore()
  }

  private drawCakeBow(ctx: CanvasRenderingContext2D, size: number, x: number, y: number) {
    ctx.save(); ctx.translate(x, y); ctx.fillStyle = 'rgba(255,244,238,.9)'; ctx.strokeStyle = 'rgba(205,164,169,.72)'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-size * .65, -size * .55, -size * 1.18, -size * .25, -size * 1.02, size * .18); ctx.bezierCurveTo(-size * .9, size * .48, -size * .32, size * .34, 0, size * .06); ctx.closePath(); ctx.fill(); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(size * .65, -size * .55, size * 1.18, -size * .25, size * 1.02, size * .18); ctx.bezierCurveTo(size * .9, size * .48, size * .32, size * .34, 0, size * .06); ctx.closePath(); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#e0b9bd'; ctx.beginPath(); ctx.arc(0, size * .03, size * .18, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.strokeStyle = 'rgba(206,164,169,.72)'; ctx.beginPath(); ctx.moveTo(-size * .07, size * .16); ctx.lineTo(-size * .46, size * .7); ctx.lineTo(-size * .08, size * .54); ctx.moveTo(size * .07, size * .16); ctx.lineTo(size * .46, size * .7); ctx.lineTo(size * .08, size * .54); ctx.stroke(); ctx.restore()
  }

  private hexToRgb(hex: string) {
    const value = hex.replace('#', '')
    return { r: Number.parseInt(value.slice(0, 2), 16), g: Number.parseInt(value.slice(2, 4), 16), b: Number.parseInt(value.slice(4, 6), 16) }
  }

  private resize = () => { if (!this.canvas) return; this.width = window.innerWidth; this.height = window.innerHeight; this.dpr = Math.min(2, window.devicePixelRatio || 1); this.canvas.width = this.width * this.dpr; this.canvas.height = this.height * this.dpr; this.canvas.style.width = `${this.width}px`; this.canvas.style.height = `${this.height}px`; this.ctx?.setTransform(this.dpr, 0, 0, this.dpr, 0, 0) }
  private resizeIfNeeded() { if (this.canvas && (this.canvas.clientWidth !== this.width || this.canvas.clientHeight !== this.height)) this.resize() }
}
