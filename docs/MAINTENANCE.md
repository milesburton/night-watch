# Maintenance Guide

This guide covers maintenance tasks for the Night Watch satellite capture system.

## Retroactive Decoding

If you have recordings that were captured but never decoded (or failed to decode), you can retroactively decode them.

### On the Host System

```bash
# Decode all recordings that don't have images
npm run maintenance:decode

# Or run directly
npm run src/backend/cli/commands/maintenance.ts --decode
```

### Inside Docker Container

```bash
# Enter the container
docker compose -f docker/compose.yaml exec rfcapture sh

# Run maintenance
npm run maintenance:decode
```

### What it does:

1. Scans the recordings directory (`/app/recordings/`)
2. Finds WAV files larger than 1MB without decoded images
3. Attempts to decode them using the appropriate decoder (aptdec for NOAA, sstv for ISS)
4. Adds successfully decoded images to the database
5. Makes them visible in the gallery

## Cleanup Failed Recordings

Small WAV files (typically 44 bytes) are failed recordings where no signal was captured. These can be safely deleted.

### On the Host System

```bash
# Clean up failed recordings
npm run maintenance:cleanup

# Or run directly
npm run src/backend/cli/commands/maintenance.ts --cleanup
```

### Inside Docker Container

```bash
docker compose -f docker/compose.yaml exec rfcapture npm run maintenance:cleanup
```

### What it does:

1. Finds WAV files smaller than 10KB (definitely failed)
2. Deletes them to free up disk space
3. Reports how many files were cleaned up

## Do Everything at Once

```bash
# Decode + cleanup
npm run maintenance:all

# Or
npm run src/backend/cli/commands/maintenance.ts --all
```

## Manual Cleanup

If you want to manually clean up failed recordings:

```bash
# On host (if volumes are mounted)
find ./recordings -name "*.wav" -size -10k -delete

# Inside Docker container
docker compose -f docker/compose.yaml exec rfcapture sh -c "find /app/recordings -name '*.wav' -size -10k -delete"
```

## Checking What Will Be Affected

Before running cleanup, you can see what files will be deleted:

```bash
# List small WAV files
find ./recordings -name "*.wav" -size -10k -ls

# Count them
find ./recordings -name "*.wav" -size -10k | wc -l

# See total size
find ./recordings -name "*.wav" -size -10k -exec du -ch {} + | tail -1
```

## Example Output

```
$ npm run maintenance:all

Found 47 WAV files in recordings directory

=== Retroactive Decoding ===
Found 0 recordings not in database
Found 12 recordings without decoded images
Decoding NOAA-19_2026-01-28T21-18-50.wav (16.2MB)...
✓ Decoded 3 images from NOAA-19_2026-01-28T21-18-50.wav
Added 3 images to database for NOAA-19_2026-01-28T21-18-50.wav
...
✓ Decoded 12 recordings

=== Cleanup Failed Recordings ===
Found 23 small/failed recordings to clean up
Deleted failed recording: NOAA-19_2026-01-28T09-47-47.wav (44 bytes)
Deleted failed recording: NOAA-19_2026-01-28T11-28-47.wav (44 bytes)
...
✓ Deleted 23 failed recording files

✓ Maintenance complete
```

## Scheduling Automatic Maintenance

### Automated Setup (Recommended)

Use the provided script to set up automatic maintenance:

```bash
# Run the setup script
bash scripts/deploy/setup-maintenance-cron.sh
```

This will:
- Create a cron job to run daily at 3 AM
- Set up logging to `/var/log/satellite-maintenance.log`
- Verify the cron job was added successfully

### Manual Setup

If you prefer to set it up manually:

```bash
# Edit crontab
crontab -e

# Add this line to run maintenance daily at 3 AM
0 3 * * * cd /home/miles/noaa-satellite-capture && docker compose -f docker/compose.yaml exec -T rfcapture npm run maintenance:all >> /var/log/satellite-maintenance.log 2>&1
```

### Check Cron Status

```bash
# View current cron jobs
crontab -l

# View maintenance log
tail -f /var/log/satellite-maintenance.log

# Test maintenance manually
cd ~/noaa-satellite-capture && docker compose -f docker/compose.yaml exec -T rfcapture npm run maintenance:all
```

## Troubleshooting

### "No decoder available for apt"

Make sure `aptdec` is installed in the container:

```bash
docker compose -f docker/compose.yaml exec rfcapture which aptdec
```

### "Failed to decode" errors

Check if the WAV file is valid:

```bash
# Check file size
ls -lh /app/recordings/NOAA-19_2026-01-28T21-18-50.wav

# Try manual decode
docker compose -f docker/compose.yaml exec rfcapture \
  aptdec -i a -d /app/images /app/recordings/NOAA-19_2026-01-28T21-18-50.wav
```

### Database permissions

If you get database errors, ensure the database file is writable:

```bash
docker compose -f docker/compose.yaml exec rfcapture ls -l /app/data/captures.db
```
