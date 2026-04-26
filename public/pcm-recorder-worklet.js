/* global AudioWorkletProcessor, registerProcessor, sampleRate */

class PcmRecorderWorklet extends AudioWorkletProcessor {
  constructor(options) {
    super()

    this.targetSampleRate = options.processorOptions?.targetSampleRate || 16000
    this.inputSampleRate = sampleRate
    this.resampleRatio = this.inputSampleRate / this.targetSampleRate
    this.buffer = []
    this.nextSampleIndex = 0
  }

  process(inputs) {
    const inputChannel = inputs[0]?.[0]

    if (!inputChannel || inputChannel.length === 0) {
      return true
    }

    this.buffer.push(...inputChannel)
    const requiredInputSamples = Math.max(1, Math.floor(this.resampleRatio))

    if (this.buffer.length < requiredInputSamples) {
      return true
    }

    const pcm16 = []

    while (this.nextSampleIndex + this.resampleRatio <= this.buffer.length) {
      const sample = this.buffer[Math.floor(this.nextSampleIndex)] ?? 0
      const clampedSample = Math.max(-1, Math.min(1, sample))
      const pcmValue =
        clampedSample < 0 ? clampedSample * 0x8000 : clampedSample * 0x7fff

      pcm16.push(pcmValue)
      this.nextSampleIndex += this.resampleRatio
    }

    const consumedSamples = Math.floor(this.nextSampleIndex)

    if (consumedSamples > 0) {
      this.buffer = this.buffer.slice(consumedSamples)
      this.nextSampleIndex -= consumedSamples
    }

    if (pcm16.length > 0) {
      const chunk = new Int16Array(pcm16)
      this.port.postMessage(chunk.buffer, [chunk.buffer])
    }

    return true
  }
}

registerProcessor('pcm-recorder-worklet', PcmRecorderWorklet)
