import { useEffect, useRef } from 'react'
import { loadBirthdayCutout } from '../utils/birthdayImage'

type BirthdayWordmarkProps = {
  className?: string
}

export function BirthdayWordmark({ className = 'intro-wordmark' }: BirthdayWordmarkProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let disposed = false
    void loadBirthdayCutout(2).then((cutout) => {
      if (disposed) return
      if (!cutout) return
      canvas.width = cutout.width
      canvas.height = cutout.height
      const context = canvas.getContext('2d')
      if (!context) return
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.drawImage(cutout, 0, 0)
    })
    return () => { disposed = true }
  }, [])

  return <canvas ref={canvasRef} className={className} role="img" aria-label="Happy Birthday" />
}
