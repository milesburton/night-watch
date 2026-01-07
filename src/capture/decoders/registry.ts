import type { SignalType } from '../../types'
import type { Decoder } from './types'

const decoderRegistry = new Map<SignalType, Decoder>()

export function registerDecoder(decoder: Decoder): void {
  decoderRegistry.set(decoder.signalType, decoder)
}

export function getDecoder(signalType: SignalType): Decoder | undefined {
  return decoderRegistry.get(signalType)
}

export function getAllDecoders(): Decoder[] {
  return Array.from(decoderRegistry.values())
}

export function hasDecoder(signalType: SignalType): boolean {
  return decoderRegistry.has(signalType)
}
