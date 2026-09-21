import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'

const wasmRoot = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
const modelUrl = `${import.meta.env.BASE_URL}models/hand_landmarker.task`
let landmarker: HandLandmarker | null = null

self.onmessage = async (event: MessageEvent<{ type: string; image?: ImageBitmap; timestamp?: number }>) => {
  try {
    if (event.data.type === 'init') {
      const vision = await FilesetResolver.forVisionTasks(wasmRoot)
      const options = { runningMode: 'VIDEO' as const, numHands: 2, minHandDetectionConfidence: 0.58, minHandPresenceConfidence: 0.55, minTrackingConfidence: 0.55 }
      try {
        landmarker = await HandLandmarker.createFromOptions(vision, { ...options, baseOptions: { modelAssetPath: modelUrl, delegate: 'GPU' } })
      } catch {
        landmarker = await HandLandmarker.createFromOptions(vision, { ...options, baseOptions: { modelAssetPath: modelUrl, delegate: 'CPU' } })
      }
      self.postMessage({ type: 'ready' })
      return
    }
    if (event.data.type === 'frame' && event.data.image && event.data.timestamp !== undefined && landmarker) {
      const result = landmarker.detectForVideo(event.data.image, event.data.timestamp)
      event.data.image.close()
      self.postMessage({ type: 'result', result: { landmarks: result.landmarks.map((hand) => hand.map((point) => ({ x: point.x, y: point.y }))), handedness: result.handedness.map((entries) => entries.map((entry) => entry.categoryName ?? 'Unknown')) } })
    }
  } catch (error) {
    event.data.image?.close()
    self.postMessage({ type: 'error', error: error instanceof Error ? error.message : 'Hand tracking failed' })
  }
}
