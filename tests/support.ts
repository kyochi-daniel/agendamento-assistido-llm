import { z } from 'zod/v3';
import type { StructuredGenerator } from '../src/services/openRouterService.ts';

export function fakeLLM(responses: unknown[]): StructuredGenerator & { prompts: string[] } {
  const prompts: string[] = [];
  return {
    prompts,
    async generateStructured<T>(_system: string, user: string, schema: z.ZodSchema<T>) {
      prompts.push(user);
      const value = responses.shift();
      if (value instanceof Error) return { success: false, error: value.message };
      return { success: true, data: schema.parse(value) };
    },
  };
}
