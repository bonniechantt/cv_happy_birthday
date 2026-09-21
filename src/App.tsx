import { useCallback, useEffect, useRef, useState } from 'react'
import { CameraView } from './components/CameraView'
import { DebugPanel } from './components/DebugPanel'
import { BirthdayWordmark } from './components/BirthdayWordmark'
import { interactionConfig } from './config/interactionConfig'
import { PartyCanvas } from './effects/partyCanvas'
import { BirthdayState } from './state/birthdayState'
import { GestureDetector } from './tracking/gestureDetection'
import { HandTracking } from './tracking/handTracking'
import type { DebugSnapshot, Point, TrackingFrame } from './types'

const isDebug = new URLSearchParams(window.location.search).get('debug') === 'true'
const interactionHint = 'Cake: close thumb + index, then open. Balloon: point up. Left palm: swipe.'

function screenPoint(point: Point | null, video: HTMLVideoElement | null): Point | null {
  if (!point || !video || !video.videoWidth || !video.videoHeight) return point ? { x: point.x, y: point.y } : null
  const videoAspect = video.videoWidth / video.videoHeight
  const videoRect = video.getBoundingClientRect()
  const screenWidth = videoRect.width || window.innerWidth
  const screenHeight = videoRect.height || window.innerHeight
  const screenAspect = screenWidth / screenHeight
  if (videoAspect > screenAspect) {
    const renderedWidth = videoAspect / screenAspect
    return { x: point.x * renderedWidth - (renderedWidth - 1) / 2, y: point.y }
  }
  const renderedHeight = screenAspect / videoAspect
  return { x: point.x, y: point.y * renderedHeight - (renderedHeight - 1) / 2 }
}

function describeCameraError(caught: unknown) {
  if (!(caught instanceof DOMException)) return 'The camera could not start. Try using localhost or HTTPS in a modern browser.'
  if (caught.name === 'NotAllowedError' || caught.name === 'PermissionDeniedError') return 'Camera access was denied. Allow camera access for this page, then reload.'
  if (caught.name === 'NotFoundError' || caught.name === 'DevicesNotFoundError') return 'No camera was found. Connect a camera and reload.'
  if (caught.name === 'NotReadableError' || caught.name === 'TrackStartError') return 'The camera is already in use by another app. Close it there and reload.'
  if (caught.name === 'SecurityError') return 'Camera access requires localhost or HTTPS.'
  return `Camera error: ${caught.name}. Reload and try again.`
}

