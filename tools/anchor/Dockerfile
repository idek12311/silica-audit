FROM ubuntu:22.04

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates git nodejs npm && \
    rm -rf /var/lib/apt/lists/*

# Install Solana CLI
RUN sh -c "$(curl -sSfL https://release.solana.com/v1.18.0/install)"
ENV PATH="/root/.local/share/solana/install/active_release/bin:${PATH}"

# Install Anchor CLI
RUN npm install -g @coral-xyz/anchor-cli@0.29.0

# Install Rust for program builds
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# Install BPF toolchain
RUN rustup component add rust-std --target bpfel-unknown-none 2>/dev/null || true

ENTRYPOINT ["anchor"]
