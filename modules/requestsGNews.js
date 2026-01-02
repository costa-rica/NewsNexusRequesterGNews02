const {
  Article,
  NewsApiRequest,
  EntityWhoFoundArticle,
  NewsArticleAggregatorSource,
} = require("newsnexus10db");
const {
  writeResponseDataFromNewsAggregator,
} = require("./utilitiesReadAndMakeFiles");
const {
  checkRequestAndModifyDates,
  runSemanticScorer,
} = require("./utilitiesMisc");
const logger = require("./logger");

async function requester(requestParametersObject, indexMaster) {
  // Step 1: prepare paramters
  const requestWindowInDays = 10; // how many days from startDate to endDate
  const andString = requestParametersObject.andString;
  const orString = requestParametersObject.orString;
  const notString = requestParametersObject.notString;
  const dateStartOfRequest = requestParametersObject.dateStartOfRequest;
  // logger.info(
  //   `dateStartOfRequest: ${dateStartOfRequest}, type: ${typeof dateStartOfRequest}`
  // );

  const dateEndOfRequest = new Date(
    new Date().setDate(
      new Date(dateStartOfRequest).getDate() + requestWindowInDays
    )
  )
    .toISOString()
    .split("T")[0];

  const gNewsSourceObj = await NewsArticleAggregatorSource.findOne({
    where: { nameOfOrg: process.env.NAME_OF_ORG_REQUESTING_FROM },
    raw: true, // Returns data without all the database gibberish
  });

  // Step 2: Modify the startDate and endDate if necessary
  const { adjustedStartDate, adjustedEndDate } =
    await checkRequestAndModifyDates(
      andString,
      orString,
      notString,
      dateStartOfRequest,
      dateEndOfRequest,
      gNewsSourceObj,
      requestWindowInDays
    );

  // Step 3: make the request
  let requestResponseData = null;
  let newsApiRequestObj = null;

  if (adjustedStartDate === adjustedEndDate) {
    logger.info(`No request needed for ${requestParametersObject.andString}`);
    return adjustedEndDate;
  }

  try {
    ({ requestResponseData, newsApiRequestObj } =
      await makeGNewsApiRequestDetailed(
        gNewsSourceObj,
        adjustedStartDate,
        adjustedEndDate,
        andString,
        orString,
        notString,
        indexMaster
      ));
  } catch (error) {
    logger.error("Error during GNews API request:", error);
    return; // prevent proceeding to storeGNewsArticles if request failed
  }

  // Step 4: store the articles
  if (!requestResponseData?.articles) {
    logger.info("No articles received from GNews API");
  } else {
    // Store articles and update NewsApiRequest
    await storeGNewsArticles(requestResponseData, newsApiRequestObj);
    logger.info(`completed NewsApiRequest.id: ${newsApiRequestObj.id}`);
  }

  return adjustedEndDate;
}

async function makeGNewsApiRequestDetailed(
  sourceObj,
  startDate,
  endDate,
  andString,
  orString,
  notString,
  indexMaster
) {
  function splitPreservingQuotes(str) {
    return str.match(/"[^"]+"|\S+/g)?.map((s) => s.trim()) || [];
  }

  const andArray = splitPreservingQuotes(andString ? andString : "");
  const orArray = splitPreservingQuotes(orString ? orString : "");
  const notArray = splitPreservingQuotes(notString ? notString : "");

  // Step 1: prepare token and dates
  if (!endDate) {
    logger.info("[makeGNewsApiRequestDetailed] no endDate !");
    endDate = new Date().toISOString().split("T")[0];
  }
  if (!startDate) {
    logger.info("[makeGNewsApiRequestDetailed] no startDate !");
    // startDate should be 90 days prior to endDate - account limitation
    startDate = new Date(new Date().setDate(new Date().getDate() - 90))
      .toISOString()
      .split("T")[0];
  }

  const queryParams = [];

  if (startDate) {
    queryParams.push(
      `from=${new Date(startDate).toISOString().replace(".000", "")}`
    );
  }
  if (endDate) {
    queryParams.push(
      `to=${new Date(endDate).toISOString().replace(".000", "")}`
    );
  }

  queryParams.push("lang=en", "country=us", `apikey=${sourceObj.apiKey}`);

  const lengthOfQueryParams = queryParams.join("&").length;
  const maxLength =
    process.env.MAX_LENGTH_OF_QUERY_PARAMS - lengthOfQueryParams;

  const queryWithinLimit = buildQueryWithinLimit(
    andArray,
    orArray,
    notArray,
    maxLength
  );

  if (queryWithinLimit) {
    queryParams.push(`q=${encodeURIComponent(queryWithinLimit)}`);
  }

  const requestUrl = `${sourceObj.url}search?${queryParams.join("&")}`;

  let status = "success";
  let requestResponseData = null;
  let newsApiRequestObj = null;
  if (process.env.ACTIVATE_API_REQUESTS_TO_OUTSIDE_SOURCES === "true") {
    const response = await fetch(requestUrl);
    // logger.info(`response_statue: ${response.status}`);
    requestResponseData = await response.json();

    if (!requestResponseData?.articles) {
      status = "error";
      logger.info(
        `🚧 Error: no articles received for dates of request: ${startDate} - ${endDate}`
      );
      writeResponseDataFromNewsAggregator(
        sourceObj.id,
        { id: `failed_indexMaster${indexMaster}`, url: requestUrl },
        requestResponseData,
        true
      );
      if (
        requestResponseData.errors.some(
          (e) =>
            e.toLowerCase().includes("request was blocked") ||
            e.toLowerCase().includes("too many requests") ||
            e.toLowerCase().includes("quota") ||
            e.toLowerCase().includes("request limit")
        )
      ) {
        logger.info(
          `--> ⛔ Ending process: rate limited by ${process.env.NAME_OF_ORG_REQUESTING_FROM}`
        );
        await runSemanticScorer();
        process.exit(1);
      }
      return { requestResponseData, newsApiRequestObj };
    }

    // Step 4: create new NewsApiRequest
    newsApiRequestObj = await NewsApiRequest.create({
      newsArticleAggregatorSourceId: sourceObj.id,
      dateStartOfRequest: startDate,
      dateEndOfRequest: endDate,
      countOfArticlesReceivedFromRequest: requestResponseData.articles?.length,
      countOfArticlesAvailableFromRequest: requestResponseData?.totalArticles,
      status,
      url: requestUrl,
      andString: andString,
      orString: orString,
      notString: notString,
      isFromAutomation: true,
    });
  } else {
    logger.info(` 🚧 ACTIVATE_API_REQUESTS_TO_OUTSIDE_SOURCES is false`);
    newsApiRequestObj = requestUrl;
  }

  logger.info(`requestUrl: ${requestUrl}`);

  return { requestResponseData, newsApiRequestObj };
}

