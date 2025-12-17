import { Perplexity } from "@perplexity-ai/perplexity_ai";

export const perplexity = new Perplexity({ apiKey: process.env.PERPLEXITY_API_KEY });