function App() {
  const [state, setState] = useState(BirthdayState.LOADING)
  const [hasStarted, setHasStarted] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [birthdayMessageVisible, setBirthdayMessageVisible] = useState(false)
  const [debug, setDebug] = useState<DebugSnapshot>({ fps: 0, hands: 0, cakeGesture: false, cakePhase: 'idle', pointUp: false, flameGesture: null, candleFlamesVisible: true, balloonCount: 0, cakeCount: 0, state: BirthdayState.LOADING, gestures: [] })
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const partyRef = useRef(new PartyCanvas())
  const trackingRef = useRef(new HandTracking())
  const gesturesRef = useRef(new GestureDetector())
  const rafRef = useRef<number | null>(null)
  const lastFrameRef = useRef(0)
  const stateRef = useRef(state)
  const debugFrameRef = useRef(0)
  const fpsRef = useRef(60)
  const lastBalloonSpawnRef = useRef(-Infinity)
  const pointUpStartedRef = useRef<number | null>(null)
  const cakeGestureLockRef = useRef(false)
  const candleFlamesVisibleRef = useRef(true)
  const trackingResultRef = useRef<{ landmarks: Point[][]; handedness: string[][]; gestures: string[][] }>({ landmarks: [], handedness: [], gestures: [] })

  useEffect(() => { stateRef.current = state }, [state])

  useEffect(() => {
    const party = partyRef.current
    party.setBirthdayMessageHandler(setBirthdayMessageVisible)
    return () => party.setBirthdayMessageHandler(null)
  }, [])

  const showMessage = useCallback((text: string, duration = 2300) => {
    setMessage(text)
    window.setTimeout(() => setMessage((current) => current === text ? '' : current), duration)
  }, [])

  const applyCandleFlamesVisibility = useCallback((visible: boolean) => {
    candleFlamesVisibleRef.current = visible
    partyRef.current.setCandleFlamesVisible(visible)
  }, [])

  const reset = useCallback(() => {
    partyRef.current.reset(); gesturesRef.current.reset(); lastBalloonSpawnRef.current = -Infinity; pointUpStartedRef.current = null; cakeGestureLockRef.current = false; applyCandleFlamesVisibility(true); setState(BirthdayState.READY); showMessage(interactionHint, 4200)
  }, [applyCandleFlamesVisibility, showMessage])

  const keyboardFallback = useCallback((key: string) => {
    const now = performance.now()
    if (key === 'b') {
      partyRef.current.beginBalloon({ x: .5, y: .42 }, now)
      showMessage('Balloon placed. Point up to place another.', 1800)
    }
    if (key === 'c') {
      partyRef.current.beginCake({ indexTip: { x: .66, y: .38 }, thumbTip: { x: .34, y: .62 } }, now)
      setState(BirthdayState.CAKE_BUILDING)
      showMessage('Cake placed. Open the gesture again for another one.', 1800)
    }
    if (key === 'r') reset()
  }, [reset, showMessage])

  const frame = useCallback((now: number) => {
    const video = videoRef.current
    if (!video && !isDebug) return
    if (lastFrameRef.current) {
      const instantFps = 1000 / Math.max(1, now - lastFrameRef.current)
      fpsRef.current = fpsRef.current * .9 + instantFps * .1
    }
    lastFrameRef.current = now
    partyRef.current.render(now)
    trackingResultRef.current = video ? trackingRef.current.detect(video, now, interactionConfig.handTrackingIntervalMs) : { landmarks: [], handedness: [], gestures: [] }
    const result = trackingResultRef.current
    const tracking: TrackingFrame = gesturesRef.current.update(result.landmarks, result.handedness, result.gestures, now)
    if (tracking.flameGesture) {
      const visible = tracking.flameGesture === 'show'
      applyCandleFlamesVisibility(visible)
      if (!visible) partyRef.current.explodeBalloons(now)
      showMessage(visible ? 'Candle flames on.' : 'Candle flames off.', 1800)
    }
    const pointUpGesture = tracking.pointUpGesture
      ? screenPoint(tracking.pointUpGesture, video) ?? tracking.pointUpGesture
      : null
    const cakeGesture = tracking.cakeGesture
      ? {
          indexTip: screenPoint(tracking.cakeGesture.indexTip, video) ?? tracking.cakeGesture.indexTip,
          thumbTip: screenPoint(tracking.cakeGesture.thumbTip, video) ?? tracking.cakeGesture.thumbTip,
        }
      : null
    // Cake interaction owns the hand while it is being created or dragged.
    // Releasing the cake also clears Point Up's debounce, so the next gesture
    // must be held continuously for 500ms before a balloon can appear.
    if (cakeGesture) {
      cakeGestureLockRef.current = true
      pointUpStartedRef.current = null
    } else if (cakeGestureLockRef.current) {
      cakeGestureLockRef.current = false
      pointUpStartedRef.current = null
    }
    if (!cakeGestureLockRef.current && pointUpGesture) {
      if (pointUpStartedRef.current === null) pointUpStartedRef.current = now
      const pointUpStableFor = now - pointUpStartedRef.current
      if (pointUpStableFor >= interactionConfig.pointUpDebounceMs && now - lastBalloonSpawnRef.current >= interactionConfig.balloonIntervalMs) {
        partyRef.current.beginBalloon(pointUpGesture, now)
        lastBalloonSpawnRef.current = now
      }
    } else if (!pointUpGesture || cakeGestureLockRef.current) {
      pointUpStartedRef.current = null
    }
    if (cakeGesture) {
      if (tracking.cakeGestureOpened) {
        partyRef.current.beginCake(cakeGesture, now)
        setState(BirthdayState.CAKE_BUILDING)
        showMessage('Keep the gesture open to shape the cake.', 1500)
      }
      partyRef.current.updateCake(cakeGesture)
    } else {
      if (stateRef.current === BirthdayState.CAKE_BUILDING) setState(BirthdayState.READY)
    }
    if (isDebug && debugFrameRef.current++ % 8 === 0) {
      const partyDebug = partyRef.current.getDebugSnapshot()
      setDebug({ fps: Math.round(fpsRef.current), hands: tracking.hands.length, cakeGesture: Boolean(cakeGesture), cakePhase: tracking.cakeGesturePhase, pointUp: Boolean(tracking.pointUpGesture), flameGesture: tracking.flameGesture, candleFlamesVisible: candleFlamesVisibleRef.current, balloonCount: partyDebug.balloonCount, cakeCount: partyDebug.cakeCount, state: stateRef.current, gestures: result.gestures.map((hand) => hand[0] ?? 'None') })
      if (canvasRef.current) {
        const debugLandmarks = tracking.landmarks.map((hand) => hand.map((point) => screenPoint(point, video) ?? point))
        const debugLabels = result.gestures.map((hand, index) => tracking.hands[index]?.pointUp ? 'Pointing up' : tracking.hands[index]?.cakeGesture ? 'Cake open' : hand[0] ?? 'None')
        partyRef.current.drawDebugLandmarks(debugLandmarks, debugLabels)
      }
    }
    rafRef.current = requestAnimationFrame(frame)
  }, [applyCandleFlamesVisibility, showMessage])

  const startExperience = useCallback(async () => {
    setError(''); setState(BirthdayState.LOADING)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } })
      streamRef.current = stream
      if (!videoRef.current) throw new Error('Camera element unavailable')
      videoRef.current.srcObject = stream
      await videoRef.current.play()
      setHasStarted(true)
      if (canvasRef.current) partyRef.current.attach(canvasRef.current)
      setState(BirthdayState.READY); showMessage(interactionHint, 4200)
      rafRef.current = requestAnimationFrame(frame)
      void trackingRef.current.init().catch(() => showMessage('Hand tracking is unavailable. Reload to retry.', 5000))
    } catch (caught) {
      const reason = describeCameraError(caught)
      if (isDebug) {
        setError('Camera unavailable — debug demo mode enabled. Use B / C / R.')
        setHasStarted(true); setState(BirthdayState.READY); if (canvasRef.current) partyRef.current.attach(canvasRef.current); showMessage('Debug demo mode · B balloon, C cake, R reset', 5000); rafRef.current = requestAnimationFrame(frame)
      } else {
        setError(reason); setHasStarted(false); setState(BirthdayState.LOADING); streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null
      }
    }
  }, [frame, showMessage])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if (isDebug) keyboardFallback(event.key.toLowerCase()) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [keyboardFallback])

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); streamRef.current?.getTracks().forEach((track) => track.stop()); trackingRef.current.close() }, [])

  const title = message

  return <main className={`experience state-${state.toLowerCase()}`}>
    <CameraView ref={videoRef} /><canvas ref={canvasRef} className="effects-canvas" /><div className="grain" />
    {!hasStarted && <section className="intro" aria-live="polite">
      <div className="intro-card">
        <BirthdayWordmark />
        <p className="permission">Allow camera to begin.<br /><span>Hand tracking is processed locally.</span></p>
        <button onClick={startExperience}><strong>Begin</strong><small>start the celebration</small></button>
        {error && <p className="error">{error}</p>}
      </div>
    </section>}
    {hasStarted && <div className={`whisper ${message ? 'visible' : ''}`}>{title}</div>}
    {isDebug && hasStarted && <DebugPanel data={debug} landmarksVisible={true} />}
    {hasStarted && <div className={`birthday-wordmark-layer ${birthdayMessageVisible ? 'visible' : ''}`} aria-hidden={!birthdayMessageVisible}><BirthdayWordmark className="celebration-wordmark" /></div>}
  </main>
}

export default App
