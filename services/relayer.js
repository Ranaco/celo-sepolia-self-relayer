const CrossChainSyncService = require('./crossChainSync');
const BlockchainService = require('./blockchain');

class RelayerService {
  constructor(logger) {
    this.logger = logger;
    this.blockchainService = new BlockchainService();
    this.crossChainSync = new CrossChainSyncService(logger, this.blockchainService);
    this.isRunning = false;
    this.intervalId = null;
    this.stats = {
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      lastRun: null,
      lastError: null,
      verifiedUsersUpdated: 0,
      addressesSynced: 0,
      addressesSkipped: 0,
      errors: 0
    };
  }

  /**
   * Start the relayer service
   */
  async start() {
    if (this.isRunning) {
      this.logger.warn('Relayer service is already running');
      return;
    }

    this.logger.info('Starting cross-chain verification relayer service...');
    
    // Initialize blockchain service
    await this.blockchainService.initialize();
    
    // Verify network connectivity and service status
    await this.performHealthCheck();
    
    this.isRunning = true;
    
    // Run once immediately
    await this.performSyncOperation();
    
    // Set up interval for periodic execution
    const intervalMs = parseInt(process.env.RELAYER_INTERVAL_MS) || 10000;
    this.intervalId = setInterval(async () => {
      await this.performSyncOperation();
    }, intervalMs);
    
    this.logger.info(`Cross-chain sync service started with ${intervalMs}ms interval`);
  }

  /**
   * Stop the relayer service
   */
  stop() {
    if (!this.isRunning) {
      this.logger.warn('Relayer service is not running');
      return;
    }

    this.logger.info('Stopping cross-chain sync service...');
    this.isRunning = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    this.logger.info('Cross-chain sync service stopped');
  }

  /**
   * Perform health check before starting
   */
    async performHealthCheck() {
        try {
            return await this.blockchainService.healthCheck();
        } catch (error) {
            this.logger.error('Health check failed:', error);
            throw new Error(`Service status error: ${error.message}`);
        }
    }  /**
   * Main sync operation - read from Celo and update Sepolia
   */
  async performSyncOperation() {
    const startTime = Date.now();
    this.stats.totalRuns++;
    this.stats.lastRun = new Date().toISOString();
    
    try {
      this.logger.info('Starting cross-chain verification sync...');
      
      // Perform the sync operation
      const result = await this.crossChainSync.syncVerifications();
      
      // Update stats
      this.stats.addressesSynced += result.synced;
      this.stats.addressesSkipped += result.skipped;
      this.stats.errors += result.errors;
      this.stats.verifiedUsersUpdated += result.synced;
      this.stats.successfulRuns++;
      this.stats.lastError = null;
      
      const duration = Date.now() - startTime;
      this.logger.info(`Sync operation completed in ${duration}ms. Synced: ${result.synced}, Skipped: ${result.skipped}, Errors: ${result.errors}`);
      
    } catch (error) {
      this.stats.failedRuns++;
      this.stats.lastError = error.message;
      
      const duration = Date.now() - startTime;
      this.logger.error(`Sync operation failed after ${duration}ms:`, error);
    }
  }

  /**
   * Manually sync specific addresses
   */
  async syncSpecificAddresses(addresses) {
    try {
      this.logger.info(`Manually syncing ${addresses.length} specific addresses...`);
      const result = await this.crossChainSync.syncVerifications(addresses);
      this.logger.info(`Manual sync completed. Synced: ${result.synced}, Skipped: ${result.skipped}, Errors: ${result.errors}`);
      return result;
    } catch (error) {
      this.logger.error('Manual sync failed:', error);
      throw error;
    }
  }

  /**
   * Get service statistics
   */
  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      uptime: this.isRunning && this.stats.lastRun ? Date.now() - new Date(this.stats.lastRun).getTime() : 0
    };
  }

  /**
   * Get comprehensive service status
   */
  async getStatus() {
    try {
      const [serviceStatus, syncStatus] = await Promise.all([
        {
          isRunning: this.isRunning,
          stats: this.getStats()
        },
        this.crossChainSync.getStatus()
      ]);

      return {
        service: serviceStatus,
        blockchain: syncStatus
      };
    } catch (error) {
      this.logger.error('Error getting status:', error);
      return {
        service: { isRunning: this.isRunning, stats: this.getStats() },
        blockchain: { error: error.message }
      };
    }
  }

  /**
   * Reset sync state
   */
  resetSyncState() {
    this.crossChainSync.resetSyncState();
    this.stats.addressesSynced = 0;
    this.stats.addressesSkipped = 0;
    this.stats.errors = 0;
    this.logger.info('Sync state reset');
  }
}

module.exports = RelayerService;