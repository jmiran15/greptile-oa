import Anthropic from "@anthropic-ai/sdk";
import { CohereClient } from "cohere-ai";
import { Octokit } from "octokit";
import OpenAI from "openai";

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: "https://oai.helicone.ai/v1",
  defaultHeaders: {
    "Helicone-Auth": "Bearer pk-helicone-ivx7gdy-mbfezoy-tgk3pda-wvlzxzi",
  },
});

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const cohere = new CohereClient({
  token: process.env.COHERE_API_KEY,
});

export function createGitHubClient(accessToken: string) {
  return new Octokit({ auth: accessToken });
}
