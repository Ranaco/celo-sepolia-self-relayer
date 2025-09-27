const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

class CrossChainSyncService {
  constructor(logger, blockchainService) {
    this.logger = logger;
    this.blockchainService = blockchainService;

    // Track addresses that have been processed
    this.syncedAddresses = new Set();
    this.knownAddresses = new Set();
  }

  // Helper methods to access blockchain service components
  get celoProvider() {
    return this.blockchainService.celoProvider;
  }

  get sepoliaProvider() {
    return this.blockchainService.sepoliaProvider;
  }

  get celoContract() {
    return this.blockchainService.proofOfHumanContract;
  }

  get sepoliaContract() {
    return this.blockchainService.centralWalletContract;
  }

  get relayerWallet() {
    return this.blockchainService.wallet;
  }

  /**
   * Read verification status directly from Celo contract
   */
  async readVerificationFromCelo(address) {
    try {
      this.logger.debug(`Reading Celo verification for ${address}...`);
      const verificationData = await this.celoContract.verifiedHumans(address);
      
      // The ProofOfHuman contract returns a struct with verification details
      // Based on the ABI, it has userAddress, timestamp, gender, nationality, minimumAge
      if (verificationData && verificationData.userAddress && verificationData.userAddress !== ethers.ZeroAddress) {
        this.logger.debug(`Address ${address} is verified on Celo`, {
          timestamp: verificationData.timestamp?.toString(),
          minimumAge: verificationData.minimumAge?.toString()
        });
        return true;
      }
      
      this.logger.debug(`Address ${address} is NOT verified on Celo`);
      return false;
    } catch (error) {
      this.logger.error(`Error reading verification from Celo for ${address}:`, error.message);
      return false;
    }
  }

  /**
   * Check if address is already verified on Sepolia
   */
  async isVerifiedOnSepolia(address) {
    try {
      this.logger.debug(`Reading Sepolia verification for ${address}...`);
      // Use the correct method name from CentralWallet contract
      const result = await this.sepoliaContract.isHumanVerified(address);
      this.logger.debug(`Address ${address} verification on Sepolia: ${result}`);
      return result;
    } catch (error) {
      this.logger.error(`Error checking Sepolia verification for ${address}:`, error.message);
      this.logger.debug('Full error details:', error);
      return false;
    }
  }

  /**
   * Update verification status on Sepolia
   */
  async updateVerificationOnSepolia(address, isVerified) {
    try {
      this.logger.info(`Updating verification for ${address} to ${isVerified} on Sepolia...`);
      
      const gasPrice = await this.sepoliaProvider.getFeeData();
      const tx = await this.sepoliaContract.setVerifiedHuman(address, isVerified, {
        gasLimit: 100000,
        maxFeePerGas: gasPrice.maxFeePerGas,
        maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas
      });
      
      this.logger.info(`Transaction sent: ${tx.hash}`);
      const receipt = await tx.wait();
      this.logger.info(`Verification updated for ${address}. Block: ${receipt.blockNumber}`);
      
      return tx.hash;
    } catch (error) {
      this.logger.error(`Error updating verification for ${address}:`, error);
      throw error;
    }
  }

  /**
   * Batch update multiple addresses on Sepolia (using individual calls)
   */
  async batchUpdateVerifications(addressesData) {
    if (addressesData.length === 0) {
      this.logger.info('No addresses to update in batch');
      return;
    }

    try {
      this.logger.info(`Updating ${addressesData.length} addresses on Sepolia (individual calls)...`);
      
      const results = [];
      for (const data of addressesData) {
        try {
          const gasPrice = await this.sepoliaProvider.getFeeData();
          const tx = await this.sepoliaContract.setVerifiedHuman(data.address, data.isVerified, {
            gasLimit: 100000,
            maxFeePerGas: gasPrice.maxFeePerGas,
            maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas
          });
          
          this.logger.info(`Transaction sent for ${data.address}: ${tx.hash}`);
          const receipt = await tx.wait();
          this.logger.info(`Verification updated for ${data.address}. Block: ${receipt.blockNumber}`);
          
          results.push(tx.hash);
        } catch (error) {
          this.logger.error(`Error updating verification for ${data.address}:`, error.message);
          throw error;
        }
      }
      
      this.logger.info(`All ${addressesData.length} addresses updated successfully`);
      return results;
    } catch (error) {
        console.log(error)
      this.logger.error('Error in batch update:', error);
      throw error;
    }
  }

