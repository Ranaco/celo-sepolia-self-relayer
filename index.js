'use strict'
const express = require('express')
const httpErrors = require('http-errors')
const path = require('path')
const ejs = require('ejs')
const pino = require('pino')
const pinoHttp = require('pino-http')
require('dotenv').config()

const RelayerService = require('./services/relayer')

module.exports = function main (options, cb) {
  // Set default options
  const ready = cb || function () {}
  const opts = Object.assign({
    // Default options
  }, options)

  const logger = pino()

  // Initialize relayer service container
  const relayerContainer = {
    service: null,
    isInitialized: false
  }

  // Server state
  let server
  let serverStarted = false
  let serverClosing = false

  // Setup error handling
  function unhandledError (err) {
    // Log the errors
    logger.error(err)

    // Stop relayer service on shutdown
    if (relayerContainer.service) {
      relayerContainer.service.stop()
    }

    // Only clean up once
    if (serverClosing) {
      return
    }
    serverClosing = true

    // If server has started, close it down
    if (serverStarted) {
      server.close(function () {
        process.exit(1)
      })
    }
  }
  process.on('uncaughtException', unhandledError)
  process.on('unhandledRejection', unhandledError)

  // Create the express app
  const app = express()

  // Template engine
  app.engine('html', ejs.renderFile)
  app.set('views', path.join(__dirname, 'views'))
  app.set('view engine', 'html')
  
  // Common middleware
  app.use(pinoHttp({ logger }))
  
  // Serve static files
  app.use('/public', express.static(path.join(__dirname, 'public')))
  
  // Parse JSON bodies
  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))
      
  // Register routes
  require('./routes')(app, opts, logger, relayerContainer)

  // Common error handlers
  app.use(function fourOhFourHandler (req, res, next) {
    next(httpErrors(404, `Route not found: ${req.url}`))
  })
  app.use(function fiveHundredHandler (err, req, res, next) {
    if (err.status >= 500) {
      logger.error(err)
    }
    res.locals.name = 'Self Relayer'
    res.locals.error = err
    res.status(err.status || 500).render('error')
  })
  
  // Start server
  server = app.listen(opts.port, opts.host, async function (err) {
    if (err) {
      return ready(err, app, server)
    }

    // If some other error means we should close
    if (serverClosing) {
      return ready(new Error('Server was closed before it could start'))
    }

    serverStarted = true
    const addr = server.address()
    logger.info(`Started at ${opts.host || addr.host || 'localhost'}:${addr.port}`)

    // Initialize and start relayer service after server starts
    try {
      relayerContainer.service = new RelayerService(logger)
      await relayerContainer.service.start()
      relayerContainer.isInitialized = true
      logger.info('Relayer service initialized and started')
    } catch (error) {
      console.error('Error initializing relayer service:', error)
      logger.error('Failed to start relayer service:', error)
      // Continue running the server even if relayer fails to start
      relayerContainer.isInitialized = false
    }

    ready(err, app, server)
  })
}

// If running directly (not as a module), start the server
if (require.main === module) {
  module.exports({ port: process.env.PORT || 8001, host: process.env.HOST || '0.0.0.0' }, function (err, app, server) {
    if (err) {
      console.error(err)
      process.exit(1)
    }
  })
}