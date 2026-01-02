const winston = require("winston");
const path = require("path");
const fs = require("fs");

// ============================================================================
// Environment Variable Validation (V04 Requirement)
// ============================================================================
const requiredEnvVars = ["NODE_ENV", "NAME_APP", "PATH_TO_LOGS"];
const missingVars = requiredEnvVars.filter((varName) => !process.env[varName]);

if (missingVars.length > 0) {
  console.error(
    `FATAL ERROR: Missing required environment variable(s): ${missingVars.join(", ")}`
  );
  console.error("Please set the required environment variables and restart the application.");
  process.exit(1);
}

// ============================================================================
// Environment Configuration
// ============================================================================
const nodeEnv = process.env.NODE_ENV; // Already validated above
const isProduction = nodeEnv === "production";
const isTesting = nodeEnv === "testing";
const isDevelopment = nodeEnv === "development";
const appName = process.env.NAME_APP; // Already validated above
const logDir = process.env.PATH_TO_LOGS; // Already validated above

// Optional variables with defaults (V04 spec: 5MB and 5 files)
const logMaxSizeMB = parseInt(process.env.LOG_MAX_SIZE) || 5;
const logMaxSizeBytes = logMaxSizeMB * 1024 * 1024; // Convert MB to bytes
const maxFiles = parseInt(process.env.LOG_MAX_FILES) || 5;

// ============================================================================
// Log Formats
// ============================================================================

// Production/Testing format: [YYYY-MM-DD HH:mm:ss.SSS] [LEVEL] [AppName] message {metadata}
const productionFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? " " + JSON.stringify(meta) : "";
    return `[${timestamp}] [${level.toUpperCase()}] [${appName}] ${message}${metaStr}`;
  })
);

// Development format: HH:mm:ss LEVEL [AppName] message
const developmentFormat = winston.format.combine(
  winston.format.timestamp({ format: "HH:mm:ss" }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? " " + JSON.stringify(meta) : "";
    return `${timestamp} ${level} [${appName}] ${message}${metaStr}`;
  })
);

// ============================================================================
// Log Levels (V04 Requirement)
// ============================================================================
// Development: debug and above
// Testing: info and above (error, warn, info, http)
// Production: info and above (error, warn, info, http)
let logLevel;
if (isDevelopment) {
  logLevel = "debug";
} else {
  logLevel = "info"; // Both testing and production use info
}

// ============================================================================
// Create Logger Instance
// ============================================================================
const logger = winston.createLogger({
  level: logLevel,
  format: isDevelopment ? developmentFormat : productionFormat,
  transports: [],
});

// ============================================================================
// Add Transports Based on Environment (V04 Requirement)
// ============================================================================

if (isDevelopment) {
  // Development: Console only
  logger.add(
    new winston.transports.Console({
      format: developmentFormat,
    })
  );
} else if (isTesting) {
  // Testing: Console AND files (both simultaneously)
  // Ensure log directory exists
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  // Add file transport
  logger.add(
    new winston.transports.File({
      filename: path.join(logDir, `${appName}.log`),
      maxsize: logMaxSizeBytes,
      maxFiles: maxFiles,
      tailable: true,
    })
  );

  // Add console transport
  logger.add(
    new winston.transports.Console({
      format: productionFormat, // Use production format for testing console output
    })
  );
} else if (isProduction) {
  // Production: Files only
  // Ensure log directory exists
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  logger.add(
    new winston.transports.File({
      filename: path.join(logDir, `${appName}.log`),
      maxsize: logMaxSizeBytes,
      maxFiles: maxFiles,
      tailable: true,
    })
  );
}

// ============================================================================
// Log Initialization Message
// ============================================================================
logger.info(
  `Logger initialized: mode=${nodeEnv}, level=${logLevel}, maxSize=${logMaxSizeMB}MB, maxFiles=${maxFiles}, output=${
    isDevelopment ? "console" : isTesting ? "console+files" : "files"
  }`
);

module.exports = logger;
