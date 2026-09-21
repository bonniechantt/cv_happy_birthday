import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import type { Point } from '../types'

type TrackingResult = { landmarks: Point[][]; handedness: string[][] }

const wasmRoot = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
const modelUrl = '/models/hand_landmarker.task'

export class HandTracking {
  private landmarker: HandLandmarker | null = null
  private latest: TrackingResult = { landmarks: [], handedness: [] }
  private busy = false
  private lastSent = 0
  private failed = false

  async init() {
    const vision = await FilesetResolver.forVisionTasks(wasmRoot)
    const options = {
      runningMode: 'VIDEO' as const,
      numHands: 2,
      minHandDetectionConfidence: 0.58,
      minHandPresenceConfidence: 0.55,
      minTrackingConfidence: 0.55,
    }

    try {
      this.landmarker = await HandLandmarker.createFromOptions(vision, {
        ...options,
        baseOptions: { modelAssetPath: modelUrl, delegate: 'GPU' },
      })
    } catch {
      this.landmarker = await HandLandmarker.createFromOptions(vision, {
        ...options,
        baseOptions: { modelAssetPath: modelUrl, delegate: 'CPU' },
      })
    }
  }

  detect(video: HTMLVideoElement, timestamp: number, intervalMs: number): TrackingResult {
    if (!this.landmarker || this.failed || this.busy || timestamp - this.lastSent < intervalMs || video.readyState < 2 || video.videoWidth === 0) return this.latest

    this.busy = true
    this.lastSent = timestamp
    try {
      const result = this.landmarker.detectForVideo(video, timestamp)
      this.latest = {
        landmarks: result.landmarks.map((hand) => hand.map((point) => ({ x: point.x, y: point.y }))),
        handedness: result.handedness.map((entries) => entries.map((entry) => entry.categoryName ?? 'Unknown')),
      }
    } catch {
      this.failed = true
    } finally {
      this.busy = false
    }
    return this.latest
  }

  close() {
    this.landmarker?.close()
    this.landmarker = null
    this.failed = false
    this.busy = false
  }
}
