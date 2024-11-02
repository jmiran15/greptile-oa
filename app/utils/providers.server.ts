import { App } from "octokit";
import OpenAI from "openai";

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: "https://oai.helicone.ai/v1",
  defaultHeaders: {
    "Helicone-Auth": "Bearer pk-helicone-ivx7gdy-mbfezoy-tgk3pda-wvlzxzi",
  },
});

if (
  !process.env.APP_ID ||
  !process.env.PRIVATE_KEY ||
  !process.env.INSTALLATION_ID
) {
  throw new Error("APP_ID, PRIVATE_KEY and INSTALLATION_ID must be set");
}

const app = new App({
  appId: process.env.APP_ID,
  privateKey: process.env.PRIVATE_KEY,
});

export const octokit = await app.getInstallationOctokit(
  parseInt(process.env.INSTALLATION_ID)
);
