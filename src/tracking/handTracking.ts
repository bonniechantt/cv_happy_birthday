import { FilesetResolver, GestureRecognizer } from '@mediapipe/tasks-vision'
import type { Point } from '../types'

type TrackingResult = { landmarks: Point[][]; handedness: string[][]; gestures: string[][] }

const wasmRoot = '/wasm'
const modelUrl = '/models/gesture_recognizer.task'

export class HandTracking {
  private recognizer: GestureRecognizer | null = null
  private latest: TrackingResult = { landmarks: [], handedness: [], gestures: [] }
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
      this.recognizer = await GestureRecognizer.createFromOptions(vision, {
        ...options,
        baseOptions: { modelAssetPath: modelUrl, delegate: 'GPU' },
        cannedGesturesClassifierOptions: { scoreThreshold: 0.52 },
      })
    } catch {
      this.recognizer = await GestureRecognizer.createFromOptions(vision, {
        ...options,
        baseOptions: { modelAssetPath: modelUrl, delegate: 'CPU' },
        cannedGesturesClassifierOptions: { scoreThreshold: 0.52 },
      })
    }
  }

  detect(video: HTMLVideoElement, timestamp: number, intervalMs: number): TrackingResult {
    if (!this.recognizer || this.failed || this.busy || timestamp - this.lastSent < intervalMs || video.readyState < 2 || video.videoWidth === 0) return this.latest

    this.busy = true
    this.lastSent = timestamp
    try {
      const result = this.recognizer.recognizeForVideo(video, timestamp)
      this.latest = {
        landmarks: result.landmarks.map((hand) => hand.map((point) => ({ x: point.x, y: point.y }))),
        handedness: result.handedness.map((entries) => entries.map((entry) => entry.categoryName ?? 'Unknown')),
        gestures: result.gestures.map((entries) => entries.map((entry) => entry.categoryName ?? 'None')),
      }
    } catch {
      this.failed = true
    } finally {
      this.busy = false
    }
    return this.latest
  }

  close() {
    this.recognizer?.close()
    this.recognizer = null
    this.failed = false
    this.busy = false
  }
}
