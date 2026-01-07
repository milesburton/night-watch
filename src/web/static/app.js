class SatelliteMonitor {
  constructor() {
    this.ws = null
    this.state = null
    this.sstv = { manualEnabled: false, activeEvent: null, upcomingEvents: [] }
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 20
    this.reconnectDelay = 1000
    this.countdownInterval = null
    this.globe = null
    this.globeInitialised = false
  }

  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    this.ws = new WebSocket(`${protocol}//${window.location.host}/ws`)

    this.ws.onopen = () => {
      console.log('Connected to server')
      this.reconnectAttempts = 0
      this.updateConnectionStatus(true)
    }

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      this.handleMessage(data)
    }

    this.ws.onclose = () => {
      console.log('Disconnected from server')
      this.updateConnectionStatus(false)
      this.attemptReconnect()
    }

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error)
    }
  }

  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      const delay = this.reconnectDelay * Math.min(this.reconnectAttempts, 10)
      console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)
      setTimeout(() => this.connect(), delay)
    }
  }

  updateConnectionStatus(connected) {
    const el = document.getElementById('connection-status')
    if (connected) {
      el.textContent = 'Connected'
      el.className = 'connection-status connected'
    } else {
      el.textContent = 'Disconnected'
      el.className = 'connection-status disconnected'
    }
  }

  handleMessage(data) {
    switch (data.type) {
      case 'init':
        this.state = data.state
        this.renderAll()
        if (data.globe) {
          this.updateGlobe(data.globe)
        }
        break
      case 'status_change':
        this.updateStatus(data.status)
        break
      case 'capture_progress':
        this.updateProgress(data.progress, data.elapsed, data.total)
        break
      case 'pass_start':
        this.updateCurrentPass(data.pass)
        this.updateStatus('capturing')
        if (data.doppler) {
          this.showDopplerChart(data.doppler)
        }
        break
      case 'pass_complete':
        this.handlePassComplete(data.result)
        break
      case 'passes_updated':
        this.updatePassesList(data.passes)
        break
      case 'sstv_status':
        this.updateSstvStatus(data.status)
        break
      case 'satellite_positions':
        this.updateGlobe(data.globe)
        break
    }
  }

  renderAll() {
    this.updateStatus(this.state.status)
    this.updatePassesList(this.state.upcomingPasses)
    this.updateNextPass(this.state.nextPass)
    if (this.state.currentPass) {
      this.updateCurrentPass(this.state.currentPass)
    }
    this.loadCaptures()
    this.loadSummary()
    this.loadSstvStatus()
    this.startCountdown()
    this.setupSstvToggle()
    this.initGlobe()
  }

  formatFrequency(hz) {
    if (hz >= 1e9) {
      return `${(hz / 1e9).toFixed(6)} GHz`
    }
    if (hz >= 1e6) {
      return `${(hz / 1e6).toFixed(4)} MHz`
    }
    if (hz >= 1e3) {
      return `${(hz / 1e3).toFixed(2)} kHz`
    }
    return `${hz} Hz`
  }

  formatDopplerShift(hz) {
    const sign = hz >= 0 ? '+' : ''
    if (Math.abs(hz) >= 1e3) {
      return `${sign}${(hz / 1e3).toFixed(2)} kHz`
    }
    return `${sign}${Math.round(hz)} Hz`
  }

  updateStatus(status) {
    const badge = document.getElementById('status-badge')
    const progressSection = document.getElementById('progress-section')
    const currentPassEl = document.getElementById('current-pass')
    const dopplerSection = document.getElementById('doppler-section')

    const statusMap = {
      idle: { text: 'Standby', class: 'status-idle' },
      waiting: { text: 'Waiting for Pass', class: 'status-waiting' },
      capturing: { text: 'Capturing', class: 'status-capturing' },
      decoding: { text: 'Decoding', class: 'status-decoding' },
    }

    const config = statusMap[status] || statusMap.idle
    badge.textContent = config.text
    badge.className = `status-badge ${config.class}`

    if (status === 'capturing') {
      progressSection.classList.remove('hidden')
    } else {
      progressSection.classList.add('hidden')
    }

    if (status === 'capturing' || status === 'decoding') {
      currentPassEl.classList.remove('hidden')
    } else {
      currentPassEl.classList.add('hidden')
      dopplerSection.classList.add('hidden')
    }

    if (this.state) {
      this.state.status = status
    }
  }

  updateProgress(progress, elapsed, total) {
    const progressFill = document.getElementById('progress-fill')
    const progressPercent = document.getElementById('progress-percent')
    const progressTime = document.getElementById('progress-time')

    progressFill.style.width = `${progress}%`
    progressPercent.textContent = `${progress}%`

    const remaining = total - elapsed
    const minutes = Math.floor(remaining / 60)
    const seconds = remaining % 60
    progressTime.textContent = `${minutes}:${seconds.toString().padStart(2, '0')} remaining`
  }

  updateCurrentPass(pass) {
    document.getElementById('current-satellite').textContent = pass.satellite.name
    document.getElementById('current-frequency').textContent = this.formatFrequency(
      pass.satellite.frequency
    )
    document.getElementById('current-elevation').textContent = `${pass.maxElevation.toFixed(1)}°`
  }

  updateNextPass(pass) {
    const satelliteEl = document.getElementById('next-satellite')
    const frequencyEl = document.getElementById('next-frequency')
    const timeEl = document.getElementById('next-time')

    if (pass) {
      satelliteEl.textContent = pass.satellite.name
      frequencyEl.textContent = this.formatFrequency(pass.satellite.frequency)
      const passTime = new Date(pass.aos)
      timeEl.textContent = passTime.toLocaleString()
      if (this.state) {
        this.state.nextPass = pass
      }
    } else {
      satelliteEl.textContent = 'No upcoming passes'
      frequencyEl.textContent = '-'
      timeEl.textContent = '-'
    }
  }

  startCountdown() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval)
    }

    this.countdownInterval = setInterval(() => {
      this.updateCountdown()
    }, 1000)
  }

  updateCountdown() {
    const countdownEl = document.getElementById('next-countdown')

    if (!this.state?.nextPass) {
      countdownEl.textContent = '-'
      return
    }

    const now = Date.now()
    const passTime = new Date(this.state.nextPass.aos).getTime()
    const diff = passTime - now

    if (diff <= 0) {
      countdownEl.textContent = 'Starting...'
      return
    }

    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    const seconds = Math.floor((diff % (1000 * 60)) / 1000)

    countdownEl.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }

  updatePassesList(passes) {
    const tbody = document.getElementById('passes-tbody')

    if (!passes || passes.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-message">No upcoming passes</td></tr>'
      return
    }

    tbody.innerHTML = passes
      .map((pass) => {
        const aos = new Date(pass.aos)
        const duration = Math.round(pass.duration / 60)
        const signalType = pass.satellite.signalType || 'apt'
        const frequency = pass.satellite.frequency || 0
        return `
        <tr>
          <td>${pass.satellite.name}</td>
          <td><span class="signal-badge signal-${signalType}">${signalType.toUpperCase()}</span></td>
          <td>${this.formatFrequency(frequency)}</td>
          <td>${aos.toLocaleString()}</td>
          <td>${duration} min</td>
          <td>${pass.maxElevation.toFixed(1)}°</td>
        </tr>
      `
      })
      .join('')

    if (passes.length > 0) {
      this.updateNextPass(passes[0])
    }

    if (this.state) {
      this.state.upcomingPasses = passes
    }
  }

  showDopplerChart(doppler) {
    if (!doppler || !doppler.points || doppler.points.length < 2) return

    const dopplerSection = document.getElementById('doppler-section')
    const dopplerLine = document.getElementById('doppler-line')
    const dopplerCurrent = document.getElementById('doppler-current')
    const dopplerRange = document.getElementById('doppler-range')

    dopplerSection.classList.remove('hidden')

    const points = doppler.points
    const maxShift = Math.max(Math.abs(doppler.maxShift), Math.abs(doppler.minShift))
    const scale = maxShift > 0 ? 60 / maxShift : 1

    const svgPoints = points
      .map((p, i) => {
        const x = (i / (points.length - 1)) * 600
        const y = 75 - p.shift * scale
        return `${x},${y}`
      })
      .join(' ')

    dopplerLine.setAttribute('points', svgPoints)
    dopplerCurrent.textContent = `Current: ${this.formatDopplerShift(points[0].shift)}`
    dopplerRange.textContent = `Range: ${this.formatDopplerShift(doppler.minShift)} to ${this.formatDopplerShift(doppler.maxShift)}`
  }

  updateDopplerMarker(progressPercent) {
    const marker = document.getElementById('doppler-marker')
    const line = document.getElementById('doppler-line')
    const points = line.getAttribute('points')

    if (!points) return

    const x = (progressPercent / 100) * 600
    marker.setAttribute('cx', x)
  }

  async loadSstvStatus() {
    try {
      const response = await fetch('/api/sstv/status')
      const status = await response.json()
      this.updateSstvStatus(status)
    } catch (error) {
      console.error('Failed to load SSTV status:', error)
    }
  }

  updateSstvStatus(status) {
    this.sstv = status
    const toggle = document.getElementById('sstv-toggle')
    const label = document.getElementById('sstv-toggle-label')
    const badge = document.getElementById('sstv-status-badge')

    toggle.checked = status.manualEnabled
    label.textContent = status.manualEnabled ? 'Enabled' : 'Disabled'

    if (status.activeEvent || status.manualEnabled) {
      badge.textContent = status.activeEvent ? 'Event Active' : 'Manual Mode'
      badge.className = 'sstv-badge active'
    } else {
      badge.textContent = 'Inactive'
      badge.className = 'sstv-badge inactive'
    }
  }

  setupSstvToggle() {
    const toggle = document.getElementById('sstv-toggle')
    toggle.addEventListener('change', async () => {
      try {
        const response = await fetch('/api/sstv/toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: toggle.checked }),
        })
        const status = await response.json()
        this.updateSstvStatus(status)
      } catch (error) {
        console.error('Failed to toggle SSTV:', error)
        toggle.checked = this.sstv.manualEnabled
      }
    })
  }

  handlePassComplete(result) {
    this.updateStatus('idle')
    document.getElementById('current-pass').classList.add('hidden')
    document.getElementById('doppler-section').classList.add('hidden')

    // Remove completed pass from upcoming passes and update next pass
    if (this.state?.upcomingPasses) {
      this.state.upcomingPasses = this.state.upcomingPasses.filter(
        (p) => new Date(p.aos).getTime() > Date.now()
      )
      this.state.nextPass = this.state.upcomingPasses[0] || null
      this.updateNextPass(this.state.nextPass)
      this.updatePassesList(this.state.upcomingPasses)
    }

    this.loadCaptures()
    this.loadSummary()
  }

  async loadCaptures() {
    try {
      const response = await fetch('/api/captures?limit=20')
      const captures = await response.json()
      this.renderCaptures(captures)
    } catch (error) {
      console.error('Failed to load captures:', error)
    }
  }

  async loadSummary() {
    try {
      const response = await fetch('/api/summary')
      const summary = await response.json()
      document.getElementById('stat-total').textContent = summary.total
      document.getElementById('stat-success').textContent = summary.successful
      document.getElementById('stat-failed').textContent = summary.failed
    } catch (error) {
      console.error('Failed to load summary:', error)
    }
  }

  renderCaptures(captures) {
    const gallery = document.getElementById('captures-gallery')

    if (!captures || captures.length === 0) {
      gallery.innerHTML = '<p class="empty-message">No captures yet</p>'
      return
    }

    gallery.innerHTML = captures
      .map((capture) => {
        const startTime = new Date(capture.startTime)
        const duration = Math.round(capture.durationSeconds / 60)
        const signalType = capture.signalType || 'apt'

        const compositeImage = capture.imagePaths.find(
          (p) => p.includes('colour') || p.includes('composite')
        )
        const displayImage = compositeImage || capture.imagePaths[0]
        const imageFilename = displayImage ? displayImage.split('/').pop() : null

        return `
        <div class="capture-card ${capture.success ? '' : 'failed'}">
          ${
            imageFilename
              ? `<img src="/images/${imageFilename}" alt="${capture.satelliteName}" class="capture-image" loading="lazy">`
              : `<div class="capture-failed-placeholder">!</div>`
          }
          <div class="capture-info">
            <h4>
              ${
                capture.success
                  ? '<span class="success-icon">&#10003;</span>'
                  : '<span class="failed-icon">&#10007;</span>'
              }
              ${capture.satelliteName}
              <span class="signal-badge signal-${signalType}">${signalType.toUpperCase()}</span>
            </h4>
            <div class="capture-meta">
              <span>${startTime.toLocaleString()}</span>
              <span>${duration} min</span>
              <span>${capture.maxElevation.toFixed(1)}° max</span>
            </div>
            ${
              capture.errorMessage ? `<div class="capture-error">${capture.errorMessage}</div>` : ''
            }
          </div>
        </div>
      `
      })
      .join('')
  }

  initGlobe() {
    if (this.globeInitialised || typeof Globe === 'undefined') return

    const container = document.getElementById('globe')
    if (!container) return

    const EARTH_RADIUS_KM = 6371

    this.globe = Globe()
      .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
      .bumpImageUrl('https://unpkg.com/three-globe/example/img/earth-topology.png')
      .backgroundImageUrl('https://unpkg.com/three-globe/example/img/night-sky.png')
      .showAtmosphere(true)
      .atmosphereColor('#3a228a')
      .atmosphereAltitude(0.25)
      .pointsData([])
      .pointAltitude((d) => d.altitude / EARTH_RADIUS_KM)
      .pointColor((d) => (d.signalType === 'sstv' ? '#8b5cf6' : '#3b82f6'))
      .pointRadius(0.8)
      .pointLabel(
        (d) =>
          `<div style="text-align:center"><b>${d.name}</b><br/>Alt: ${d.altitude.toFixed(0)} km</div>`
      )
      .pathsData([])
      .pathPoints('points')
      .pathPointLat((p) => p.lat)
      .pathPointLng((p) => p.lng)
      .pathColor((path) =>
        path.signalType === 'sstv' ? 'rgba(139,92,246,0.4)' : 'rgba(59,130,246,0.4)'
      )
      .pathStroke(1.5)
      .pathDashLength(0.01)
      .pathDashGap(0.004)
      .pathDashAnimateTime(100000)
      .labelsData([])
      .labelLat((d) => d.lat)
      .labelLng((d) => d.lng)
      .labelText((d) => d.name)
      .labelSize(1.2)
      .labelColor(() => '#22c55e')
      .labelDotRadius(0.3)
      .labelAltitude(0.01)(container)

    this.globe.pointOfView({ lat: 30, lng: 0, altitude: 2.5 })
    this.globeInitialised = true
  }

  updateGlobe(globeState) {
    if (!this.globe || !globeState) return

    const satellitePoints = globeState.satellites.map((sat) => ({
      lat: sat.latitude,
      lng: sat.longitude,
      altitude: sat.altitude,
      name: sat.name,
      signalType: sat.signalType,
    }))
    this.globe.pointsData(satellitePoints)

    const tracks = globeState.groundTracks.map((track) => ({
      points: track.points,
      name: track.name,
      signalType: track.signalType,
    }))
    this.globe.pathsData(tracks)

    if (globeState.station) {
      this.globe.labelsData([
        {
          name: 'Station',
          lat: globeState.station.latitude,
          lng: globeState.station.longitude,
        },
      ])
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const monitor = new SatelliteMonitor()
  monitor.connect()
})
