require("dotenv").config();
console.log("Starting NewsNexusRequesterGNews02");
const {
  getRequestsParameterArrayFromExcelFile,
} = require("./modules/utilitiesReadAndMakeFiles");
const {
  createArraysOfParametersNeverRequestedAndRequested,
  findEndDateToQueryParameters,
  runSemanticScorer,
} = require("./modules/utilitiesMisc");
const { requester } = require("./modules/requestsGNews");

console.log(
  `--------------------------------------------------------------------------------`
);
console.log(`- Start ${process.env.APP_NAME} ${new Date().toISOString()} --`);
console.log(
  `MILISECONDS_IN_BETWEEN_REQUESTS: ${process.env.MILISECONDS_IN_BETWEEN_REQUESTS}`
);
console.log(
  `--------------------------------------------------------------------------------`
);

async function main() {
  console.log("Starting main function");
  // Step 1: Create Array of Parameters for Requests - prioritized based on dateEndOfRequest
  // Step 1.1: Get the query objects from Excel file
  const queryObjects = getRequestsParameterArrayFromExcelFile();

  // Step 1.2: Create arrays of parameters never requested and requested
  const { arrayOfParametersNeverRequested, arrayOfParametersRequested } =
    await createArraysOfParametersNeverRequestedAndRequested(queryObjects);

  // Step 1.3: Sort the requested array in ascending order by dateEndOfRequest
  const arrayOfParametersRequestedSortedAscendingByDateEndOfRequest =
    arrayOfParametersRequested.sort((a, b) => {
      return new Date(a.dateEndOfRequest) - new Date(b.dateEndOfRequest);
    });

  // Step 1.4: Create the prioritized array
  const arrayOfPrioritizedParameters = [
    ...arrayOfParametersNeverRequested,
    ...arrayOfParametersRequestedSortedAscendingByDateEndOfRequest,
  ];

  // Step 1.5: Add the endDate to each request from the existing NewsApiRequests table
  for (let i = 0; i < arrayOfPrioritizedParameters.length; i++) {
    arrayOfPrioritizedParameters[i].dateEndOfRequest =
      await findEndDateToQueryParameters(arrayOfPrioritizedParameters[i]);
    if (i % 1000 === 0) {
      console.log(
        `-- ${i} of ${arrayOfPrioritizedParameters.length} rows processed --`
      );
    }
  }

  if (arrayOfPrioritizedParameters.length === 0) {
    console.log(
      "--- No (unrequested)request parameters found in Excel file. Exiting process. ---"
    );
    return;
  }

  // Step 2: Process the requests
  let indexMaster = 0;
  let index = 0;

  while (true) {
    const currentParams = arrayOfPrioritizedParameters[index];
    let dateEndOfRequest;

    console.log(
      `-- ${index}: Start processing request for AND ${currentParams.andString} OR ${currentParams.orString} NOT ${currentParams.notString}`
    );
    // Step 2.1: Verify that dateEndOfRequest is today or prior
    if (
      new Date(currentParams?.dateEndOfRequest) <=
      new Date(new Date().toISOString().split("T")[0])
    ) {
      dateEndOfRequest = await requester(currentParams, indexMaster);
      currentParams.dateEndOfRequest = dateEndOfRequest;
    }
    // Step 2.2: Respect pacing
    await sleep(process.env.MILISECONDS_IN_BETWEEN_REQUESTS);
    console.log(`End of ${index} request loop --`);
    index++;
    indexMaster++;
    if (
      indexMaster > Number(process.env.LIMIT_MASTER_INDEX_OF_WHILE_TRUE_LOOP)
    ) {
      console.log(
        `--- End due to indexMaster > ${process.env.LIMIT_MASTER_INDEX_OF_WHILE_TRUE_LOOP} ---`
      );
      await runSemanticScorer();
      break;
    }

    // Step 2.3: Check if all requests have been processed
    // Step 2.3.1: [End process] Check if all requests have been processed and dateEndOfRequest is today
    if (
      index === arrayOfPrioritizedParameters.length &&
      dateEndOfRequest === new Date().toISOString().split("T")[0]
    ) {
      console.log(`--- [End process] All GNews queries updated ---`);
      await runSemanticScorer();
      break;
    }

    // Step 2.3.2: [Restart looping]Check if all requests have been processed and dateEndOfRequest is not today
    if (index === arrayOfPrioritizedParameters.length) {
      console.log(
        `--- [Restart looping] Went through all ${arrayOfPrioritizedParameters.length} queries and dateEndOfRequest is not today ---`
      );
      index = 0;
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main();
