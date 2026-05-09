FROM ghcr.io/foundry-rs/foundry:latest

# Install Python for the runner wrapper
USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip && \
    rm -rf /var/lib/apt/lists/*

RUN pip3 install --no-cache-dir requests==2.31.0

WORKDIR /audit

# Container security: no-new-privileges, non-root if possible
# Network: controlled at run.py invocation (only RPC egress allowed)
# cgroups: 8GB RAM, 4 CPU set at docker run time
# Filesystem: project mounted read-only at /audit/project, output at /audit/output

ENTRYPOINT ["forge"]
