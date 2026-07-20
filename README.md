# Covenant Escrow

Covenant Escrow is a grants funding platform for GenLayer. It acts as an AI-native trust layer for DAOs to pool funds, accept grant pitches, and automatically release funding based on AI-verified milestones.

## Architecture

This is a monorepo containing three layers:
- `contract/`: The GenLayer Intelligent Contract containing the core logic for DAOs, funding proposals, voting, and AI-powered verification.
- `backend/`: A Django indexer and API server that reads from the contract, caches state, and serves social features (like comments) and aggregated stats.
- `frontend/`: A Next.js (App Router) web application connecting to both the backend for fast UI/socials and the blockchain (via genlayer-js) for transactions.
