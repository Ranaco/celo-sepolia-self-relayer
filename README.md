# Self Protocol Relayer

A blockchain relayer service that monitors Self Protocol verification events on Celo Mainnet and updates the CentralWallet contract on Sepolia testnet.

## Overview

This service bridges verification data between two blockchain networks:
- **Source**: ProofOfHumanOApp contract on Celo Mainnet
- **Target**: CentralWallet contract on Sepolia testnet

## Features

- 🔄 **Automatic Synchronization**: Runs every 10 seconds to fetch new verification events
- 🔐 **Secure**: Uses private keys for transaction signing
- 📊 **Monitoring**: REST API endpoints for status and statistics
- 🚀 **Production Ready**: Error handling, logging, and health checks
- 🏗️ **Monorepo Integration**: Part of the project-py Turbo monorepo

## API Endpoints

- `GET /` - Dashboard with real-time status
- `GET /status` - Current relayer status and statistics
- `GET /stats` - Detailed statistics
- `GET /health` - Health check with system information
- `POST /trigger-relay` - Manual trigger for testing

## Configuration

Environment variables in `.env`:

```env
# Blockchain Configuration
ETHERSCAN_API_KEY=your_etherscan_api_key
PROOF_OF_HUMAN_CONTRACT=0x66624Dd25cc0bc9A9D6594F1e3c217d68EEb8f7c
CENTRAL_WALLET_CONTRACT=0x697437674377E0C776DD9c978f25bDD0d454521A

# Network RPCs
CELO_RPC=https://forno.celo.org
SEPOLIA_RPC=https://eth-sepolia.g.alchemy.com/v2/demo

# Private Key for the relayer wallet
RELAYER_PRIVATE_KEY=0x...

# Relayer Configuration
RELAYER_INTERVAL_MS=10000

# Server Configuration
PORT=8001
HOST=localhost
```

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Start production server
npm start
```

## Turbo Commands

From the monorepo root:

```bash
# Run relayer in development
turbo run dev --filter=@project-py/relayer

# Build relayer
turbo run build --filter=@project-py/relayer

# Run all apps in parallel
turbo run dev
```

## Contract Information

- **ProofOfHumanOApp**: `0x66624Dd25cc0bc9A9D6594F1e3c217d68EEb8f7c` (Celo Mainnet)
- **CentralWallet**: `0x697437674377E0C776DD9c978f25bDD0d454521A` (Sepolia Testnet)

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Celo Mainnet  │    │   Relayer       │    │ Sepolia Testnet │
│                 │    │                 │    │                 │
│ ProofOfHuman    │───▶│ Express Server  │───▶│ CentralWallet   │
│ OApp Contract   │    │ + Blockchain    │    │ Contract        │
│                 │    │   Service       │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

The relayer continuously monitors verification events from the Self Protocol contract and ensures that verified users can deposit funds in the CentralWallet contract.