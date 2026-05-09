FROM python:3.11-slim

WORKDIR /app

# Install solc via solcx (multi-version Solidity compiler manager)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates git && \
    rm -rf /var/lib/apt/lists/*

# Install python-solc-x for multi-version solc management
RUN pip install --no-cache-dir \
    requests==2.31.0 \
    py-solc-x==2.0.4 \
    python-dotenv==1.0.0

COPY . /app/tools/source-fetch/

# Pre-install common Solc versions (0.6.x, 0.7.x, 0.8.x)
RUN python3 -c "from solcx import install_solc; install_solc('0.8.19'); install_solc('0.7.6'); install_solc('0.6.12')"

# Security: read-only filesystem except /tmp; no network after build
# Network is allowed for Etherscan/Sourcify API calls only (enforced at run.py invocation)

ENTRYPOINT ["python3", "-m", "tools.source-fetch.fetch"]
