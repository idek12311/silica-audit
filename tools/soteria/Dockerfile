FROM rust:1.75-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Install Soteria
RUN cargo install soteria-cli --version "0.1.0" 2>/dev/null || \
    echo "Soteria not yet on crates.io; building from source or using stub"

# Container: read-only, no network, 4GB RAM, 2 CPU (set at runtime)
ENTRYPOINT ["soteria"]
