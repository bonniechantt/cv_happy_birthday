import { interactionConfig } from '../config/interactionConfig'
import type { HandSnapshot, Point, TrackingFrame } from '../types'

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

function isFingerExtended(tip: Point, pip: Point, mcp: Point, palm: Point) {
  return distance(tip, palm) > distance(pip, palm) * 1.12 && distance(tip, mcp) > 0.08
}

export function isPointGesture(landmarks: Point[]) {
  if (landmarks.length < 21) return false
  const palm = landmarks[0]
  const index = isFingerExtended(landmarks[8], landmarks[6], landmarks[5], palm)
  const middle = !isFingerExtended(landmarks[12], landmarks[10], landmarks[9], palm)
  const ring = !isFingerExtended(landmarks[16], landmarks[14], landmarks[13], palm)
  const pinky = !isFingerExtended(landmarks[20], landmarks[18], landmarks[17], palm)
  return index && middle && ring && pinky
}

export class GestureDetector {
  private smoothedHands: HandSnapshot[] = []
  private previousDistance = 0
  private spreadStartedAt = 0
  private spreadTriggered = false

  update(rawLandmarks: Point[][], handedness: string[][], now: number): TrackingFrame {
    const hands = rawLandmarks.slice(0, 2).map((points, index) => {
      const mirrored = points.map((point) => ({ x: 1 - point.x, y: point.y }))
      const palm = mirrored[0]
      const fingertip = mirrored[8] ?? palm
      const prior = this.smoothedHands[index]
      const blend = interactionConfig.smoothing
      const smoothed: HandSnapshot = {
        palm: prior ? this.lerpPoint(prior.palm, palm, blend) : palm,
        fingertip: prior ? this.lerpPoint(prior.fingertip, fingertip, blend) : fingertip,
        pointGesture: isPointGesture(points),
        handedness: handedness[index]?.[0] === 'Left' || handedness[index]?.[0] === 'Right'
          ? handedness[index][0] as 'Left' | 'Right'
          : 'Unknown',
      }
      this.smoothedHands[index] = smoothed
      return smoothed
    })

    this.smoothedHands = this.smoothedHands.slice(0, rawLandmarks.length)
    const twoHands = hands.length === 2
    const currentDistance = twoHands ? distance(hands[0].palm, hands[1].palm) : 0
    const growth = currentDistance - this.previousDistance
    const hasDistanceHistory = this.previousDistance > 0
    const crossedOpenThreshold = twoHands && hasDistanceHistory && this.previousDistance < interactionConfig.handDistanceThreshold * 0.9 && currentDistance > interactionConfig.handDistanceThreshold && growth > interactionConfig.handExpansionSpeed
    const isExpanding = twoHands && currentDistance > interactionConfig.handDistanceThreshold && growth > interactionConfig.handExpansionSpeed
    if (crossedOpenThreshold && this.spreadStartedAt === 0 && !this.spreadTriggered) this.spreadStartedAt = now
    if (!twoHands || currentDistance < interactionConfig.handDistanceThreshold * 0.72) { this.spreadStartedAt = 0; this.spreadTriggered = false }
    const isSpread = isExpanding && this.spreadStartedAt > 0 && !this.spreadTriggered && now - this.spreadStartedAt > interactionConfig.handSpreadHoldMs
    if (isSpread) this.spreadTriggered = true
    this.previousDistance = currentDistance

    const pointHand = hands.find((hand) => hand.pointGesture)
    return {
      hands,
      handDistance: currentDistance,
      midpoint: twoHands ? midpoint(hands[0].palm, hands[1].palm) : null,
      isSpread,
      point: pointHand?.fingertip ?? null,
      landmarks: rawLandmarks.map((points) => points.map((point) => ({ x: 1 - point.x, y: point.y }))),
    }
  }

  reset() {
    this.smoothedHands = []
    this.previousDistance = 0
    this.spreadStartedAt = 0
    this.spreadTriggered = false
  }

  private lerpPoint(a: Point, b: Point, amount: number) {
    return { x: a.x + (b.x - a.x) * amount, y: a.y + (b.y - a.y) * amount }
  }
}
