// Explicitly enables the fictional demo accounts when serving the production build.
process.env.DEMO_MODE = "1";
await import("../server/index.mjs");
