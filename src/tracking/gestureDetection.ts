import { interactionConfig } from '../config/interactionConfig'
import type { CakeGesture, FlameGesture, HandSnapshot, Point, TrackingFrame } from '../types'

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

function isFingerExtended(tip: Point, pip: Point, mcp: Point, palm: Point) {
  return distance(tip, palm) > distance(pip, palm) * 1.12 && distance(tip, mcp) > 0.08
}

function isThumbExtended(points: Point[], palm: Point) {
  return distance(points[4], palm) > distance(points[3], palm) * 1.06 && distance(points[4], points[2]) > 0.055
}

function isThumbFolded(points: Point[], palm: Point) {
  return distance(points[4], points[2]) < 0.12 || distance(points[4], palm) < distance(points[3], palm) * 1.2
}

function isOpenPalmShape(points: Point[]) {
  if (points.length < 21) return false
  const palm = points[0]
  const extendedFingers = [
    isFingerExtended(points[8], points[6], points[5], palm),
    isFingerExtended(points[12], points[10], points[9], palm),
    isFingerExtended(points[16], points[14], points[13], palm),
    isFingerExtended(points[20], points[18], points[17], palm),
  ].filter(Boolean).length
  return isThumbExtended(points, palm) && extendedFingers >= 3
}

function isOpenPalmLabel(labels: string[]) {
  return labels.some((label) => label.toLowerCase().replace(/[\s_-]+/g, '') === 'openpalm')
}

function palmCenter(points: Point[]) {
  const palmPoints = [points[0], points[5], points[9], points[13], points[17]].filter(Boolean)
  const total = palmPoints.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 })
  return { x: total.x / palmPoints.length, y: total.y / palmPoints.length }
}

function isUserLeftHand(label: string | undefined) {
  // The recognizer receives the unmirrored camera frame, while the video is
  // mirrored for the user. Swap the model label to keep the real hand identity.
  return label === 'Right'
}

function isIndexPointingUp(points: Point[]) {
  const dx = points[8].x - points[6].x
  const dy = points[8].y - points[6].y
  return dy < -0.03 && Math.abs(dy) > Math.abs(dx) * 0.8
}

function isPointingUpShape(points: Point[]) {
  if (points.length < 21) return false
  const palm = points[0]
  const indexOpen = isFingerExtended(points[8], points[6], points[5], palm)
  const foldedFingers = [
    !isFingerExtended(points[12], points[10], points[9], palm),
    !isFingerExtended(points[16], points[14], points[13], palm),
    !isFingerExtended(points[20], points[18], points[17], palm),
  ].filter(Boolean).length
  return indexOpen && isIndexPointingUp(points) && isThumbFolded(points, palm) && foldedFingers >= 2
}

function isPointingUpLabel(labels: string[]) {
  return labels.some((label) => label.toLowerCase().replace(/[\s_-]+/g, '') === 'pointingup')
}

/**
 * The open phase is defined only by the index and thumb endpoints.
 * The other three fingers can stay relaxed in any position: the preceding
 * close phase is what prevents an ordinary open palm from triggering it.
 */
export function isCakeGestureShape(points: Point[]) {
  if (points.length < 21) return false
  const palm = points[0]
  const indexOpen = isFingerExtended(points[8], points[6], points[5], palm)
  const thumbOpen = isThumbExtended(points, palm)
  const indexThumbGap = distance(points[8], points[4])
  return indexOpen && thumbOpen && indexThumbGap > 0.12
}

type CakeHandState = { previousGap: number; wasClosed: boolean; isOpen: boolean }
type SwipeDirection = 'left' | 'right'
type PalmSwipeState = {
  active: boolean
  openPalmScore: number
  lastPoseAt: number
  previousX: number
  direction: SwipeDirection | null
  movingSince: number | null
  lastMotionAt: number
  travel: number
  triggered: boolean
}

function newPalmSwipeState(active: boolean, x: number, timestamp: number): PalmSwipeState {
  return { active, openPalmScore: active ? interactionConfig.palmOpenConfirmFrames : 0, lastPoseAt: timestamp, previousX: x, direction: null, movingSince: null, lastMotionAt: timestamp, travel: 0, triggered: false }
}

export class GestureDetector {
  private smoothedHands: HandSnapshot[] = []
  private cakeHandStates: CakeHandState[] = []
  private palmSwipeStates: PalmSwipeState[] = []

