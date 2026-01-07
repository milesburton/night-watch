FROM debian:bookworm

ENV DEBIAN_FRONTEND=noninteractive

RUN rm -rf /var/lib/apt/lists/* \
    && apt-get clean \
    && apt-get update --allow-insecure-repositories \
    && apt-get install -y --allow-unauthenticated ca-certificates gnupg \
    && mkdir -p /etc/apt/keyrings \
    && gpg --keyserver keyserver.ubuntu.com --recv-keys 6ED0E7B82643E131 78DBA3BC47EF2265 F8D2585B8783D481 54404762BBB6E853 BDE6D2B9216EC7A8 \
    && gpg --export 6ED0E7B82643E131 78DBA3BC47EF2265 F8D2585B8783D481 54404762BBB6E853 BDE6D2B9216EC7A8 | tee /etc/apt/trusted.gpg.d/debian.gpg > /dev/null \
    && apt-get update \
    && apt-get install -y \
    rtl-sdr \
    sox \
    git \
    curl \
    unzip \
    build-essential \
    cmake \
    libsndfile-dev \
    libpng-dev \
    && rm -rf /var/lib/apt/lists/*

RUN git clone --recursive https://github.com/Xerbo/aptdec.git /tmp/aptdec \
    && cd /tmp/aptdec \
    && cmake -B build \
    && cmake --build build \
    && cp build/aptdec /usr/local/bin/ \
    && rm -rf /tmp/aptdec

RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

WORKDIR /workspace

CMD ["bash"]
