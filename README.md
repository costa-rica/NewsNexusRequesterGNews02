# NewsNexusRequesterGNews02

This application is the new implementation that will replace the [NewsNexusGNewRequester](https://github.com/costa-rica/NewsNexusGNewRequester) and [NewsNexusGNewsRequester01](https://github.com/costa-rica/NewsNexusGNewsRequester01) microservices.

## Overview

The GNews requester process is broken into two main parts:

### 1. Creating Prioritized Request Parameter Array

The app reads search parameter combinations from an Excel spreadsheet located at the path defined by the `PATH_AND_FILENAME_FOR_QUERY_SPREADSHEET_AUTOMATED` environment variable. Each parameter object contains `andString`, `orString`, and `notString` fields.

These parameter objects are then prioritized using the following logic:

- Parameters that have **never been requested** before (i.e. no matching entry in the `NewsApiRequests` table) are placed **first**.
- Parameters that have been requested previously are then sorted in **ascending order of their `dateEndOfRequest`**, so older requests are retried first.

### 2. Making GNews API Requests

Once the prioritized array is constructed, the application:

- Iterates through the request parameter array.
- Makes a GNews API request for each item.
- Updates the `NewsApiRequests` table with the results, including the `dateEndOfRequest`, ensuring accurate tracking of each parameter's request history.

This methodical approach ensures comprehensive and prioritized coverage of query terms, avoiding redundant or excessive API usage.

## Key modifications from the NewsNexusGNewRequester and NewsNexusGNewsRequester01

- requests url a limited to 270 characters
  - based on warning provided by GNews response
  - we are using 270 as our character limit parameter, but it renders urls with a total length of 370 characters including the `https://gnews.io/api/v4/search?` and so on ...
- failed requests are saved in .json with masterIndex to keep uniqueness

## Requirements

This app requires importing or adding the `newsnexus10db` package, which provides the Sequelize setup and model definitions needed to read and write to the `NewsApiRequests` table.

## Logging

This application uses **Winston** for production-grade logging with the following features:

- **Child Process Support**: Validates `NAME_CHILD_PROCESS_SEMANTIC_SCORER` before spawning semantic scorer

## Environment Variables

- `PATH_AND_FILENAME_FOR_QUERY_SPREADSHEET_AUTOMATED`: Path to the Excel file containing the query parameters.
- Need database connection variables as well for the NewsNexus10Db package.

### Example of necessary environment variables

#### workstation

```
NAME_APP=NewsNexusRequesterGNews02
NAME_DB=newsnexus10.db
PATH_DATABASE=/Users/nick/Documents/_databases/NewsNexus10/
PATH_PROJECT_RESOURCES=/Users/nick/Documents/_project_resources/NewsNexus10
PATH_PROJECT_RESOURCES_REPORTS=/Users/nick/Documents/_project_resources/NewsNexus10/reports
PATH_TO_API_RESPONSE_JSON_FILES=/Users/nick/Documents/_project_resources/NewsNexus10/api_response_json_files
PATH_PROJECT_RESOURCES_UTILITIES=/Users/nick/Documents/_project_resources/NewsNexus10/utilities
PATH_AND_FILENAME_FOR_QUERY_SPREADSHEET_AUTOMATED=/Users/nick/Documents/_project_resources/NewsNexus10/utilities/automation_excel_files/AutomatedRequestsGNews.xlsx
PATH_AND_FILENAME_TO_SEMANTIC_SCORER=/Users/nick/Documents/NewsNexusSemanticScorer02/index.js
PATH_TO_SEMANTIC_SCORER_DIR=/Users/nick/Documents/_project_resources/NewsNexus10/utilities/semantic_scorer
PATH_TO_SEMANTIC_SCORER_KEYWORDS_EXCEL_FILE=/Users/nick/Documents/_project_resources/NewsNexus10/utilities/semantic_scorer/NewsNexusSemanticScorerKeywords.xlsx
ACTIVATE_API_REQUESTS_TO_OUTSIDE_SOURCES=true
NAME_OF_ORG_REQUESTING_FROM=GNews
LIMIT_MASTER_INDEX_OF_WHILE_TRUE_LOOP=200
MILISECONDS_IN_BETWEEN_REQUESTS=1100
MAX_LENGTH_OF_QUERY_PARAMS=250

# Logging Configuration
NODE_ENV=development
PATH_TO_LOGS=/Users/nick/Documents/_project_resources/NewsNexus10/logs
LOG_MAX_SIZE=5
LOG_MAX_FILES=5
NAME_CHILD_PROCESS_SEMANTIC_SCORER=NewsNexusSemanticScorer02
```

#### ubuntu server

```
NAME_APP=NewsNexusRequesterGNews02
NAME_DB=newsnexus10.db
PATH_DATABASE=/home/nick/databases/NewsNexus10/
PATH_PROJECT_RESOURCES=/home/nick/project_resources/NewsNexus10
PATH_PROJECT_RESOURCES_REPORTS=/home/nick/project_resources/NewsNexus10/reports
PATH_TO_API_RESPONSE_JSON_FILES=/home/nick/project_resources/NewsNexus10/api_response_json_files
PATH_PROJECT_RESOURCES_UTILITIES=/home/nick/project_resources/NewsNexus10/utilities
PATH_AND_FILENAME_FOR_QUERY_SPREADSHEET_AUTOMATED=/home/nick/project_resources/NewsNexus10/utilities/automation_excel_files/AutomatedRequestsGNews.xlsx
PATH_AND_FILENAME_TO_SEMANTIC_SCORER=/home/nick/applications/NewsNexusSemanticScorer02/index.js
PATH_TO_SEMANTIC_SCORER_DIR=/home/nick/project_resources/NewsNexus10/utilities/semantic_scorer
PATH_TO_SEMANTIC_SCORER_KEYWORDS_EXCEL_FILE=/home/nick/project_resources/NewsNexus10/utilities/semantic_scorer/NewsNexusSemanticScorerKeywords.xlsx
ACTIVATE_API_REQUESTS_TO_OUTSIDE_SOURCES=true
NAME_OF_ORG_REQUESTING_FROM=GNews
LIMIT_MASTER_INDEX_OF_WHILE_TRUE_LOOP=200
MILISECONDS_IN_BETWEEN_REQUESTS=1100
MAX_LENGTH_OF_QUERY_PARAMS=250

# Logging Configuration
NODE_ENV=production
PATH_TO_LOGS=/home/nick/project_resources/NewsNexus10/logs
LOG_MAX_SIZE=5
LOG_MAX_FILES=5
NAME_CHILD_PROCESS_SEMANTIC_SCORER=NewsNexusSemanticScorer02
```

## Excel spreadsheet

- columns needed: id, andString, orString, notString, startDate
- no endDate column needed, this is calculated in the app
