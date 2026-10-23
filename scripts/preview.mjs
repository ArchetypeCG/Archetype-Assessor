// Local training preview retains the fictional learner records. Live startup uses npm start.
process.env.DEMO_MODE = "1";
await import("../server/index.mjs");
