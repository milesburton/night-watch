import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type DiagnosticsTab = 'console' | 'state' | 'network' | 'sdr' | 'passes'
type WaterfallMode = 'satellite' | 'sstv-2m'

export type SectionId = 'waterfall' | 'gallery' | 'server'

interface UIState {
  diagnosticsOpen: boolean
  diagnosticsTab: DiagnosticsTab
  diagnosticsPanelHeight: number
  waterfallMode: WaterfallMode
  waterfallEnabled: boolean
  selectedFrequency: number | null
  collapsedSections: Record<SectionId, boolean>

  setDiagnosticsOpen: (open: boolean) => void
  toggleDiagnostics: () => void
  setDiagnosticsTab: (tab: DiagnosticsTab) => void
  setDiagnosticsPanelHeight: (height: number) => void
  setWaterfallMode: (mode: WaterfallMode) => void
  setWaterfallEnabled: (enabled: boolean) => void
  setSelectedFrequency: (freq: number | null) => void
  toggleSection: (section: SectionId) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      diagnosticsOpen: false,
      diagnosticsTab: 'console',
      diagnosticsPanelHeight: 300,
      waterfallMode: 'satellite',
      waterfallEnabled: false,
      selectedFrequency: null,
      collapsedSections: { waterfall: true, gallery: false, server: false },

      setDiagnosticsOpen: (open) => set({ diagnosticsOpen: open }),
      toggleDiagnostics: () => set((state) => ({ diagnosticsOpen: !state.diagnosticsOpen })),
      setDiagnosticsTab: (tab) => set({ diagnosticsTab: tab }),
      setDiagnosticsPanelHeight: (height) => set({ diagnosticsPanelHeight: height }),
      setWaterfallMode: (mode) => set({ waterfallMode: mode }),
      setWaterfallEnabled: (enabled) => set({ waterfallEnabled: enabled }),
      setSelectedFrequency: (freq) => set({ selectedFrequency: freq }),
      toggleSection: (section) =>
        set((state) => {
          const collapsed = !state.collapsedSections[section]
          const waterfallEnabled = section === 'waterfall' ? !collapsed : state.waterfallEnabled
          return {
            collapsedSections: { ...state.collapsedSections, [section]: collapsed },
            waterfallEnabled,
          }
        }),
    }),
    {
      name: 'night-watch-ui',
      partialize: (state) => ({
        diagnosticsOpen: state.diagnosticsOpen,
        diagnosticsTab: state.diagnosticsTab,
        diagnosticsPanelHeight: state.diagnosticsPanelHeight,
        waterfallMode: state.waterfallMode,
        waterfallEnabled: state.waterfallEnabled,
        collapsedSections: state.collapsedSections,
      }),
    }
  )
)
