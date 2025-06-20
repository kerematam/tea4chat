export const DEFAULT_OWNER_SETTINGS = {
    /**
     * @caveat
     * check model id defined in prisma/seed.ts
     */
    defaultModelId: "sys_openai_gpt-4o",
    openaiApiKey: null,
    anthropicApiKey: null,
    extra: {},
} as const;


/**
 * @caveat
 * check model id defined in prisma/seed.ts
 */
export const FALLBACK_MODEL_ID = "sys_openai_gpt-4o-mini";

// TODO: import from prisma/seed.ts
export const FALLBACK_MODEL = {
    provider: "openai",
    name: "gpt-4o-mini",
    description: "OpenAI GPT-4o Mini model",
} as const;