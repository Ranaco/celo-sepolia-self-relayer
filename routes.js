'use strict'
module.exports = function (app, opts, logger, relayerContainer) {
  // Setup routes, middleware, and handlers
  app.get('/', (req, res) => {
    res.locals.name = 'Self Protocol Relayer'
    res.render('index')
  })

  // Relayer status endpoint
  app.get('/status', async (req, res) => {
    if (!relayerContainer.isInitialized || !relayerContainer.service) {
      return res.json({ 
        service: 'cross-chain verification relayer',
        timestamp: new Date().toISOString(),
        isRunning: false,
        status: 'not-initialized',
        stats: {
          totalRuns: 0,
          successfulRuns: 0,
          failedRuns: 0,
          verifiedUsersUpdated: 0,
          addressesSynced: 0,
          lastRun: null
        }
      })
    }

    try {
      const status = await relayerContainer.service.getStatus()
      res.json({
        service: 'cross-chain verification relayer',
        timestamp: new Date().toISOString(),
        ...status
      })
    } catch (error) {
      logger.error('Error getting status:', error)
      res.status(500).json({
        error: 'Failed to get service status',
        message: error.message
      })
    }
  })

  // Relayer statistics endpoint
  app.get('/stats', (req, res) => {
    if (!relayerContainer.isInitialized || !relayerContainer.service) {
      return res.json({ 
        service: 'cross-chain verification relayer',
        timestamp: new Date().toISOString(),
        statistics: {
          totalRuns: 0,
          successfulRuns: 0,
          failedRuns: 0,
          verifiedUsersUpdated: 0,
          addressesSynced: 0,
          addressesSkipped: 0,
          lastRun: null,
          status: 'not-initialized'
        }
      })
    }

    const stats = relayerContainer.service.getStats()
    res.json({
      service: 'cross-chain verification relayer',
      timestamp: new Date().toISOString(),
      statistics: stats
    })
  })

  // Health check endpoint
  app.get('/health', async (req, res) => {
    try {
      const healthData = {
        service: 'cross-chain-verification-relayer',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        relayer: relayerContainer.isInitialized && relayerContainer.service ? 
          await relayerContainer.service.getStatus() : 
          { status: 'not-initialized' }
      }

      res.json(healthData)
    } catch (error) {
      logger.error('Health check error:', error)
      res.status(500).json({ 
        error: 'Health check failed',
        message: error.message
      })
    }
  })

  // Manual trigger for sync operation (for testing)
  app.post('/trigger-sync', async (req, res) => {
    if (!relayerContainer.isInitialized || !relayerContainer.service) {
      return res.status(503).json({ 
        error: 'Relayer service not initialized',
        status: 'not-available'
      })
    }

    try {
      logger.info('Manual sync operation triggered via API')
      await relayerContainer.service.performSyncOperation()
      res.json({
        message: 'Cross-chain sync operation completed successfully',
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      logger.error('Manual sync operation failed:', error)
      res.status(500).json({
        error: 'Sync operation failed',
        message: error.message,
        timestamp: new Date().toISOString()
      })
    }
  })

  // Manual sync specific addresses
  app.post('/sync-addresses', async (req, res) => {
    if (!relayerContainer.isInitialized || !relayerContainer.service) {
      return res.status(503).json({ 
        error: 'Relayer service not initialized',
        status: 'not-available'
      })
    }

    const { addresses } = req.body
    if (!addresses || !Array.isArray(addresses) || addresses.length === 0) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Please provide an array of addresses to sync'
      })
    }

    try {
      logger.info(`Manual sync requested for ${addresses.length} addresses`)
      const result = await relayerContainer.service.syncSpecificAddresses(addresses)
      res.json({
        message: 'Address sync completed',
        result,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      logger.error('Manual address sync failed:', error)
      res.status(500).json({
        error: 'Address sync failed',
        message: error.message,
        timestamp: new Date().toISOString()
      })
    }
  })

  // Reset sync state
  app.post('/reset-sync', (req, res) => {
    if (!relayerContainer.isInitialized || !relayerContainer.service) {
      return res.status(503).json({ 
        error: 'Relayer service not initialized',
        status: 'not-available'
      })
    }

    try {
      relayerContainer.service.resetSyncState()
      res.json({
        message: 'Sync state reset successfully',
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      logger.error('Reset sync state failed:', error)
      res.status(500).json({
        error: 'Reset failed',
        message: error.message,
        timestamp: new Date().toISOString()
      })
    }
  })
}