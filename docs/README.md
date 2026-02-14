# Night Watch Documentation

Welcome to the Night Watch satellite capture system documentation. Choose your path below:

## 🚀 Getting Started

- **[Quick Start Guide](QUICKSTART.md)** - Get the system running in 5 minutes
- **[API Reference](API.md)** - REST endpoints and WebSocket API
- **[Deployment Guide](DEPLOYMENT.md)** - Production setup (Docker, Pi, remote servers)

## 🛠️ Operations & Maintenance

- **[Maintenance Guide](MAINTENANCE.md)** - Retroactive decoding, cleanup, scheduling
- **[Environment Variables](reference/ENVIRONMENT-VARS.md)** - All config options explained

## 🏗️ Development & Architecture

- **[Dev Container Setup](dev-setup/DEV-CONTAINER.md)** - VS Code development environment
- **[Claude-Mem Integration](dev-setup/CLAUDE-MEM.md)** - Persistent memory across sessions
- **[Architecture Decisions](../github/adr/)** - Why we made major technical choices

## 📡 Technical Guides

- **[SSTV Decoder Setup](SSTV-SETUP.md)** - ISS & ground SSTV decoding
- **[Test Scripts](../scripts/README.md)** - Decoder testing and validation

## 📚 Additional Resources

### External Documentation (Don't Duplicate)

We link to external docs instead of duplicating them:

- **RTL-SDR Hardware**: [RTL-SDR.com](https://www.rtl-sdr.com/)
- **Docker**: [docs.docker.com](https://docs.docker.com/)
- **Docker Compose**: [docs.docker.com/compose](https://docs.docker.com/compose/)
- **SSTV Decoding**: [colaclanth/sstv](https://github.com/colaclanth/sstv#readme)
- **Satellite Tracking**: [Skyfield Documentation](https://rhodesmill.org/skyfield/)
- **SatDump Decoder**: [SatDump Wiki](https://github.com/SatDump/SatDump/wiki)

### Code Structure

- **Backend**: `src/backend/` — Node.js TypeScript service
- **Frontend**: `src/frontend/` — React + Vite web dashboard
- **Docker**: `docker/` — Production containers
- **Scripts**: `scripts/` — Utility scripts (decoding, deployment, testing)

## 🔗 Quick Links

- **GitHub**: [milesburton/night-watch](https://github.com/milesburton/night-watch)
- **Issues**: [Bug reports & feature requests](https://github.com/milesburton/night-watch/issues)
- **Releases**: [GitHub Releases](https://github.com/milesburton/night-watch/releases)

---

**Can't find what you're looking for?** Open an issue on GitHub or check the code comments.