  /**
   * Discover addresses to check by monitoring events
   */
  async discoverAddresses() {
    try {
      this.logger.info('Discovering addresses from Celo events...');
      
      // Get verification events from the last 2000 blocks
      const currentBlock = await this.celoProvider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 2000);
      
      const filter = this.celoContract.filters.VerificationCompleted();
      const events = await this.celoContract.queryFilter(filter, fromBlock, 'latest');
      
      const discoveredAddresses = new Set();
      for (const event of events) {
        if (event.args && event.args.userAddress) {
          discoveredAddresses.add(event.args.userAddress.toLowerCase());
        }
      }
      
      // Add to known addresses
      discoveredAddresses.forEach(addr => this.knownAddresses.add(addr));
      
      this.logger.info(`Discovered ${discoveredAddresses.size} addresses from recent events`);
      this.logger.info(`Total known addresses: ${discoveredAddresses}`);
      return Array.from(discoveredAddresses);
      
    } catch (error) {
        console.log(error)
      this.logger.error('Error discovering addresses:', error);
      return [];
    }
  }

  /**
   * Main sync process
   */
  async syncVerifications(addressesToCheck = []) {
    try {
      this.logger.info('Starting cross-chain verification sync...');
      
      // If no addresses provided, discover them from events
      if (addressesToCheck.length === 0) {
        addressesToCheck = await this.discoverAddresses();
      }

      if (addressesToCheck.length === 0) {
        this.logger.info('No addresses to sync');
        return { synced: 0, skipped: 0, errors: 0 };
      }

      const addressUpdates = [];
      let synced = 0;
      let skipped = 0;
      let errors = 0;

      // Check each address
      for (const address of addressesToCheck) {
        try {
          // Skip if already synced recently
          if (this.syncedAddresses.has(address.toLowerCase())) {
            this.logger.info(`Skipping ${address}: already synced recently`);
            skipped++;
            continue;
          }

          const normalizedAddress = ethers.getAddress(address); // Normalize address

          // New policy: mark any detected address as verified on Sepolia
          // regardless of its status on the Celo contract.
          const isVerified = true;

          // Force update regardless of current Sepolia status
          addressUpdates.push({
            address: normalizedAddress,
            isVerified
          });

          this.logger.info(`Forcing sync for ${normalizedAddress}: setting Sepolia to true (policy: verify all detected)`)

          // Mark as synced
          this.syncedAddresses.add(normalizedAddress.toLowerCase());

        } catch (error) {
          this.logger.error(`Error processing address ${address}:`, error);
          errors++;
        }
      }

      // Perform batch update if there are changes
      if (addressUpdates.length > 0) {
        await this.batchUpdateVerifications(addressUpdates);
        synced = addressUpdates.length;
      }

      this.logger.info(`Sync completed: ${synced} synced, ${skipped} skipped, ${errors} errors`);
      return { synced, skipped, errors };

    } catch (error) {
      this.logger.error('Error in sync process:', error);
      throw error;
    }
  }

  /**
   * Get service status
   */
  async getStatus() {
    try {
      const [celoNetwork, sepoliaNetwork, balance] = await Promise.all([
        this.celoProvider.getNetwork(),
        this.sepoliaProvider.getNetwork(),
        this.sepoliaProvider.getBalance(this.relayerWallet.address)
      ]);

      return {
        celo: {
          chainId: celoNetwork.chainId.toString(),
          contractAddress: process.env.PROOF_OF_HUMAN_CONTRACT
        },
        sepolia: {
          chainId: sepoliaNetwork.chainId.toString(),
          contractAddress: process.env.CENTRAL_WALLET_CONTRACT,
          relayerAddress: this.relayerWallet.address,
          relayerBalance: ethers.formatEther(balance)
        },
        syncedAddresses: this.syncedAddresses.size,
        knownAddresses: this.knownAddresses.size
      };
    } catch (error) {
      this.logger.error('Error getting status:', error);
      return { error: error.message };
    }
  }

  /**
   * Reset sync state
   */
  resetSyncState() {
    this.syncedAddresses.clear();
    this.logger.info('Sync state reset');
  }
}

module.exports = CrossChainSyncService;