/**
 * 📋 FluxoUber - Logger centralizado (log4js)
 *
 * Uso:
 *   const logger = require('./lib/logger');
 *   logger.info('mensagem');
 *   logger.warn('aviso');
 *   logger.error('erro');
 *   logger.debug('detalhe');
 */

const log4js = require('log4js');
const path   = require('path');

const LOG_DIR        = path.join(__dirname, '../logs');
const LOG_FILE       = path.join(LOG_DIR, 'uberaero.log');
const LOG_FILE_WARN  = path.join(LOG_DIR, 'uberaero.warn.log');
const LOG_FILE_ERROR = path.join(LOG_DIR, 'uberaero.error.log');

// Formato de data brasileiro: DD/MM/YYYY HH:mm:ss
const LAYOUT_ARQUIVO = {
  type: 'pattern',
  pattern: '[%d{dd/MM/yyyy hh:mm:ss}] [%p] %m'
};

log4js.configure({
  appenders: {
    console: {
      type: 'console',
      layout: {
        type: 'pattern',
        pattern: '%[[%d{dd/MM/yyyy hh:mm:ss}] [%p]%] %m'
      }
    },
    arquivo: {
      type: 'dateFile',
      filename: LOG_FILE,
      pattern: '.yyyy-MM-dd',
      keepFileExt: false,
      compress: true,
      numBackups: 30,
      layout: LAYOUT_ARQUIVO
    },
    arquivo_warn: {
      type: 'dateFile',
      filename: LOG_FILE_WARN,
      pattern: '.yyyy-MM-dd',
      keepFileExt: false,
      compress: true,
      numBackups: 30,
      layout: LAYOUT_ARQUIVO
    },
    arquivo_error: {
      type: 'dateFile',
      filename: LOG_FILE_ERROR,
      pattern: '.yyyy-MM-dd',
      keepFileExt: false,
      compress: true,
      numBackups: 30,
      layout: LAYOUT_ARQUIVO
    },
    // Filtros por nível
    apenas_warn: {
      type: 'logLevelFilter',
      appender: 'arquivo_warn',
      level: 'warn',
      maxLevel: 'warn'
    },
    apenas_error: {
      type: 'logLevelFilter',
      appender: 'arquivo_error',
      level: 'error'
    }
  },
  categories: {
    default: {
      appenders: ['console', 'arquivo', 'apenas_warn', 'apenas_error'],
      level: process.env.LOG_LEVEL || 'info'
    }
  }
});

const logger = log4js.getLogger();

module.exports = logger;
