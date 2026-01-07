class SatelliteMonitor {
  constructor() {
    this.ws = null
    this.state = null
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 20
    this.reconnectDelay = 1000
    this.countdownInterval = null
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
        break
      case 'pass_complete':
        this.handlePassComplete(data.result)
        break
      case 'passes_updated':
        this.updatePassesList(data.passes)
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
    this.startCountdown()
  }

  updateStatus(status) {
    const badge = document.getElementById('status-badge')
    const progressSection = document.getElementById('progress-section')
    const currentPassEl = document.getElementById('current-pass')

    const statusMap = {
      idle: { text: 'Standby', class: 'status-idle' },
      waiting: { text: 'Waiting for Pass', class: 'status-waiting' },
      capturing: { text: 'Capturing', class: 'status-capturing' },
      decoding: { text: 'Decoding Images', class: 'status-decoding' },
    }

    const config = statusMap[status] || statusMap.idle
    badge.textContent = config.text
    badge.className = `status-badge ${config.class}`

    // Show/hide progress section
    if (status === 'capturing') {
      progressSection.classList.remove('hidden')
    } else {
      progressSection.classList.add('hidden')
    }

    // Show/hide current pass info
    if (status === 'capturing' || status === 'decoding') {
      currentPassEl.classList.remove('hidden')
    } else {
      currentPassEl.classList.add('hidden')
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
    document.getElementById('current-elevation').textContent = `${pass.maxElevation.toFixed(1)}°`
  }

  updateNextPass(pass) {
    const satelliteEl = document.getElementById('next-satellite')
    const timeEl = document.getElementById('next-time')

    if (pass) {
      satelliteEl.textContent = pass.satellite.name
      const passTime = new Date(pass.aos)
      timeEl.textContent = passTime.toLocaleString()
      if (this.state) {
        this.state.nextPass = pass
      }
    } else {
      satelliteEl.textContent = 'No upcoming passes'
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
      tbody.innerHTML = '<tr><td colspan="4" class="empty-message">No upcoming passes</td></tr>'
      return
    }

    tbody.innerHTML = passes
      .map((pass) => {
        const aos = new Date(pass.aos)
        const duration = Math.round(pass.duration / 60)
        return `
        <tr>
          <td>${pass.satellite.name}</td>
          <td>${aos.toLocaleString()}</td>
          <td>${duration} min</td>
          <td>${pass.maxElevation.toFixed(1)}°</td>
        </tr>
      `
      })
      .join('')

    // Update next pass
    if (passes.length > 0) {
      this.updateNextPass(passes[0])
    }

    if (this.state) {
      this.state.upcomingPasses = passes
    }
  }

  handlePassComplete(result) {
    this.updateStatus('idle')
    document.getElementById('current-pass').classList.add('hidden')
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

        // Get composite image if available
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
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  const monitor = new SatelliteMonitor()
  monitor.connect()
})
