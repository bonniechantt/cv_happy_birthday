export type Point = { x: number; y: number }

export type CakeGesture = {
  indexTip: Point
  thumbTip: Point
}

export type FlameGesture = 'hide' | 'show'

export type HandSnapshot = {
  palm: Point
  indexTip: Point
  pointUpTip: Point
  thumbTip: Point
  cakeGesture: boolean
  pointUp: boolean
  openPalm: boolean
  handedness: 'Left' | 'Right' | 'Unknown'
}

export type TrackingFrame = {
  hands: HandSnapshot[]
  cakeGesture: CakeGesture | null
  cakeGestureOpened: boolean
  cakeGesturePhase: 'idle' | 'closed' | 'open'
  pointUpGesture: Point | null
  flameGesture: FlameGesture | null
  landmarks: Point[][]
}

export type DebugSnapshot = {
  fps: number
  hands: number
  cakeGesture: boolean
  cakePhase: 'idle' | 'closed' | 'open'
  pointUp: boolean
  flameGesture: FlameGesture | null
  candleFlamesVisible: boolean
  balloonCount: number
  cakeCount: number
  state: string
  gestures: string[]
}
