export type Point = { x: number; y: number }

export type HandSnapshot = {
  palm: Point
  fingertip: Point
  pointGesture: boolean
  handedness: 'Left' | 'Right' | 'Unknown'
}

export type TrackingFrame = {
  hands: HandSnapshot[]
  handDistance: number
  midpoint: Point | null
  isSpread: boolean
  point: Point | null
  landmarks: Point[][]
}

export type AudioMetrics = {
  rms: number
  highFrequencyEnergy: number
  blowScore: number
  isBlowing: boolean
  baseline: number
}

export type DebugSnapshot = {
  fps: number
  hands: number
  point: boolean
  handDistance: number
  cakeTrigger: boolean
  audioRms: number
  highFrequencyEnergy: number
  blowScore: number
  state: string
  activeZones: string[]
  zoneDensity: Record<string, string>
  lastClusterTemplate: string
  clusterCount: number
}
