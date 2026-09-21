import { interactionConfig } from '../config/interactionConfig'
import type { AudioMetrics } from '../types'

export class BlowDetector {
  private context: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private timeData: Float32Array<ArrayBuffer> | null = null
  private frequencyData: Uint8Array<ArrayBuffer> | null = null
  private baseline = 0.012
  private baselineStarted = 0
  private blowStarted = 0
  private lastBlow = 0

  async start(stream: MediaStream) {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return
    this.context = new AudioContextClass()
    const source = this.context.createMediaStreamSource(stream)
    this.analyser = this.context.createAnalyser()
    this.analyser.fftSize = 1024
    this.analyser.smoothingTimeConstant = 0.72
    source.connect(this.analyser)
    this.timeData = new Float32Array(this.analyser.fftSize)
    this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount)
    this.baselineStarted = performance.now()
    await this.context.resume()
  }

  resetBaseline(now = performance.now()) {
    this.baseline = 0.012
    this.baselineStarted = now
  }

  sample(now: number): AudioMetrics {
    if (!this.analyser || !this.timeData || !this.frequencyData) return { rms: 0, highFrequencyEnergy: 0, blowScore: 0, isBlowing: false, baseline: this.baseline }
    this.analyser.getFloatTimeDomainData(this.timeData)
    this.analyser.getByteFrequencyData(this.frequencyData)
    let sum = 0
    for (const value of this.timeData) sum += value * value
    const rms = Math.sqrt(sum / this.timeData.length)
    let high = 0
    let all = 0
    const split = Math.floor(this.frequencyData.length * 0.36)
    for (let i = 0; i < this.frequencyData.length; i += 1) {
      all += this.frequencyData[i]
      if (i >= split) high += this.frequencyData[i]
    }
    const highFrequencyEnergy = all ? high / all : 0
    if (now - this.baselineStarted < interactionConfig.blowBaselineSampleMs) {
      this.baseline = this.baseline * 0.96 + rms * 0.04
    }
    const rmsScore = Math.max(0, rms - this.baseline - interactionConfig.blowRmsOffset) / 0.09
    const airScore = Math.max(0, highFrequencyEnergy - interactionConfig.blowHighFrequencyThreshold) / 0.45
    const blowScore = Math.max(0, Math.min(1, rmsScore * 0.58 + airScore * 0.42))
    const baselineReady = now - this.baselineStarted >= interactionConfig.blowBaselineSampleMs
    const isBlowing = baselineReady && blowScore > 0.34 && highFrequencyEnergy > interactionConfig.blowHighFrequencyThreshold && rms > this.baseline + interactionConfig.blowRmsOffset
    if (isBlowing && this.blowStarted === 0) this.blowStarted = now
    if (!isBlowing) this.blowStarted = 0
    const duration = this.blowStarted ? now - this.blowStarted : 0
    const success = duration > interactionConfig.blowDurationMs && now - this.lastBlow > interactionConfig.blowCooldownMs
    if (success) {
      this.lastBlow = now
      this.blowStarted = 0
    }
    return { rms, highFrequencyEnergy, blowScore, isBlowing: success, baseline: this.baseline }
  }

  close() {
    this.context?.close()
    this.context = null
    this.analyser = null
  }
}
