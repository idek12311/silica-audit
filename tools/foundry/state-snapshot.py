"""
State snapshot utilities for Foundry fork tests.

Captures pre/post state of EVM accounts at a specific block.
Used to populate Finding.evidence[].kind = 'state-assertion'.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

import requests

logger = logging.getLogger(__name__)


@dataclass
class StateSnapshot:
    block: int
    chain_id: int
    account_states: dict[str, dict[str, Any]]  # address → {balance, nonce, code_hash}


def capture_snapshot(addresses: list[str], rpc_url: str, block: int) -> StateSnapshot:
    """
    Captures the ETH balance and nonce for a list of addresses at `block`.
    Used to construct before/after state assertions in Finding evidence.
    """
    block_hex = hex(block)
    states: dict[str, dict[str, Any]] = {}

    for address in addresses:
        address = address.lower()
        try:
            balance = _eth_call(rpc_url, "eth_getBalance", [address, block_hex])
            nonce = _eth_call(rpc_url, "eth_getTransactionCount", [address, block_hex])
            states[address] = {
                "balance_wei": int(balance, 16),
                "nonce": int(nonce, 16),
            }
        except Exception as exc:
            logger.warning("Could not snapshot %s at block %d: %s", address, block, exc)

    return StateSnapshot(block=block, chain_id=1, account_states=states)


def diff_snapshots(before: StateSnapshot, after: StateSnapshot) -> dict[str, Any]:
    """
    Computes the state delta between two snapshots.
    Returns a dict suitable for Finding.evidence[].kind = 'state-assertion'.
    """
    before_view: dict[str, Any] = {}
    after_view: dict[str, Any] = {}
    delta_view: dict[str, Any] = {}

    all_addresses = set(before.account_states) | set(after.account_states)
    for addr in all_addresses:
        b = before.account_states.get(addr, {})
        a = after.account_states.get(addr, {})
        before_view[addr] = b
        after_view[addr] = a
        if b and a:
            bal_delta = a.get("balance_wei", 0) - b.get("balance_wei", 0)
            delta_view[addr] = {"balance_wei_delta": bal_delta}

    return {
        "before": before_view,
        "after": after_view,
        "delta": delta_view,
    }


def _eth_call(rpc_url: str, method: str, params: list[Any]) -> str:
    payload = {
        "jsonrpc": "2.0",
        "method": method,
        "params": params,
        "id": 1,
    }
    resp = requests.post(rpc_url, json=payload, timeout=15)
    resp.raise_for_status()
    data = resp.json()
    if "error" in data:
        raise ValueError(f"RPC error: {data['error']}")
    result: str = data.get("result", "0x0")
    return result
