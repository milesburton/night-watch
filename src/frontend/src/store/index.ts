import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type DiagnosticsTab = 'console' | 'state' | 'network' | 'sdr' | 'passes'
type WaterfallMode = 'satellite' | 'sstv-2m'

interface UIState {
  diagnosticsOpen: boolean
  diagnosticsTab: DiagnosticsTab
  diagnosticsPanelHeight: number
  waterfallMode: WaterfallMode
  selectedFrequency: number | null

  setDiagnosticsOpen: (open: boolean) => void
  toggleDiagnostics: () => void
  setDiagnosticsTab: (tab: DiagnosticsTab) => void
  setDiagnosticsPanelHeight: (height: number) => void
  setWaterfallMode: (mode: WaterfallMode) => void
  setSelectedFrequency: (freq: number | null) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      diagnosticsOpen: false,
      diagnosticsTab: 'console',
      diagnosticsPanelHeight: 300,
      waterfallMode: 'satellite',
      selectedFrequency: null,

      setDiagnosticsOpen: (open) => set({ diagnosticsOpen: open }),
      toggleDiagnostics: () => set((state) => ({ diagnosticsOpen: !state.diagnosticsOpen })),
      setDiagnosticsTab: (tab) => set({ diagnosticsTab: tab }),
      setDiagnosticsPanelHeight: (height) => set({ diagnosticsPanelHeight: height }),
      setWaterfallMode: (mode) => set({ waterfallMode: mode }),
      setSelectedFrequency: (freq) => set({ selectedFrequency: freq }),
    }),
    {
      name: 'night-watch-ui',
      partialize: (state) => ({
        diagnosticsOpen: state.diagnosticsOpen,
        diagnosticsTab: state.diagnosticsTab,
        diagnosticsPanelHeight: state.diagnosticsPanelHeight,
        waterfallMode: state.waterfallMode,
      }),
    }
  )
)
