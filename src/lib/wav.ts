// Encodage d'un AudioBuffer en WAV PCM 16 bits.
// Le WAV sert a la fois de format de telechargement direct et de format
// d'entree pour ffmpeg.wasm (conversion MP3 / FLAC / OGG).

export function audioBufferToWav(buffer: AudioBuffer): Uint8Array {
  const channels = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const frameCount = buffer.length
  const bytesPerSample = 2
  const blockAlign = channels * bytesPerSample
  const dataSize = frameCount * blockAlign
  const out = new ArrayBuffer(44 + dataSize)
  const view = new DataView(out)

  const writeString = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bytesPerSample * 8, true)
  writeString(36, 'data')
  view.setUint32(40, dataSize, true)

  const channelData: Float32Array[] = []
  for (let ch = 0; ch < channels; ch++) channelData.push(buffer.getChannelData(ch))

  let offset = 44
  for (let i = 0; i < frameCount; i++) {
    for (let ch = 0; ch < channels; ch++) {
      const sample = Math.max(-1, Math.min(1, channelData[ch][i]))
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
      offset += 2
    }
  }

  return new Uint8Array(out)
}
