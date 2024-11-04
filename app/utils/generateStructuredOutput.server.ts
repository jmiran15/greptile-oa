import { zodResponseFormat } from "openai/helpers/zod.mjs";
import { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { z } from "zod";
import { openai } from "~/utils/providers.server";

interface CompletionConfig<TInput, TSchema extends z.ZodType> {
  model: string;
  systemPrompt: ChatCompletionMessageParam;
  createUserPrompt: (input: TInput) => ChatCompletionMessageParam;
  schema: TSchema;
  responseFormatKey: string;
  maxTokens?: number;
  temperature?: number;
}

export async function createCompletion<TInput, TSchema extends z.ZodType>({
  input,
  config,
}: {
  input: TInput;
  config: CompletionConfig<TInput, TSchema>;
}): Promise<z.infer<TSchema> | null> {
  const {
    model = "gpt-4o-mini",
    systemPrompt,
    createUserPrompt,
    schema,
    responseFormatKey,
    maxTokens = 2048,
    temperature = 0,
  } = config;

  try {
    const completion = await openai.beta.chat.completions.parse(
      {
        model,
        messages: [systemPrompt, createUserPrompt(input)],
        response_format: zodResponseFormat(schema, responseFormatKey),
        temperature,
        max_tokens: maxTokens,
      },
      {
        headers: {
          "Helicone-Property-Environment": process.env.NODE_ENV,
        },
      }
    );

    const result = completion.choices[0].message;

    if (result.parsed) {
      return result.parsed;
    } else if (result.refusal) {
      return null;
    }
  } catch (error) {
    if ((error as Error).constructor.name === "LengthFinishReasonError") {
      console.log("Too many tokens: ", (error as Error).message);
    } else {
      console.log("An error occurred: ", (error as Error).message);
    }
  }
  return null;
}
