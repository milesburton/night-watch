# Night Watch API

Base URL: `http://<host>:<port>`

## REST Endpoints

### System

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/status` | System state, current/next pass, doppler |
| GET | `/api/version` | Version info |
| GET | `/api/config` | Station location, SDR settings |
| GET | `/api/globe` | Satellite positions and ground tracks |

### Passes & Captures

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/passes` | Upcoming satellite passes |
| GET | `/api/captures?limit=50&offset=0` | Capture history |
| GET | `/api/summary` | Capture statistics (total, success, failed) |
| GET | `/api/images/:filename` | Decoded satellite images |

### SSTV Control

| Method | Path | Body | Description |
|--------|------|------|-------------|
| GET | `/api/sstv/status` | - | SSTV capture status |
| POST | `/api/sstv/toggle` | `{ enabled?: boolean }` | Toggle ISS SSTV |
| POST | `/api/sstv/ground-scan/toggle` | `{ enabled?: boolean }` | Toggle 2M scanning |

### FFT Spectrum

| Method | Path | Body | Description |
|--------|------|------|-------------|
| GET | `/api/fft/status` | - | Stream status |
| POST | `/api/fft/start` | `{ frequency?, bandwidth?, gain?, fftSize?, updateRate? }` | Start FFT |
| POST | `/api/fft/stop` | - | Stop FFT |

### Notch Filters

| Method | Path | Body | Description |
|--------|------|------|-------------|
| GET | `/api/fft/notch` | - | List filters |
| POST | `/api/fft/notch` | `{ frequency, width? }` | Add filter |
| DELETE | `/api/fft/notch` | `{ frequency }` | Remove filter |
| POST | `/api/fft/notch/toggle` | `{ frequency, enabled }` | Enable/disable |
| POST | `/api/fft/notch/clear` | - | Clear all |

## WebSocket

Connect: `ws://<host>:<port>/ws`

### Server Messages

| Type | Data | Description |
|------|------|-------------|
| `init` | state, globe, fft | Initial state on connect |
| `status_change` | status | System status update |
| `capture_progress` | progress, elapsed, total | Recording progress |
| `pass_start` | pass | Pass beginning |
| `pass_complete` | result | Pass finished |
| `passes_updated` | passes[] | New predictions |
| `sstv_status` | status | SSTV state change |
| `satellite_positions` | globe | Position update |
| `scanning_frequency` | frequency, name | SSTV scanner tuned to new frequency |
| `fft_data` | data | Live spectrum frame |
| `fft_history` | data[] | Buffered FFT frames (sent on subscribe) |
| `fft_subscribed` | running, config, error | Subscription confirmed |
| `fft_unsubscribed` | - | Unsubscription confirmed |
| `fft_error` | error | FFT stream error |

### Client Messages

| Type | Data | Description |
|------|------|-------------|
| `fft_subscribe` | frequency? | Subscribe to FFT stream |
| `fft_unsubscribe` | - | Unsubscribe |
| `fft_set_frequency` | frequency | Change FFT frequency |

## Response Types

### SatellitePass
```json
{
  "satellite": { "name": "NOAA-19", "frequency": 137100000, "signalType": "apt" },
  "aos": "2024-01-15T10:30:00Z",
  "los": "2024-01-15T10:45:00Z",
  "maxElevation": 45.2,
  "duration": 900
}
```

### FFTData
```json
{
  "timestamp": 1705312200000,
  "centerFreq": 137500000,
  "bins": [-50.2, -48.1, ...],
  "minPower": -60.5,
  "maxPower": -35.2
}
```
