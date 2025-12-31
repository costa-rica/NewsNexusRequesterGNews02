const winston = require("winston");
const path = require("path");
const fs = require("fs");

// Environment configuration
const isProduction = process.env.NODE_ENV === "production";
const appName = process.env.NAME_APP || "NewsNexusRequesterGNews02";
const logDir = process.env.PATH_TO_LOGS || "./logs";
const maxSize = parseInt(process.env.LOG_MAX_SIZE) || 10485760; // 10MB
const maxFiles = parseInt(process.env.LOG_MAX_FILES) || 10;

// Define log format for production
const productionFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? " " + JSON.stringify(meta) : "";
    return `[${timestamp}] [${level.toUpperCase()}] [${appName}] ${message}${metaStr}`;
  })
);

// Define log format for development
const developmentFormat = winston.format.combine(
  winston.format.timestamp({ format: "HH:mm:ss" }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? " " + JSON.stringify(meta) : "";
    return `${timestamp} ${level} [${appName}] ${message}${metaStr}`;
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: isProduction ? "info" : "debug",
  format: isProduction ? productionFormat : developmentFormat,
  transports: [],
});

// Add transports based on environment
if (isProduction) {
  // Production: Write to file
  try {
    // Ensure log directory exists
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
      console.log(`Created log directory: ${logDir}`);
    }

    logger.add(
      new winston.transports.File({
        filename: path.join(logDir, `${appName}.log`),
        maxsize: maxSize,
        maxFiles: maxFiles,
        tailable: true,
      })
    );
  } catch (error) {
    console.error(`Failed to initialize file logging: ${error.message}`);
    console.error("Falling back to console logging");
    logger.add(
      new winston.transports.Console({
        format: developmentFormat,
      })
    );
  }
} else {
  // Development: Console only
  logger.add(
    new winston.transports.Console({
      format: developmentFormat,
    })
  );
}

// Monkey-patch console methods to use Winston
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;
const originalInfo = console.info;
const originalDebug = console.debug;

console.log = (...args) => logger.info(args.join(" "));
console.error = (...args) => logger.error(args.join(" "));
console.warn = (...args) => logger.warn(args.join(" "));
console.info = (...args) => logger.info(args.join(" "));
console.debug = (...args) => logger.debug(args.join(" "));

// Store original methods for emergency use
console._original = {
  log: originalLog,
  error: originalError,
  warn: originalWarn,
  info: originalInfo,
  debug: originalDebug,
};

// Log initialization
logger.info(
  `Logger initialized: mode=${
    isProduction ? "production" : "development"
  }, output=${isProduction ? logDir + "/" + appName + ".log" : "console"}`
);

module.exports = logger;
