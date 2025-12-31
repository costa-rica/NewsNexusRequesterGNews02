# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

NewsNexusRequesterGNews02 is a GNews API automation service that replaces earlier NewsNexusGNewRequester and NewsNexusGNewsRequester01 implementations. It systematically queries the GNews API with prioritized search parameters, stores articles in a shared database, and triggers semantic scoring when complete.

## Running the Application

**Development/Testing:**
```bash
node index.js
```

**Production (with time window check):**
```bash
node server.js
```

The `server.js` entry point only runs between 20:55-21:05 UTC and initializes Winston logging.

## Core Architecture

### Two-Phase Process

**Phase 1: Build Prioritized Request Queue**

1. Read search parameters from Excel file (`PATH_AND_FILENAME_FOR_QUERY_SPREADSHEET_AUTOMATED`)
2. Query `NewsApiRequests` table to identify which parameters have been requested before
3. Create two arrays:
   - Parameters never requested (highest priority)
   - Parameters previously requested (sorted by `dateEndOfRequest` ascending)
4. Calculate `dateEndOfRequest` for each parameter based on existing request history

**Phase 2: Execute Requests Loop**

1. Process parameters in priority order
2. For each parameter, verify `dateEndOfRequest` is today or prior
3. Make GNews API request with date range (10-day window by default)
4. Store articles in database via `newsnexus10db` package
5. Respect rate limiting (`MILISECONDS_IN_BETWEEN_REQUESTS`)
6. Loop continues until either:
   - All parameters processed and dates current
   - `LIMIT_MASTER_INDEX_OF_WHILE_TRUE_LOOP` exceeded
   - Rate limit/quota error from GNews
7. When finished, spawn `NewsNexusSemanticScorer02` as child process

### Key Modules

**config/logger.js**
- Winston logger configuration and initialization
- Monkey-patches `console.log/error/warn/info/debug` to use Winston
- Development mode: Colorized console output
- Production mode: Rotating file logs with timestamps
- Handles log directory creation and error fallback
- Format: `[timestamp] [LEVEL] [NewsNexusRequesterGNews02] message {metadata}`

**modules/requestsGNews.js**
- `requester()`: Main orchestration function for a single request
- `makeGNewsApiRequestDetailed()`: Builds query URL with length constraints, makes fetch call
- `buildQueryWithinLimit()`: Constructs boolean query from AND/OR/NOT arrays within character limit
  - Sanitizes terms to handle logical operators inside quotes
  - Ensures query fits within `MAX_LENGTH_OF_QUERY_PARAMS` (250 default)
- `storeGNewsArticles()`: Saves articles to database, avoiding duplicates by URL

**modules/utilitiesMisc.js**
- `createArraysOfParametersNeverRequestedAndRequested()`: Splits Excel parameters into never-requested vs. requested
- `checkRequestAndModifyDates()`: Adjusts date ranges to avoid re-querying already-covered dates
- `findEndDateToQueryParameters()`: Looks up latest `dateEndOfRequest` from database for given parameters
- `runSemanticScorer()`: Spawns semantic scorer child process and exits
  - **Validation**: Checks for `NAME_CHILD_PROCESS_SCORER` environment variable before spawning
  - Fatal error with clear message if variable is missing

**modules/utilitiesReadAndMakeFiles.js**
- `getRequestsParameterArrayFromExcelFile()`: Reads Excel with columns: id, andString, orString, notString, startDate
  - Uses ExcelJS (migrated from xlsx package for security)
  - Handles both Date objects and Excel serial numbers for dates
- `writeResponseDataFromNewsAggregator()`: Writes API response JSON to dated directory under `PATH_TO_API_RESPONSE_JSON_FILES`

## Database Integration

This app depends on the `newsnexus10db` package (local file dependency: `../NewsNexus10Db`).

**Used Models:**
- `Article`: Stores news articles (url, title, description, publishedDate, etc.)
- `NewsApiRequest`: Tracks each API request (andString, orString, notString, date ranges, counts)
- `EntityWhoFoundArticle`: Links aggregator sources to discovery entities
- `NewsArticleAggregatorSource`: Stores API credentials and URLs (nameOfOrg, apiKey, url)

The database uses SQLite with Sequelize ORM. See `docs/DATABASE_OVERVIEW.md` for comprehensive schema details.

## Logging System

This application uses **Winston** for production-grade logging with monkey-patching (Phase 1 implementation per `docs/LOGGING_NODE_JS_V03.md`).

### Configuration

**Development Mode** (`NODE_ENV=development`):
- Console output with colorized formatting
- All log levels enabled (debug and above)
- No log files created
- Format: `HH:mm:ss LEVEL [AppName] message`

**Testing Mode** (`NODE_ENV=testing`):
- File-based logging with rotation
- Log directory: `PATH_TO_LOGS`
- File name: `NewsNexusRequesterGNews02.log`
- Info level and above (error, warn, info, http)
- Rotation: 10MB per file (configurable via `LOG_MAX_SIZE`)
- Retention: Last 10 files (configurable via `LOG_MAX_FILES`)
- Format: `[YYYY-MM-DD HH:mm:ss.SSS] [LEVEL] [AppName] message {metadata}`

