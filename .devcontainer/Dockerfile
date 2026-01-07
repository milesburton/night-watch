# NOAA Satellite Capture - Development Container
FROM debian:bookworm

ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y \
    rtl-sdr \
    sox \
    git \
    curl \
    unzip \
    build-essential \
    cmake \
    libsndfile-dev \
    libpng-dev \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install aptdec for APT signal decoding
RUN git clone --recursive https://github.com/Xerbo/aptdec.git /tmp/aptdec \
    && cd /tmp/aptdec \
    && cmake -B build \
    && cmake --build build \
    && cp build/aptdec /usr/local/bin/ \
    && rm -rf /tmp/aptdec

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

# Create working directories
WORKDIR /workspace

# Default command
CMD ["bash"]
