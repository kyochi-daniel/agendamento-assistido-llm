import { ChatOpenAI } from "@langchain/openai";
import type { ModelConfig } from "../config.ts";
import { z } from 'zod/v3'
import { createAgent, HumanMessage, providerStrategy, SystemMessage } from "langchain";

export type StructuredResult<T> = { success: true; data: T } | { success: false; error: string };
export interface StructuredGenerator {
    generateStructured<T>(systemPrompt: string, userPrompt: string, schema: z.ZodSchema<T>): Promise<StructuredResult<T>>;
}

export class OpenRouterService implements StructuredGenerator {
    private config: ModelConfig
    private llmClient: ChatOpenAI

    constructor(config: ModelConfig) {
        this.config = config

        this.llmClient = new ChatOpenAI({
            apiKey: this.config.apiKey,
            modelName: this.config.models.at(0),
            temperature: this.config.temperature,
            configuration: {
                baseURL: 'https://openrouter.ai/api/v1',
                defaultHeaders: {
                    'HTTP-Referer': this.config.httpReferer,
                    'X-Title': this.config.xTitle
                }
            },

            timeout: 30_000,
            maxRetries: 0,
        })
    }

    async generateStructured<T>(
        systemPrompt: string,
        userPrompt: string,
        schema: z.ZodSchema<T>
    ): Promise<StructuredResult<T>> {
        try {
            const agent = createAgent({
                model: this.llmClient,
                tools: [],
                responseFormat: providerStrategy(schema)
            })
            const messages = [
                new SystemMessage(systemPrompt),
                new HumanMessage(userPrompt)
            ]
            const data = await agent.invoke({ messages })
            return {
                success: true,
                data: schema.parse(data.structuredResponse),
            }
        } catch (error) {
            return {
                success: false,
                error: 'Falha ao consultar o modelo.',
            }
        }
    }
}
