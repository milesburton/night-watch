# Quick Start Guide

This guide helps you get started with Night Watch satellite capture system.

## Daily Operations

### View Live Captures

Visit your Pi's web interface:
```
http://192.168.1.206
```

### Check System Status

```bash
# SSH into the Pi
ssh miles@192.168.1.206

# Check running containers
docker ps

# View recent logs
docker logs rfcapture --tail 50 --follow

# Check disk space
df -h
```

### View Captured Images

Images are saved in `/app/images/` inside the container:

```bash
# List recent images
docker exec rfcapture ls -lht /app/images/ | head -20

# Copy an image to view locally
docker cp rfcapture:/app/images/NOAA-15_2026-02-03T07-05-39-a.png ./
```

## Maintenance Commands

### Decode Existing Recordings

```bash
# Decode all unprocessed recordings
docker compose -f docker/compose.yaml exec rfcapture bun run maintenance:decode

# Clean up failed recordings
docker compose -f docker/compose.yaml exec rfcapture bun run maintenance:cleanup

# Do both
docker compose -f docker/compose.yaml exec rfcapture bun run maintenance:all
```

**Note:** Maintenance runs automatically daily at 3 AM via cron job.

### Check Next Satellite Passes

```bash
# View upcoming passes
docker compose -f docker/compose.yaml exec rfcapture bun run predict

# View system status
docker compose -f docker/compose.yaml exec rfcapture bun run status
```

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker logs rfcapture

# Restart container
cd ~/noaa-satellite-capture
docker compose -f docker/compose.yaml restart

# Rebuild if needed
docker compose -f docker/compose.yaml build --no-cache
docker compose -f docker/compose.yaml up -d --force-recreate
```

### No Images Being Decoded

```bash
# Check if decoders are installed
docker exec rfcapture which aptdec
docker exec rfcapture python3 -c "import sstv; print('SSTV OK')"

# Run manual decode test
docker exec rfcapture aptdec -i a -d /app/images /app/recordings/NOAA-15_*.wav

# Check maintenance logs
tail -f /var/log/satellite-maintenance.log
```

### Disk Space Issues

```bash
# Check disk usage
docker exec rfcapture du -sh /app/recordings /app/images

# Clean up old recordings
docker exec rfcapture find /app/recordings -name "*.wav" -mtime +30 -delete

# Clean up failed recordings
docker compose -f docker/compose.yaml exec rfcapture bun run maintenance:cleanup
```

## Common Tasks

### Update the System

```bash
cd ~/noaa-satellite-capture

# Pull latest code
git pull origin main

# Rebuild and restart
docker compose -f docker/compose.yaml build
docker compose -f docker/compose.yaml up -d --force-recreate
```

### View Maintenance History

```bash
# View full maintenance log
less /var/log/satellite-maintenance.log

# View recent maintenance runs
tail -100 /var/log/satellite-maintenance.log | grep "complete"

# Count decoded images
docker exec rfcapture ls /app/images/*.png | wc -l
```

### Manually Trigger Maintenance

```bash
# SSH into Pi
ssh miles@192.168.1.206

# Run maintenance
cd ~/noaa-satellite-capture
docker compose -f docker/compose.yaml exec -T rfcapture bun run maintenance:all
```

## Important Files

| Location | Description |
|----------|-------------|
| `/app/recordings/` | Raw WAV audio recordings |
| `/app/images/` | Decoded satellite images |
| `/app/data/captures.db` | SQLite database |
| `/var/log/satellite-maintenance.log` | Maintenance log |
| `~/noaa-satellite-capture/` | Project directory |

## Next Steps

- [SSTV Setup Guide](SSTV-SETUP.md) - Enable ISS SSTV decoding
- [Maintenance Guide](MAINTENANCE.md) - Detailed maintenance procedures
- [Configuration](../README.md) - System configuration options

## Getting Help

- Check logs: `docker logs rfcapture --tail 100`
- View issues: https://github.com/milesburton/noaa-satellite-capture/issues
- Documentation: `docs/` directory