// Store the articles of a single request in Aritcle and update NewsApiRequest
async function storeGNewsArticles(requestResponseData, newsApiRequestObj) {
  // leverages the hasOne association from the NewsArticleAggregatorSource model
  const gNewsSource = await NewsArticleAggregatorSource.findOne({
    where: { nameOfOrg: process.env.NAME_OF_ORG_REQUESTING_FROM },
    include: [{ model: EntityWhoFoundArticle }],
  });

  const entityWhoFoundArticleId = gNewsSource.EntityWhoFoundArticle?.id;
  try {
    let countOfArticlesSavedToDbFromRequest = 0;
    for (let article of requestResponseData.articles) {
      const existingArticle = await Article.findOne({
        where: { url: article.url },
      });
      if (existingArticle) {
        continue;
      }

      await Article.create({
        publicationName: article.source.name,
        title: article.title,
        description: article.description,
        url: article.url,
        urlToImage: article.image,
        publishedDate: article.publishedAt,
        entityWhoFoundArticleId: entityWhoFoundArticleId,
        newsApiRequestId: newsApiRequestObj.id,
      });
      countOfArticlesSavedToDbFromRequest++;
    }
    // Append NewsApiRequest
    await newsApiRequestObj.update({
      countOfArticlesSavedToDbFromRequest: countOfArticlesSavedToDbFromRequest,
    });

    writeResponseDataFromNewsAggregator(
      gNewsSource.id,
      newsApiRequestObj,
      requestResponseData,
      false
    );
  } catch (error) {
    logger.error(error);

    writeResponseDataFromNewsAggregator(
      gNewsSource.id,
      newsApiRequestObj,
      requestResponseData,
      true
    );
  }
}

function buildQueryWithinLimit(andArray, orArray, notArray, maxLength = 200) {
  // sanitize terms strip quotes if logical operator inside
  const sanitizeTerm = (term) => {
    const trimmed = term.trim();
    const containsLogicOps = /\b(AND|OR|NOT)\b/.test(trimmed.toUpperCase());
    if (trimmed.startsWith('"') && trimmed.endsWith('"') && containsLogicOps) {
      return trimmed.slice(1, -1); // strip quotes if logical operator inside
    }
    return trimmed; // keep quotes for phrases like "home fire"
  };
  const andPart =
    andArray.length > 0 ? andArray.map(sanitizeTerm).join(" AND ") : "";
  const orPart =
    orArray.length > 0 ? `(${orArray.map(sanitizeTerm).join(" OR ")})` : "";
  // const notParts = [];

  let baseQuery = [andPart, orPart].filter(Boolean).join(" AND ");
  let currentLength = baseQuery.length;
  let notParts = [];

  for (const notTerm of notArray) {
    const cleanTerm = sanitizeTerm(notTerm);
    const nextClause = ` AND NOT ${cleanTerm}`;
    if (currentLength + nextClause.length <= maxLength) {
      notParts.push(`NOT ${cleanTerm}`);
      currentLength += nextClause.length;
    } else {
      break;
    }
  }

  const notPart = notParts.join(" AND ");
  const fullQuery = [baseQuery, notPart].filter(Boolean).join(" AND ");
  return fullQuery;
}

module.exports = {
  storeGNewsArticles,
  makeGNewsApiRequestDetailed,
  requester,
};
