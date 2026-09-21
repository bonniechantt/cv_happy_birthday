import type { DebugSnapshot } from '../types'

export function DebugPanel({ data, landmarksVisible }: { data: DebugSnapshot; landmarksVisible: boolean }) {
  return <div className="debug-panel" aria-hidden="true">
    <div>FPS <b>{data.fps}</b></div>
    <div>Hands detected <b>{data.hands}</b></div>
    <div>Point gesture <b>{String(data.point)}</b></div>
    <div>Hand distance <b>{data.handDistance.toFixed(3)}</b></div>
    <div>Cake trigger <b>{String(data.cakeTrigger)}</b></div>
    <div>Audio RMS <b>{data.audioRms.toFixed(3)}</b></div>
    <div>High frequency <b>{data.highFrequencyEnergy.toFixed(3)}</b></div>
    <div>Blow score <b>{data.blowScore.toFixed(3)}</b></div>
    <div>Current state <b>{data.state}</b></div>
    <div>Landmarks <b>{landmarksVisible ? 'on' : 'off'}</b></div>
    <div>Active zones <b>{data.activeZones.length ? data.activeZones.join(', ') : '—'}</b></div>
    <div>Zone density <b>{Object.entries(data.zoneDensity).map(([zone, density]) => `${zone}:${density}`).join(' · ')}</b></div>
    <div>Last cluster <b>{data.lastClusterTemplate}</b></div>
    <div>Clusters <b>{data.clusterCount}</b></div>
  </div>
}
