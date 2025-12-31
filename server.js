require("dotenv").config();

// Initialize Winston logger (monkey-patches console methods)
const logger = require("./config/logger");

// Time check: Only run between 20:50 and 21:10 UTC (time of the Ubuntu server)
const targetTimeToStartAutomation = 21;
const now = new Date();
const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
const startMinutes = (targetTimeToStartAutomation - 1) * 60 + 55; // 20:50 UTC
const endMinutes = targetTimeToStartAutomation * 60 + 5; // 21:10 UTC

if (currentMinutes >= startMinutes && currentMinutes <= endMinutes) {
  console.log(`Running ${process.env.NAME_APP} between 20:55 and 21:05 UTC`);
  require("./index");
} else {
  console.log(
    `Not within allowed time window (20:55–21:05 UTC), exiting. Current UTC time: ${now.toISOString()}`
  );
}