**Production Mode** (`NODE_ENV=production`):
- File-based logging with rotation
- Log directory: `PATH_TO_LOGS`
- File name: `NewsNexusRequesterGNews02.log`
- **ERROR level only** (minimizes log volume in production)
- Rotation: 10MB per file (configurable via `LOG_MAX_SIZE`)
- Retention: Last 10 files (configurable via `LOG_MAX_FILES`)
- Format: `[YYYY-MM-DD HH:mm:ss.SSS] [LEVEL] [AppName] message {metadata}`

### Implementation Details

- **Location**: `config/logger.js`
- **Initialization**: Required at top of `server.js` (after dotenv)
- **Monkey-patching**: All `console.*` methods redirected to Winston
- **Child process spawning**: `runSemanticScorer()` uses `spawn()` to pass environment variables to child
- **Child process validation**: `runSemanticScorer()` validates `NAME_CHILD_PROCESS_SCORER` before spawning
- **Error handling**: Falls back to console logging if file system errors occur

### Log Levels

Winston levels used (in order of severity):
1. `error` - Error conditions requiring attention (logged in all environments)
2. `warn` - Warning conditions that should be reviewed (logged in development and testing)
3. `info` - Informational messages about application state (logged in development and testing)
4. `http` - HTTP request/response logging (logged in development and testing)
5. `debug` - Debug-level messages for troubleshooting (logged in development only)

**Environment-Specific Levels:**
- Development: `debug` (captures all levels)
- Testing: `info` (captures error, warn, info, http)
- Production: `error` (captures only errors)

## Important Behaviors

**Query Length Management:**
- GNews imposes a ~370 character total URL limit
- The app uses `MAX_LENGTH_OF_QUERY_PARAMS` (default 250) to stay under limit
- `buildQueryWithinLimit()` prioritizes AND terms, OR terms, then adds NOT terms until limit reached
- Terms with logical operators inside quotes are stripped of quotes to prevent GNews query parsing errors

**Date Window Logic:**
- Default request window: 10 days (hardcoded in `requester()`)
- If previous request exists, new `startDate` = old `dateEndOfRequest`
- Never requests beyond today's date

**Error Handling:**
- Failed requests are saved as JSON with `indexMaster` in filename for uniqueness
- Rate limit errors (`"too many requests"`, `"quota"`, `"request was blocked"`) trigger immediate exit and semantic scorer run
- Articles without valid response data do not update database

**Automation Control:**
- `ACTIVATE_API_REQUESTS_TO_OUTSIDE_SOURCES=true` to make real requests
- Set to `false` for dry-run testing (logs URL only)

## Environment Variables Reference

Required environment variables (see README.md for examples):

**Application Configuration:**
- `NAME_APP`: Application name (e.g., "NewsNexusRequesterGNews02")
- `NAME_DB`, `PATH_DATABASE`: Database location (inherited from `newsnexus10db`)
- `PATH_AND_FILENAME_FOR_QUERY_SPREADSHEET_AUTOMATED`: Excel file path
- `PATH_TO_API_RESPONSE_JSON_FILES`: Directory for storing API response JSON files
- `PATH_AND_FILENAME_TO_SEMANTIC_SCORER`: Path to semantic scorer index.js
- `PATH_TO_SEMANTIC_SCORER_DIR`: Directory for semantic scorer output
- `PATH_TO_SEMANTIC_SCORER_KEYWORDS_EXCEL_FILE`: Keywords Excel for semantic scorer

**Request Configuration:**
- `ACTIVATE_API_REQUESTS_TO_OUTSIDE_SOURCES`: `true` or `false`
- `NAME_OF_ORG_REQUESTING_FROM`: `"GNews"`
- `LIMIT_MASTER_INDEX_OF_WHILE_TRUE_LOOP`: Max iterations (e.g., 200)
- `MILISECONDS_IN_BETWEEN_REQUESTS`: Rate limit delay (e.g., 1100)
- `MAX_LENGTH_OF_QUERY_PARAMS`: Query character limit (e.g., 250)

**Logging Configuration:**
- `NODE_ENV`: `"development"`, `"testing"`, or `"production"` (required)
- `PATH_TO_LOGS`: Directory for log files (required in production and testing)
- `LOG_MAX_SIZE`: Max log file size in bytes (optional, default: 10485760 = 10MB)
- `LOG_MAX_FILES`: Max number of log files to retain (optional, default: 10)
- `NAME_CHILD_PROCESS_SCORER`: Child process name for semantic scorer (required, e.g., "NewsNexusSemanticScorer02")
  - **Important**: Application will exit with fatal error if this variable is missing when spawning child process
  - Child process inherits all environment variables from parent (including `PATH_TO_LOGS`, `LOG_MAX_SIZE`, `LOG_MAX_FILES`, `NODE_ENV`)

## Excel Spreadsheet Format

Required columns:
- `id`: Unique identifier
- `andString`: Space or quote-delimited AND terms
- `orString`: Space or quote-delimited OR terms
- `notString`: Space or quote-delimited NOT terms
- `startDate`: Excel date serial number (converted to ISO date)

No `endDate` column needed (calculated by app).
