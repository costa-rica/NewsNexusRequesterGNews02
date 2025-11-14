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

The `server.js` entry point only runs between 20:55-21:05 UTC and adds an app name prefix to console logs.

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

**modules/utilitiesReadAndMakeFiles.js**
- `getRequestsParameterArrayFromExcelFile()`: Reads Excel with columns: id, andString, orString, notString, startDate
- `writeResponseDataFromNewsAggregator()`: Writes API response JSON to dated directory under `PATH_TO_API_RESPONSE_JSON_FILES`

## Database Integration

This app depends on the `newsnexus10db` package (local file dependency: `../NewsNexus10Db`).

**Used Models:**
- `Article`: Stores news articles (url, title, description, publishedDate, etc.)
- `NewsApiRequest`: Tracks each API request (andString, orString, notString, date ranges, counts)
- `EntityWhoFoundArticle`: Links aggregator sources to discovery entities
- `NewsArticleAggregatorSource`: Stores API credentials and URLs (nameOfOrg, apiKey, url)

The database uses SQLite with Sequelize ORM. See `docs/DATABASE_OVERVIEW.md` for comprehensive schema details.

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
- `NAME_APP`: Application name
- `NAME_DB`, `PATH_DATABASE`: Database location (inherited from `newsnexus10db`)
- `PATH_AND_FILENAME_FOR_QUERY_SPREADSHEET_AUTOMATED`: Excel file path
- `PATH_TO_API_RESPONSE_JSON_FILES`: Directory for storing API response JSON files
- `PATH_AND_FILENAME_TO_SEMANTIC_SCORER`: Path to semantic scorer index.js
- `PATH_TO_SEMANTIC_SCORER_DIR`: Directory for semantic scorer output
- `PATH_TO_SEMANTIC_SCORER_KEYWORDS_EXCEL_FILE`: Keywords Excel for semantic scorer
- `ACTIVATE_API_REQUESTS_TO_OUTSIDE_SOURCES`: `true` or `false`
- `NAME_OF_ORG_REQUESTING_FROM`: `"GNews"`
- `LIMIT_MASTER_INDEX_OF_WHILE_TRUE_LOOP`: Max iterations (e.g., 200)
- `MILISECONDS_IN_BETWEEN_REQUESTS`: Rate limit delay (e.g., 1100)
- `MAX_LENGTH_OF_QUERY_PARAMS`: Query character limit (e.g., 250)

## Excel Spreadsheet Format

Required columns:
- `id`: Unique identifier
- `andString`: Space or quote-delimited AND terms
- `orString`: Space or quote-delimited OR terms
- `notString`: Space or quote-delimited NOT terms
- `startDate`: Excel date serial number (converted to ISO date)

No `endDate` column needed (calculated by app).