  update(rawLandmarks: Point[][], handedness: string[][], gestures: string[][] = [], timestamp = performance.now()): TrackingFrame {
    let cakeGestureOpened = false
    let flameGesture: FlameGesture | null = null
    const hands = rawLandmarks.slice(0, 2).map((points, index) => {
      const mirrored = points.map((point) => ({ x: 1 - point.x, y: point.y }))
      const palm = mirrored[0]
      const indexTip = mirrored[8] ?? palm
      const thumbTip = mirrored[4] ?? palm
      const prior = this.smoothedHands[index]
      const blend = interactionConfig.smoothing
      const labels = gestures[index] ?? []
      const openPalm = isOpenPalmLabel(labels) || isOpenPalmShape(points)
      const pointUp = isIndexPointingUp(points) && (isPointingUpLabel(labels) || isPointingUpShape(points))
      const gap = distance(points[8], points[4])
      const cakeShapeOpen = !openPalm && isCakeGestureShape(points)
      const cakeState = this.cakeHandStates[index] ?? { previousGap: gap, wasClosed: false, isOpen: false }
      const wasClosedBeforeThisFrame = cakeState.wasClosed
      if (gap < interactionConfig.cakeCloseGap) cakeState.wasClosed = true
      const openedNow = cakeShapeOpen && !cakeState.isOpen && wasClosedBeforeThisFrame && gap >= interactionConfig.cakeOpenGap && gap - cakeState.previousGap >= interactionConfig.cakeMinimumExpansion
      if (openedNow) {
        cakeState.isOpen = true
        cakeState.wasClosed = false
      }
      if (openedNow) cakeGestureOpened = true
      const cakeActive = cakeState.isOpen && cakeShapeOpen && gap >= interactionConfig.cakeOpenGap * 0.86
      if (!cakeActive) cakeState.isOpen = false
      cakeState.previousGap = gap
      this.cakeHandStates[index] = cakeState
      const swipe = this.updatePalmSwipe(
        isUserLeftHand(handedness[index]?.[0]) && openPalm,
        palmCenter(points),
        index,
        timestamp,
      )
      if (swipe && flameGesture === null) flameGesture = swipe
      const smoothed: HandSnapshot = {
        palm: prior ? this.lerpPoint(prior.palm, palm, blend) : palm,
        indexTip: prior ? this.lerpPoint(prior.indexTip, indexTip, blend) : indexTip,
        pointUpTip: indexTip,
        thumbTip: prior ? this.lerpPoint(prior.thumbTip, thumbTip, blend) : thumbTip,
        cakeGesture: cakeActive,
        pointUp,
        openPalm,
        handedness: handedness[index]?.[0] === 'Left' || handedness[index]?.[0] === 'Right'
          ? handedness[index][0] as 'Left' | 'Right'
          : 'Unknown',
      }
      this.smoothedHands[index] = smoothed
      return smoothed
    })

    this.smoothedHands = this.smoothedHands.slice(0, rawLandmarks.length)
    this.cakeHandStates = this.cakeHandStates.slice(0, rawLandmarks.length)
    this.palmSwipeStates = this.palmSwipeStates.slice(0, rawLandmarks.length)
    const cakeHand = hands.find((hand) => hand.cakeGesture)
    const cakeGesture: CakeGesture | null = cakeHand
      ? { indexTip: cakeHand.indexTip, thumbTip: cakeHand.thumbTip }
      : null
    const pointUpHand = hands.find((hand) => hand.pointUp)
    const cakeGesturePhase: TrackingFrame['cakeGesturePhase'] = cakeGesture
      ? 'open'
      : this.cakeHandStates.some((hand) => hand.wasClosed)
        ? 'closed'
        : 'idle'

    return {
      hands,
      cakeGesture,
      cakeGestureOpened,
      cakeGesturePhase,
      pointUpGesture: pointUpHand?.pointUpTip ?? null,
      flameGesture,
      landmarks: rawLandmarks.map((points) => points.map((point) => ({ x: 1 - point.x, y: point.y }))),
    }
  }

  reset() {
    this.smoothedHands = []
    this.cakeHandStates = []
    this.palmSwipeStates = []
  }

  private updatePalmSwipe(active: boolean, palm: Point, handIndex: number, timestamp: number): FlameGesture | null {
    const state = this.palmSwipeStates[handIndex] ?? newPalmSwipeState(false, palm.x, timestamp)
    if (active) {
      state.openPalmScore = Math.min(interactionConfig.palmOpenConfirmFrames, state.openPalmScore + 1)
      state.lastPoseAt = timestamp
    } else {
      state.openPalmScore = Math.max(0, state.openPalmScore - 1)
    }

    if (!state.active && state.openPalmScore >= interactionConfig.palmOpenConfirmFrames) {
      state.active = true
      state.previousX = palm.x
      state.direction = null
      state.movingSince = null
      state.lastMotionAt = timestamp
      state.travel = 0
      state.triggered = false
    }

    if (state.active && timestamp - state.lastPoseAt > interactionConfig.palmOpenGraceMs) {
      this.palmSwipeStates[handIndex] = newPalmSwipeState(false, palm.x, timestamp)
      return null
    }

    const delta = palm.x - state.previousX
    if (state.active && Math.abs(delta) >= interactionConfig.palmSwipeStepThreshold) {
      const direction: SwipeDirection = delta < 0 ? 'right' : 'left'
      if (state.direction !== direction) {
        state.direction = direction
        state.movingSince = timestamp
        state.travel = Math.abs(delta)
      } else {
        state.travel += Math.abs(delta)
      }
      state.lastMotionAt = timestamp
    } else if (state.active && state.movingSince !== null && timestamp - state.lastMotionAt > interactionConfig.palmSwipePauseMs) {
      state.direction = null
      state.movingSince = null
      state.travel = 0
    }
    state.previousX = palm.x

    if (!state.triggered && state.direction && state.movingSince !== null && timestamp - state.movingSince >= interactionConfig.palmSwipeDurationMs && state.travel >= interactionConfig.palmSwipeMinTravel) {
      state.triggered = true
      this.palmSwipeStates[handIndex] = state
      return state.direction === 'right' ? 'hide' : 'show'
    }

    this.palmSwipeStates[handIndex] = state
    return null
  }

  private lerpPoint(a: Point, b: Point, amount: number) {
    return { x: a.x + (b.x - a.x) * amount, y: a.y + (b.y - a.y) * amount }
  }
}
