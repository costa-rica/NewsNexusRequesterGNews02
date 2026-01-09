const {
  NewsApiRequest,
  NewsArticleAggregatorSource,
} = require("newsnexus10db");
const { spawn } = require("child_process");
const logger = require("./logger");

async function createArraysOfParametersNeverRequestedAndRequested(
  queryObjects
) {
  let arrayOfParametersNeverRequested = [];
  let arrayOfParametersRequested = [];
  const newsArticleAggregatorSourceObj =
    await NewsArticleAggregatorSource.findOne({
      where: { nameOfOrg: process.env.NAME_OF_ORG_REQUESTING_FROM },
      raw: true, // Returns data without all the database gibberish
    });
  // Load all existing requests from DB (we only need these 3 fields)
  const existingRequests = await NewsApiRequest.findAll({
    where: {
      newsArticleAggregatorSourceId: newsArticleAggregatorSourceObj.id,
    },
    attributes: ["andString", "orString", "notString", "dateEndOfRequest"],
    raw: true,
    order: [["dateEndOfRequest", "DESC"]],
  });

  for (const queryObj of queryObjects) {
    // logger.info(queryObj);
    const alreadyRequested = existingRequests.find((req) => {
      return (
        req.andString === queryObj.andString &&
        req.orString === queryObj.orString &&
        req.notString === queryObj.notString
      );
    });

    if (alreadyRequested) {
      arrayOfParametersRequested.push({
        ...queryObj,
        dateEndOfRequest: alreadyRequested.dateEndOfRequest,
      });
    } else {
      arrayOfParametersNeverRequested.push(queryObj);
    }
  }

  // -----> TODO: Remove any requests where dateEndOfRequest is equal to today
  arrayOfParametersRequested = arrayOfParametersRequested.filter((req) => {
    return req.dateEndOfRequest !== new Date().toISOString().split("T")[0];
  });

  return { arrayOfParametersNeverRequested, arrayOfParametersRequested };
}

async function checkRequestAndModifyDates(
  andString,
  orString,
  notString,
  startDate,
  endDate,
  gNewsSourceObj,
  requestWindowInDays
) {
  const existingRequests = await NewsApiRequest.findAll({
    where: {
      andString: andString,
      orString: orString,
      notString: notString,
      newsArticleAggregatorSourceId: gNewsSourceObj.id,
    },
    order: [["dateEndOfRequest", "DESC"]],
    limit: 1,
  });

  if (existingRequests.length > 0) {
    const latestEndDate = existingRequests[0].dateEndOfRequest;
    const newStartDate = latestEndDate;
    let newEndDate = new Date(
      new Date(newStartDate).getTime() +
        requestWindowInDays * 24 * 60 * 60 * 1000
    );

    const today = new Date();
    if (newEndDate > today) {
      newEndDate = today;
    }

    newEndDate = newEndDate.toISOString().split("T")[0];

    return { adjustedStartDate: newStartDate, adjustedEndDate: newEndDate };
  } else {
    const today = new Date();
    const endDateDateObj = new Date(endDate);
    if (endDateDateObj > today) {
      endDate = today.toISOString().split("T")[0];
    }
    return { adjustedStartDate: startDate, adjustedEndDate: endDate };
  }
}

async function findEndDateToQueryParameters(queryParameters) {
  const newsArticleAggregatorSourceObj =
    await NewsArticleAggregatorSource.findOne({
      where: { nameOfOrg: process.env.NAME_OF_ORG_REQUESTING_FROM },
      raw: true, // Returns data without all the database gibberish
    });
  const existingRequests = await NewsApiRequest.findAll({
    where: {
      andString: queryParameters.andString,
      orString: queryParameters.orString,
      notString: queryParameters.notString,
      newsArticleAggregatorSourceId: newsArticleAggregatorSourceObj.id,
    },
    order: [["dateEndOfRequest", "DESC"]],
    limit: 1,
  });

  if (existingRequests.length > 0) {
    const latestEndDate = existingRequests[0].dateEndOfRequest;
    return latestEndDate;
  } else {
    const day180daysAgo = new Date(
      new Date().setDate(new Date().getDate() - 180)
    )
      .toISOString()
      .split("T")[0];
    return day180daysAgo;
  }
}

async function runSemanticScorer() {
  // Validate NAME_CHILD_PROCESS_SEMANTIC_SCORER is set (FATAL ERROR if missing)
  if (!process.env.NAME_CHILD_PROCESS_SEMANTIC_SCORER) {
    logger.error(
      "FATAL ERROR: Cannot spawn semantic scorer child process - missing NAME_CHILD_PROCESS_SEMANTIC_SCORER environment variable.\n" +
        "Please add NAME_CHILD_PROCESS_SEMANTIC_SCORER to the .env file.\n" +
        "Example: NAME_CHILD_PROCESS_SEMANTIC_SCORER=NewsNexusSemanticScorer02"
    );
    process.exit(1);
  }

  logger.info(
    `Starting child process: ${process.env.PATH_AND_FILENAME_TO_SEMANTIC_SCORER}`
  );

  return new Promise((resolve, reject) => {
    // Spawn child process with inherited environment variables
    // This passes PATH_TO_LOGS, LOG_MAX_SIZE, LOG_MAX_FILES, NODE_ENV, and NAME_CHILD_PROCESS_SEMANTIC_SCORER
    const child = spawn(
      "node",
      [process.env.PATH_AND_FILENAME_TO_SEMANTIC_SCORER],
      {
        env: {
          ...process.env, // Inherit all environment variables from parent
          NAME_APP: process.env.NAME_CHILD_PROCESS_SEMANTIC_SCORER, // Pass child process name
        },
        stdio: ["inherit", "inherit", "inherit"], // Child handles its own stdio independently
      }
    );

    child.on("error", (error) => {
      logger.error(`Error spawning child process: ${error.message}`);
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        logger.info(`Child process finished with exit code ${code}`);
        resolve();
      } else {
        logger.error(`Child process exited with code ${code}`);
        reject(new Error(`Child process exited with code ${code}`));
      }
    });
  })
    .then(() => {
      logger.info(
        " [NewsNexusRequesterGNews02] ✅ NewsNexusSemanticScorer02 has finished."
      );
      process.exit();
    })
    .catch(() => {
      logger.info(
        " [NewsNexusRequesterGNews02] ❌ NewsNexusSemanticScorer02 has finished with error."
      );
      process.exit(1);
    });
}

module.exports = {
  createArraysOfParametersNeverRequestedAndRequested,
  checkRequestAndModifyDates,
  findEndDateToQueryParameters,
  runSemanticScorer,
};
