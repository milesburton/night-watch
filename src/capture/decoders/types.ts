import type { SignalType } from '../../types'

export interface DecoderResult {
  outputPaths: string[]
  metadata?: Record<string, unknown>
}

export interface Decoder {
  name: string
  signalType: SignalType
  decode(wavPath: string, outputDir: string): Promise<DecoderResult | null>
  checkInstalled(): Promise<boolean>
}
