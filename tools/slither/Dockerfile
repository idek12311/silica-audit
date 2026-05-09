FROM python:3.11-slim

WORKDIR /app

# Install Slither and its dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
    slither-analyzer==0.10.0 \
    solc-select==1.0.4

# Install default Solc versions
RUN solc-select install 0.8.19 && \
    solc-select install 0.8.17 && \
    solc-select install 0.7.6 && \
    solc-select install 0.6.12 && \
    solc-select use 0.8.19

# Container runs with read-only FS; /tmp is a tmpfs mount
# Network: none (static analysis only — see run.py --network none)
# cgroups: 4GB RAM, 2 CPU (set at docker run time)

ENTRYPOINT ["slither"]
