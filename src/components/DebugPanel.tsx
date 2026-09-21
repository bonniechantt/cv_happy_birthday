import type { DebugSnapshot } from '../types'

export function DebugPanel({ data, landmarksVisible }: { data: DebugSnapshot; landmarksVisible: boolean }) {
  return <div className="debug-panel" aria-hidden="true">
    <div>FPS <b>{data.fps}</b></div>
    <div>Hands detected <b>{data.hands}</b></div>
    <div>Thumb + index <b>{String(data.cakeGesture)}</b></div>
    <div>Gesture phase <b>{data.cakePhase}</b></div>
    <div>Point up <b>{String(data.pointUp)}</b></div>
    <div>Flame swipe <b>{data.flameGesture ?? '—'}</b></div>
    <div>Candle flames <b>{data.candleFlamesVisible ? 'on' : 'off'}</b></div>
    <div>Balloons placed <b>{data.balloonCount}</b></div>
    <div>Cakes placed <b>{data.cakeCount}</b></div>
    <div>Current state <b>{data.state}</b></div>
    <div>Landmarks <b>{landmarksVisible ? 'on' : 'off'}</b></div>
    <div>Model gesture <b>{data.gestures.length ? data.gestures.join(', ') : 'None'}</b></div>
  </div>
}
