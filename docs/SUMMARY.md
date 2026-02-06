# Session Summary - SSTV Fix & Maintenance Setup

**Date:** 2026-02-03
**System:** Night Watch Satellite Capture (Raspberry Pi 4/5)

## What We Accomplished

### 1. ✅ Fixed SSTV Decoder TTY Issue

**Problem:** SSTV decoder failed with `OSError: Inappropriate ioctl for device` when running in Docker.

**Solution:** Created Python wrapper ([scripts/sstv-decode-wrapper.py](../scripts/sstv-decode-wrapper.py)) that:
- Patches `os.get_terminal_size()` to avoid TTY errors
- Enables SSTV decoding in non-interactive environments
- Automatically used by the SSTV decoder integration

**Files Modified:**
- `scripts/sstv-decode-wrapper.py` (new)
- `src/backend/capture/decoders/sstv-decoder.ts` (updated to use wrapper)

### 2. ✅ Set Up Automatic Maintenance

**Created:** [scripts/deploy/setup-maintenance-cron.sh](../scripts/deploy/setup-maintenance-cron.sh)

**Schedule:** Daily at 3:00 AM

**Actions Performed:**
- Decodes all unprocessed recordings
- Cleans up failed recordings (<10KB)
- Logs to `/var/log/satellite-maintenance.log`

**Cron Entry:**
```bash
0 3 * * * cd /home/miles/noaa-satellite-capture && docker compose -f docker/compose.yaml exec -T rfcapture npm run maintenance:all >> /var/log/satellite-maintenance.log 2>&1
```

### 3. ✅ Updated Documentation

**Created:**
- [docs/QUICKSTART.md](QUICKSTART.md) - Quick reference guide
- [docs/SUMMARY.md](SUMMARY.md) - This document

**Updated:**
- [docs/SSTV-SETUP.md](SSTV-SETUP.md) - Added TTY fix section
- [docs/MAINTENANCE.md](MAINTENANCE.md) - Added automated setup instructions

### 4. ✅ Deployed to Production

**System:** Pi at 192.168.1.206

**Deployed Components:**
- SSTV decoder Python wrapper
- Maintenance cron job
- Updated scripts directory

## Current Status

### System Stats (as of 2026-02-03)

| Metric | Count |
|--------|-------|
| Total Recordings | 461 (>1MB) |
| Decoded Images | 68 PNG files |
| Failed Recordings | 1 (<100KB) |
| ISS SSTV Recordings | 10 (no signal detected) |
| 2m SSTV Recordings | ~400 (no signal detected) |

### Why No SSTV Signals?

**ISS SSTV:** Transmits only during special events (few times per year)
- Check schedule: https://www.ariss.org/current-sstv-information.html
- Frequency: 145.800 MHz
- Modes: Robot 36, PD120

**2m Ground SSTV:** Amateur radio operators transmit sporadically
- Frequencies: 144.5 MHz, 145.5 MHz
- Most active on weekends

## Maintenance Commands

### Manual Maintenance

```bash
# Decode all recordings
docker compose -f docker/compose.yaml exec rfcapture npm run maintenance:decode

# Clean up failed recordings
docker compose -f docker/compose.yaml exec rfcapture npm run maintenance:cleanup

# Do both
docker compose -f docker/compose.yaml exec rfcapture npm run maintenance:all
```

### Check Maintenance Status

```bash
# View cron job
crontab -l | grep maintenance

# View logs
tail -f /var/log/satellite-maintenance.log

# Count images
docker exec rfcapture ls /app/images/*.png | wc -l
```

## Pending Items

### Context Retention (claude-mem)

**Status:** No tool called "claude-mem" exists

**Alternatives:**
1. **This conversation** - Already saved automatically
2. **Documentation** - All info in `docs/` directory
3. **Git history** - Track changes with commits
4. **Project notes** - Add to README or create wiki

**Recommendation:** Use git commit messages and maintain docs for important info.

### Future Work

1. **Wait for ISS SSTV Event** - Monitor ARISS schedule
2. **Test with Sample SSTV** - Download working sample file
3. **Optimize Maintenance** - Skip SSTV decoding if no events scheduled
4. **Add Health Checks** - Monitor decoder availability

## Files Changed This Session

```
Created:
  scripts/sstv-decode-wrapper.py
  scripts/deploy/setup-maintenance-cron.sh
  docs/QUICKSTART.md
  docs/SUMMARY.md

Modified:
  src/backend/capture/decoders/sstv-decoder.ts
  docs/SSTV-SETUP.md
  docs/MAINTENANCE.md
  package.json (already had scripts)
```

## Quick Reference Commands

### System Status
```bash
# View recent logs
docker logs rfcapture --tail 50 --follow

# Check disk space
docker exec rfcapture du -sh /app/{recordings,images,data}

# View running processes
docker exec rfcapture ps aux
```

### Upcoming Passes
```bash
# Next satellite passes
docker compose -f docker/compose.yaml exec rfcapture npm run predict

# System status
docker compose -f docker/compose.yaml exec rfcapture npm run status
```

### Image Management
```bash
# List recent images
docker exec rfcapture ls -lht /app/images/ | head -20

# Copy image to local
docker cp rfcapture:/app/images/NOAA-15_2026-02-03T07-05-39-a.png ./

# View all images
http://192.168.1.206/
```

## Support Resources

- **Documentation:** `/workspaces/noaa-satellite-capture/docs/`
- **Issues:** https://github.com/milesburton/noaa-satellite-capture/issues
- **Logs:** `/var/log/satellite-maintenance.log`
- **Web UI:** http://192.168.1.206

## Notes

- Maintenance runs automatically daily at 3 AM
- SSTV decoder now works in non-interactive environments
- All 461 recordings will be processed to check for decodable signals
- ISS SSTV requires an active event to capture images
- Ground SSTV requires active amateur transmissions

---

**Next ISS Pass Check:**
```bash
docker compose -f docker/compose.yaml exec rfcapture npm run predict | grep ISS
```

**Next Maintenance Run:** Tonight at 3:00 AM (automatic)
