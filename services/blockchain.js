const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

class BlockchainService {
    constructor() {
        this.celoProvider = null;
        this.sepoliaProvider = null;
        this.wallet = null;
        this.proofOfHumanContract = null;
        this.centralWalletContract = null;
        
        this.proofOfHumanABI = JSON.parse(
            fs.readFileSync(path.join(__dirname, '../abis/ProofOfHumanOApp.json'), 'utf8')
        );
        this.centralWalletABI = JSON.parse(
            fs.readFileSync(path.join(__dirname, '../abis/CentralWallet.json'), 'utf8')
        );
    }

    async initialize() {
        try {
            // Initialize providers with explicit network configuration
            this.celoProvider = new ethers.JsonRpcProvider(
                process.env.CELO_RPC,
                {
                    name: 'celo',
                    chainId: 42220
                }
            );

            this.sepoliaProvider = new ethers.JsonRpcProvider(
                process.env.SEPOLIA_RPC,
                {
                    name: 'sepolia',
                    chainId: 11155111
                }
            );

            // Test provider connections
            console.log('Testing Celo provider...');
            const celoNetwork = await this.celoProvider.getNetwork();
            console.log('Celo network connected:', celoNetwork.chainId);

            console.log('Testing Sepolia provider...');
            const sepoliaNetwork = await this.sepoliaProvider.getNetwork();
            console.log('Sepolia network connected:', sepoliaNetwork.chainId);

            // Create wallet for signing transactions
            this.wallet = new ethers.Wallet(process.env.RELAYER_PRIVATE_KEY, this.sepoliaProvider);
            
            // Initialize contract instances
            this.proofOfHumanContract = new ethers.Contract(
                process.env.PROOF_OF_HUMAN_CONTRACT,
                this.proofOfHumanABI,
                this.celoProvider
            );
            
            this.centralWalletContract = new ethers.Contract(
                process.env.CENTRAL_WALLET_CONTRACT,
                this.centralWalletABI,
                this.wallet
            );

            console.log('Blockchain service initialized successfully');
        } catch (error) {
            console.error('Error initializing blockchain service:', error);
            throw error;
        }
    }

    async healthCheck() {
        try {
            // Check if providers are responsive
            const celoBlockNumber = await this.celoProvider.getBlockNumber();
            const sepoliaBlockNumber = await this.sepoliaProvider.getBlockNumber();
            
            console.log(`Health check: Celo block ${celoBlockNumber}, Sepolia block ${sepoliaBlockNumber}`);
            
            return {
                status: 'healthy',
                celoBlock: celoBlockNumber,
                sepoliaBlock: sepoliaBlockNumber
            };
        } catch (error) {
            console.error('Health check failed:', error);
            throw new Error(`Blockchain health check failed: ${error.message}`);
        }
    }

    /**
     * Read verification data directly from verifiedHumans mapping on Celo
     */
    async readVerifiedHuman(userAddress) {
        try {
            const verificationData = await this.proofOfHumanContract.verifiedHumans(userAddress);
            return {
                userAddress: verificationData.userAddress,
                timestamp: verificationData.timestamp,
                gender: verificationData.gender,
                nationality: verificationData.nationality,
                minimumAge: verificationData.minimumAge,
                isVerified: verificationData.userAddress !== ethers.ZeroAddress
            };
        } catch (error) {
            console.error(`Error reading verification data for ${userAddress}:`, error);
            return null;
        }
    }

  /**
   * Get all verified humans from ProofOfHumanOApp contract on Celo
   */
  async getVerifiedHumans() {
    try {
      console.log('Fetching verification events from Celo...');
      
      // Get events from the last 1000 blocks to avoid hitting rate limits
      const currentBlock = await this.celoProvider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 1000);
      
      const filter = this.proofOfHumanContract.filters.VerificationCompleted();
      const events = await this.proofOfHumanContract.queryFilter(filter, fromBlock, 'latest');
      
      const verifiedAddresses = new Set();
      
      for (const event of events) {
        const userAddress = event.args.userAddress;
        verifiedAddresses.add(userAddress.toLowerCase());
      }
      
      this.logger.info(`Found ${verifiedAddresses.size} verified humans from recent events`);
      return Array.from(verifiedAddresses);
      
    } catch (error) {
      this.logger.error('Error fetching verified humans:', error);
      throw error;
    }
  }

  /**
   * Check if a user is already verified in CentralWallet on Sepolia
   */
  async isUserVerified(userAddress) {
    try {
      return await this.centralWalletContract.verifiedHumans(userAddress);
    } catch (error) {
      this.logger.error(`Error checking verification status for ${userAddress}:`, error);
      return false;
    }
  }

  /**
   * Update verified humans in CentralWallet contract on Sepolia
   */
  async updateVerifiedHumans(addresses, verificationStatus) {
    try {
      if (addresses.length === 0) {
        this.logger.info('No addresses to update');
        return;
      }

      this.logger.info(`Updating ${addresses.length} addresses in CentralWallet...`);
      
      // Check gas price and estimate gas
      const gasPrice = await this.sepoliaProvider.getFeeData();
      
      // Batch update for efficiency
      const tx = await this.centralWalletContract.setVerifiedHumansBatch(
        addresses,
        verificationStatus,
        {
          gasLimit: 300000 + (addresses.length * 50000), // Dynamic gas limit based on batch size
          maxFeePerGas: gasPrice.maxFeePerGas,
          maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas
        }
      );
      
      this.logger.info(`Transaction sent: ${tx.hash}`);
      
      const receipt = await tx.wait();
      this.logger.info(`Transaction confirmed in block ${receipt.blockNumber}`);
      
      return receipt;
      
    } catch (error) {
      this.logger.error('Error updating verified humans:', error);
      throw error;
    }
  }

  /**
   * Get the current balance of the relayer wallet
   */
  async getRelayerBalance() {
    try {
      const balance = await this.sepoliaProvider.getBalance(this.relayerWallet.address);
      return ethers.formatEther(balance);
    } catch (error) {
      this.logger.error('Error getting relayer balance:', error);
      return '0.0';
    }
  }

  /**
   * Get network information
   */
  async getNetworkInfo() {
    try {
      const [celoNetwork, sepoliaNetwork] = await Promise.all([
        this.celoProvider.getNetwork(),
        this.sepoliaProvider.getNetwork()
      ]);
      
      return {
        celo: {
          name: celoNetwork.name,
          chainId: celoNetwork.chainId.toString()
        },
        sepolia: {
          name: sepoliaNetwork.name,
          chainId: sepoliaNetwork.chainId.toString()
        },
        relayerAddress: this.relayerWallet.address
      };
    } catch (error) {
      this.logger.error('Error getting network info:', error);
      return null;
    }
  }
}

module.exports = BlockchainService;