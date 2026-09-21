import { forwardRef } from 'react'

export const CameraView = forwardRef<HTMLVideoElement>(function CameraView(_, ref) {
  return <video ref={ref} className="camera-view" autoPlay playsInline muted aria-label="Mirrored camera view" />
})
