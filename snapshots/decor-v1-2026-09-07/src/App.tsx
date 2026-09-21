import { useCallback, useEffect, useRef, useState } from 'react'
import { CameraView } from './components/CameraView'
import { DebugPanel } from './components/DebugPanel'
import { BlowDetector } from './audio/blowDetection'
import { interactionConfig } from './config/interactionConfig'
import { PartyCanvas } from './effects/partyCanvas'
import { BirthdayState } from './state/birthdayState'
import { GestureDetector } from './tracking/gestureDetection'
import { HandTracking } from './tracking/handTracking'
import type { AudioMetrics, DebugSnapshot, Point, TrackingFrame } from './types'

const isDebug = new URLSearchParams(window.location.search).get('debug') === 'true'
const blankAudio: AudioMetrics = { rms: 0, highFrequencyEnergy: 0, blowScore: 0, isBlowing: false, baseline: 0 }

function screenPoint(point: Point | null, video: HTMLVideoElement | null): Point | null {
  if (!point || !video || !video.videoWidth || !video.videoHeight) return point ? { x: point.x, y: point.y } : null
  const videoAspect = video.videoWidth / video.videoHeight
  const screenAspect = window.innerWidth / window.innerHeight
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
  const [debug, setDebug] = useState<DebugSnapshot>({ fps: 0, hands: 0, point: false, handDistance: 0, cakeTrigger: false, audioRms: 0, highFrequencyEnergy: 0, blowScore: 0, state: BirthdayState.LOADING, activeZones: [], zoneDensity: {}, lastClusterTemplate: '—', clusterCount: 0 })
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const partyRef = useRef(new PartyCanvas())
  const trackingRef = useRef(new HandTracking())
  const gesturesRef = useRef(new GestureDetector())
  const blowRef = useRef(new BlowDetector())
  const rafRef = useRef<number | null>(null)
  const lastFrameRef = useRef(0)
  const lastPointRef = useRef(false)
  const lastPointAtRef = useRef(0)
  const cakeTriggeredRef = useRef(false)
  const candleBlowStartedRef = useRef(false)
  const cakeAppearedAtRef = useRef(0)
  const stateRef = useRef(state)
  const audioRef = useRef<AudioMetrics>(blankAudio)
  const audioReadyRef = useRef(false)
  const debugFrameRef = useRef(0)
  const fpsRef = useRef(60)
  const trackingResultRef = useRef<{ landmarks: Point[][]; handedness: string[][] }>({ landmarks: [], handedness: [] })

  useEffect(() => { stateRef.current = state }, [state])

  const showMessage = useCallback((text: string, duration = 2300) => {
    setMessage(text)
    window.setTimeout(() => setMessage((current) => current === text ? '' : current), duration)
  }, [])

  const reset = useCallback(() => {
    partyRef.current.reset(); gesturesRef.current.reset(); cakeTriggeredRef.current = false; candleBlowStartedRef.current = false; cakeAppearedAtRef.current = 0; lastPointRef.current = false; setState(BirthdayState.READY); showMessage('Point to make a little magic.', 3200)
  }, [showMessage])

  const keyboardFallback = useCallback((key: string) => {
    const now = performance.now()
    if (key === 'p' && stateRef.current !== BirthdayState.CELEBRATION) { partyRef.current.spawnAt({ x: .5, y: .48 }, now); setState(BirthdayState.PARTY_BUILDING); showMessage('Keep going.', 1100) }
    if (key === 'c' && stateRef.current !== BirthdayState.CELEBRATION) { cakeTriggeredRef.current = true; cakeAppearedAtRef.current = now; partyRef.current.setCake({ x: .5, y: .56 }, .34, now); blowRef.current.resetBaseline(now); setState(BirthdayState.CAKE); showMessage('Make a wish.', 3600) }
    if (key === 'b' && (stateRef.current === BirthdayState.CAKE || stateRef.current === BirthdayState.CANDLE_BLOW)) { partyRef.current.extinguishCandle(now); setState(BirthdayState.CELEBRATION); window.setTimeout(() => partyRef.current.beginCelebration(performance.now()), 240); showMessage('HAPPY BIRTHDAY', 999999) }
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
    trackingResultRef.current = video ? trackingRef.current.detect(video, now, interactionConfig.handTrackingIntervalMs) : { landmarks: [], handedness: [] }
    const result = trackingResultRef.current
    const tracking: TrackingFrame = gesturesRef.current.update(result.landmarks, result.handedness, now)
    const currentState = stateRef.current
    if (currentState === BirthdayState.READY || currentState === BirthdayState.PARTY_BUILDING) {
      const pointActive = Boolean(tracking.point)
      if (pointActive && !lastPointRef.current && now - lastPointAtRef.current > interactionConfig.pointCooldownMs) {
        partyRef.current.spawnAt(screenPoint(tracking.point, video)!, now); lastPointAtRef.current = now; setState(BirthdayState.PARTY_BUILDING); showMessage('Point to make a little magic.', 1500)
      }
      lastPointRef.current = pointActive
      if (tracking.isSpread && !cakeTriggeredRef.current) {
        cakeTriggeredRef.current = true; cakeAppearedAtRef.current = now; blowRef.current.resetBaseline(now); setState(BirthdayState.CAKE); showMessage('Make a wish.', 3600)
      }
    }
    if (currentState === BirthdayState.CAKE || currentState === BirthdayState.CANDLE_BLOW) {
      const mappedMidpoint = screenPoint(tracking.midpoint, video)
      if (mappedMidpoint) partyRef.current.setCake({ x: mappedMidpoint.x, y: mappedMidpoint.y + interactionConfig.cakeVerticalOffset }, tracking.handDistance, now)
      const audio = blowRef.current.sample(now); audioRef.current = audio
      partyRef.current.setBlowFeedback(audio.blowScore, now)
      if (currentState === BirthdayState.CAKE && cakeAppearedAtRef.current > 0 && now - cakeAppearedAtRef.current > 1800) { setState(BirthdayState.CANDLE_BLOW); showMessage('and blow', 3200) }
      if (audio.isBlowing && !candleBlowStartedRef.current) {
        candleBlowStartedRef.current = true; partyRef.current.extinguishCandle(now); setState(BirthdayState.CELEBRATION); window.setTimeout(() => partyRef.current.beginCelebration(performance.now()), 240); showMessage('HAPPY BIRTHDAY', 999999)
      }
    }
    if (isDebug && debugFrameRef.current++ % 8 === 0) {
      const partyDebug = partyRef.current.getDebugSnapshot()
      setDebug({ fps: Math.round(fpsRef.current), hands: tracking.hands.length, point: Boolean(tracking.point), handDistance: tracking.handDistance, cakeTrigger: cakeTriggeredRef.current, audioRms: audioRef.current.rms, highFrequencyEnergy: audioRef.current.highFrequencyEnergy, blowScore: audioRef.current.blowScore, state: stateRef.current, activeZones: partyDebug.activeZones, zoneDensity: partyDebug.zoneDensity, lastClusterTemplate: partyDebug.lastClusterTemplate, clusterCount: partyDebug.clusterCount })
      if (canvasRef.current) partyRef.current.drawDebugLandmarks(tracking.landmarks)
    }
    rafRef.current = requestAnimationFrame(frame)
  }, [showMessage])

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
      setState(BirthdayState.READY); showMessage('Point to make a little magic.', 3600)
      rafRef.current = requestAnimationFrame(frame)
      void trackingRef.current.init().catch(() => showMessage('Hand tracking is unavailable. Reload to retry.', 5000))
      void (async () => {
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false } })
          audioStream.getAudioTracks().forEach((track) => stream.addTrack(track))
          await blowRef.current.start(stream)
          audioReadyRef.current = true
        } catch {
          audioReadyRef.current = false
          showMessage('Microphone is unavailable. Camera mode is still active.', 5000)
        }
      })()
    } catch (caught) {
      const reason = describeCameraError(caught)
      if (isDebug) {
        setError('Camera unavailable — debug demo mode enabled. Use P / C / B / R.')
        setHasStarted(true); setState(BirthdayState.READY); if (canvasRef.current) partyRef.current.attach(canvasRef.current); showMessage('Debug demo mode · press P, C, B', 5000); rafRef.current = requestAnimationFrame(frame)
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

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); streamRef.current?.getTracks().forEach((track) => track.stop()); trackingRef.current.close(); blowRef.current.close() }, [])

  const title = state === BirthdayState.CELEBRATION ? 'HAPPY BIRTHDAY' : state === BirthdayState.CANDLE_BLOW ? (audioReadyRef.current ? 'and blow' : 'allow microphone') : state === BirthdayState.CAKE ? message || 'Make a wish.' : message

  return <main className={`experience state-${state.toLowerCase()}`}>
    <CameraView ref={videoRef} /><canvas ref={canvasRef} className="effects-canvas" /><div className="grain" />
    {!hasStarted && <section className="intro" aria-live="polite"><p className="eyebrow">A SMALL CELEBRATION</p><h1>MAKE A<br /><i>LITTLE WISH</i></h1><p className="permission">Allow camera to begin.<br /><span>Camera & microphone are processed locally.</span></p><button onClick={startExperience}>Begin</button>{error && <p className="error">{error}</p>}</section>}
    {hasStarted && <div className={`whisper ${message ? 'visible' : ''}`}>{title}</div>}
    {isDebug && hasStarted && <DebugPanel data={debug} landmarksVisible={true} />}
  </main>
}

export default App
