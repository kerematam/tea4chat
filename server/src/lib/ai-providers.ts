/**
 * AI Provider Abstraction
 * 
 * Unified interface for different AI providers (OpenAI, Anthropic, etc.)
 * Handles streaming and non-streaming responses with consistent error handling.
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { systemModels } from "../../prisma/seed";

// Common types for all providers
export interface AIMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AIStreamChunk {
  content: string;
  isComplete: boolean;
  metadata?: {
    model?: string;
    provider?: string;
    tokenCount?: number;
  };
}

export interface AIResponse {
  content: string;
  metadata: {
    model: string;
    provider: string;
    tokenCount?: number;
    finishReason?: string;
  };
}

export interface AIProviderConfig {
  apiKey: string;
  model: string | 'mock';
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
}

// Base provider interface
export interface AIProvider {
  readonly name: string | 'openai' | 'anthropic' | 'mock';
  readonly model: string;
  readonly supportedModels: string[];

  // Non-streaming methods
  generateResponse(messages: AIMessage[], config?: Partial<AIProviderConfig>): Promise<AIResponse>;

  // Streaming methods
  streamResponse(messages: AIMessage[], config?: Partial<AIProviderConfig>): AsyncIterable<AIStreamChunk>;

  // Utility methods
  validateConfig(config: AIProviderConfig): boolean;
  estimateTokens(messages: AIMessage[]): number;
}

// OpenAI Provider Implementation
export class OpenAIProvider implements AIProvider {
  readonly name = "openai";
  readonly model = "gpt-4o";
  readonly supportedModels = systemModels.filter(model => model.provider === "openai").map(model => model.name);
  private client: OpenAI;
  private defaultConfig: Partial<AIProviderConfig> = {
    maxTokens: 4096,
    temperature: 0.7,
    timeout: 30000
  };
  private config?: AIProviderConfig;

  constructor(config: AIProviderConfig) {
    this.client = new OpenAI({ apiKey: config.apiKey });
    this.config = config;
  }

  validateConfig(config: AIProviderConfig): boolean {
    return !!(config.apiKey && config.model && this.supportedModels.includes(config.model));
  }

  estimateTokens(messages: AIMessage[]): number {
    // Rough estimation: ~4 characters per token
    const totalChars = messages.reduce((sum, msg) => sum + msg.content.length, 0);
    return Math.ceil(totalChars / 4);
  }

  async generateResponse(messages: AIMessage[], config?: Partial<AIProviderConfig>): Promise<AIResponse> {
    const mergedConfig = { ...this.defaultConfig, ...this.config, ...config } as AIProviderConfig;

    try {
      const response = await this.client.chat.completions.create({
        model: mergedConfig.model!,
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        max_tokens: mergedConfig.maxTokens,
        temperature: mergedConfig.temperature,
        stream: false
      });

      const choice = response.choices[0];
      if (!choice?.message?.content) {
        throw new Error("No content received from OpenAI");
      }

      return {
        content: choice.message.content,
        metadata: {
          model: response.model,
          provider: this.name,
          tokenCount: response.usage?.total_tokens,
          finishReason: choice.finish_reason || undefined
        }
      };
    } catch (error) {
      throw new Error(`OpenAI API error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async* streamResponse(messages: AIMessage[], config?: Partial<AIProviderConfig>): AsyncIterable<AIStreamChunk> {
    const mergedConfig = { ...this.defaultConfig, ...this.config, ...config } as AIProviderConfig;
    try {
      const stream = await this.client.chat.completions.create({
        model: mergedConfig.model!,
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        max_tokens: mergedConfig.maxTokens,
        temperature: mergedConfig.temperature,
        stream: true
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        const isComplete = chunk.choices[0]?.finish_reason !== null;

        if (delta) {
          yield {
            content: delta,
            isComplete,
            metadata: {
              model: chunk.model,
              provider: this.name
            }
          };
        }

        if (isComplete) {
          break;
        }
      }
    } catch (error) {
      throw new Error(`OpenAI streaming error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// Anthropic Provider Implementation
export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  readonly model = "claude-3-5-sonnet-20241022";
  // INFO: check prisma/seed.ts for supported models
  readonly supportedModels = systemModels.filter(model => model.provider === "anthropic").map(model => model.name);

  private client: Anthropic;
  private defaultConfig: Partial<AIProviderConfig> = {
    maxTokens: 4096,
    temperature: 0.7,
    timeout: 30000
  };
  private config?: AIProviderConfig;

  constructor(config: AIProviderConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.config = config;
  }

  validateConfig(config: AIProviderConfig): boolean {
    console.log("validateConfig", config)
    console.log("supportedModels", this.supportedModels)
    console.log("config.model", config.model)
    console.log("config.apiKey", config.apiKey)
    console.log("this.supportedModels.includes(config.model)", this.supportedModels.includes(config.model))
    return !!(config.apiKey && config.model && this.supportedModels.includes(config.model));
  }

  estimateTokens(messages: AIMessage[]): number {
    // Anthropic uses similar token estimation to OpenAI
    const totalChars = messages.reduce((sum, msg) => sum + msg.content.length, 0);
    return Math.ceil(totalChars / 4);
  }

  private convertMessages(messages: AIMessage[]): Array<{ role: "user" | "assistant"; content: string }> {
    return messages
      .filter(msg => msg.role !== "system") // Anthropic handles system messages differently
      .map(msg => ({
        role: msg.role === "assistant" ? "assistant" as const : "user" as const,
        content: msg.content.trim()
      }))
      .filter(msg => msg.content.length > 0);
  }

  async generateResponse(messages: AIMessage[], config?: Partial<AIProviderConfig>): Promise<AIResponse> {
    const mergedConfig = { ...this.defaultConfig, ...this.config, ...config } as AIProviderConfig;
    const anthropicMessages = this.convertMessages(messages);

    try {
      const response = await this.client.messages.create({
        model: mergedConfig.model!,
        messages: anthropicMessages,
        max_tokens: mergedConfig.maxTokens!,
        temperature: mergedConfig.temperature,
        stream: false
      });

      const content = response.content
        .filter(block => block.type === 'text')
        .map(block => (block as any).text)
        .join('');

      if (!content) {
        throw new Error("No content received from Anthropic");
      }

      return {
        content,
        metadata: {
          model: response.model,
          provider: this.name,
          tokenCount: response.usage?.input_tokens + response.usage?.output_tokens,
          finishReason: response.stop_reason || undefined
        }
      };
    } catch (error) {
      throw new Error(`Anthropic API error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async* streamResponse(messages: AIMessage[], config?: Partial<AIProviderConfig>): AsyncIterable<AIStreamChunk> {
    const mergedConfig = { ...this.defaultConfig, ...config };
    const anthropicMessages = this.convertMessages(messages);

    try {
      const stream = await this.client.messages.create({
        model: mergedConfig.model!,
        messages: anthropicMessages,
        max_tokens: mergedConfig.maxTokens!,
        temperature: mergedConfig.temperature,
        stream: true
      });

      for await (const chunk of stream) {
        if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
          yield {
            content: chunk.delta.text,
            isComplete: false,
            metadata: {
              provider: this.name
            }
          };
        } else if (chunk.type === "message_stop") {
          yield {
            content: "",
            isComplete: true,
            metadata: {
              provider: this.name
            }
          };
          break;
        }
      }
    } catch (error) {
      throw new Error(`Anthropic streaming error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// Mock Provider Implementation (for testing and development)
export class MockProvider implements AIProvider {
  readonly name = "mock";
  readonly model = "mock-fast"; // default model for Mock provider
  readonly supportedModels = systemModels.filter(model => model.provider === "mock").map(model => model.name);

  private defaultConfig: Partial<AIProviderConfig> = {
    maxTokens: 150,
    temperature: 0.7,
    timeout: 10000
  };
  private config?: AIProviderConfig;

  private readonly randomWords = [
    "the", "quick", "brown", "fox", "jumps", "over", "lazy", "dog", "hello", "world",
    "artificial", "intelligence", "machine", "learning", "neural", "network", "algorithm",
    "data", "science", "technology", "innovation", "creative", "solution", "problem",
    "thinking", "process", "development", "programming", "code", "software", "system",
    "user", "interface", "experience", "design", "beautiful", "elegant", "efficient",
    "scalable", "robust", "reliable", "secure", "fast", "performance", "optimization",
    "database", "server", "client", "api", "endpoint", "request", "response", "stream",
    "async", "await", "promise", "callback", "event", "handler", "listener", "observer",
    "pattern", "architecture", "framework", "library", "package", "module", "component"
  ];

  constructor(config: AIProviderConfig) {
    this.config = config;
  }

  validateConfig(config: AIProviderConfig): boolean {
    return !!(config.model === "mock-fast" || config.model === "mock-slow" || config.model === "mock-verbose" || config.model === "mock-concise" || config.model === "mock-creative");
  }

  estimateTokens(messages: AIMessage[]): number {
    const totalChars = messages.reduce((sum, msg) => sum + msg.content.length, 0);
    return Math.ceil(totalChars / 4);
  }

  private getModelSpeed(model: string | 'mock-fast' | 'mock-slow' | 'mock-verbose' | 'mock-concise' | 'mock-creative'): number {
    switch (model) {
      case "mock-fast": return 50; // 50ms between words
      case "mock-slow": return 500; // 500ms between words
      case "mock-verbose": return 100; // 100ms, more words
      case "mock-concise": return 150; // 150ms, fewer words
      case "mock-creative": return 200; // 200ms, creative words
      default: return 100;
    }
  }

  private getWordCount(model: string, maxTokens: number): number {
    const baseCount = Math.min(maxTokens || 150, 200);
    switch (model) {
      case "mock-verbose": return Math.floor(baseCount * 1.5);
      case "mock-concise": return Math.floor(baseCount * 0.5);
      default: return baseCount;
    }
  }

  private generateRandomWord(): string {
    return this.randomWords[Math.floor(Math.random() * this.randomWords.length)] || "word";
  }

  private generateSentence(wordCount: number): string {
    const words: string[] = [];
    for (let i = 0; i < wordCount; i++) {
      words.push(this.generateRandomWord());
    }

    // Capitalize first word and add punctuation
    if (words.length > 0) {
      words[0] = words[0]!.charAt(0).toUpperCase() + words[0]!.slice(1);

      // Add some punctuation variety
      const lastWord = words[words.length - 1];
      const punctuation = Math.random() < 0.7 ? "." : Math.random() < 0.5 ? "!" : "?";
      words[words.length - 1] = lastWord + punctuation;
    }

    return words.join(" ");
  }

  async generateResponse(messages: AIMessage[], config?: Partial<AIProviderConfig>): Promise<AIResponse> {
    const mergedConfig = { ...this.defaultConfig, ...this.config, ...config } as AIProviderConfig;
    const wordCount = this.getWordCount(mergedConfig.model!, mergedConfig.maxTokens!);

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));
    const content = this.generateSentence(wordCount);

    return {
      content,
      metadata: {
        model: mergedConfig.model!,
        provider: this.name,
        tokenCount: Math.ceil(content.length / 4),
        finishReason: "stop"
      }
    };
  }

  async* streamResponse(messages: AIMessage[], config?: Partial<AIProviderConfig>): AsyncIterable<AIStreamChunk> {
    const mergedConfig = { ...this.defaultConfig, ...this.config, ...config } as AIProviderConfig;
    const speed = this.getModelSpeed(mergedConfig.model!);
    const wordCount = this.getWordCount(mergedConfig.model!, mergedConfig.maxTokens!);

    console.log(`🎭 Mock provider starting stream: ${wordCount} words at ${speed}ms intervals`);

    let generatedWords = 0;
    let currentSentenceWords = 0;
    const wordsPerSentence = 8 + Math.floor(Math.random() * 12); // 8-19 words per sentence

    while (generatedWords < wordCount) {
      const word = this.generateRandomWord();
      let content = word;

      // Add punctuation and capitalization logic
      if (currentSentenceWords === 0) {
        // Capitalize first word of sentence
        content = content.charAt(0).toUpperCase() + content.slice(1);
      }

      currentSentenceWords++;
      generatedWords++;

      // End sentence logic
      if (currentSentenceWords >= wordsPerSentence || generatedWords === wordCount) {
        const punctuation = Math.random() < 0.7 ? "." : Math.random() < 0.5 ? "!" : "?";
        content += punctuation;
        currentSentenceWords = 0;

        // Add space for next sentence (except for last word)
        if (generatedWords < wordCount) {
          content += " ";
        }
      } else {
        // Add space between words
        content += " ";
      }

      yield {
        content,
        isComplete: false,
        metadata: {
          model: mergedConfig.model!,
          provider: this.name
        }
      };

      // Wait before next word
      await new Promise(resolve => setTimeout(resolve, speed));
    }

    // Send completion signal
    yield {
      content: "",
      isComplete: true,
      metadata: {
        model: mergedConfig.model!,
        provider: this.name,
        tokenCount: wordCount
      }
    };

    console.log(`🎭 Mock provider completed stream: ${generatedWords} words generated`);
  }
}

// Provider Factory
export class AIProviderFactory {
  private static providers = new Map<string, new (config: AIProviderConfig) => AIProvider>();

  static {
    // Register built-in providers
    this.registerProvider("openai", OpenAIProvider);
    this.registerProvider("anthropic", AnthropicProvider);
    this.registerProvider("mock", MockProvider);
  }

  static registerProvider(name: string, providerClass: new (config: AIProviderConfig) => AIProvider): void {
    this.providers.set(name, providerClass);
  }

  static createProvider(name: string, config: AIProviderConfig): AIProvider {
    const ProviderClass = this.providers.get(name);
    if (!ProviderClass) {
      throw new Error(`Unknown AI provider: ${name}. Available providers: ${Array.from(this.providers.keys()).join(", ")}`);
    }

    const provider = new ProviderClass(config);
    const isValid = provider.validateConfig(config);
    if (!isValid) {
      throw new Error(`Invalid configuration for provider: ${name}`);
    }

    return provider;
  }

  static getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  static getSupportedModels(providerName: string): string[] {
    const ProviderClass = this.providers.get(providerName);
    if (!ProviderClass) {
      throw new Error(`Unknown AI provider: ${providerName}`);
    }

    // Create a temporary instance to get supported models
    try {
      const tempProvider = new ProviderClass({ apiKey: "temp", model: "temp" });
      return tempProvider.supportedModels;
    } catch {
      return [];
    }
  }
}

// Utility function for easy provider creation
export function createAIProvider(providerName: string, config: AIProviderConfig): AIProvider {
  return AIProviderFactory.createProvider(providerName, config);
}

// Helper function to create provider from database model and user settings
export function createAIProviderFromModel(
  model: {
    provider: string | 'openai' | 'anthropic' | 'mock';
    name: string | 'gpt-4o' | 'claude-3-5-sonnet-20241022' | 'claude-3-5-haiku-20241022' | 'claude-3-opus-20240229' | 'claude-3-sonnet-20240229' | 'claude-3-haiku-20240307' | 'gpt-4' | 'gpt-4-turbo' | 'gpt-4o-mini' | 'gpt-3.5-turbo' | 'gpt-3.5-turbo-16k'
  },
  userSettings: { openaiApiKey?: string | null; anthropicApiKey?: string | null },
  overrideConfig?: Partial<AIProviderConfig>
): AIProvider {
  let apiKey: string;

  if (model.provider === "mock") {
    apiKey = "mock-api-key";
  } else if (model.provider === "anthropic") {
    apiKey = userSettings.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY ?? "";
  } else if (model.provider === "openai") {
    apiKey = userSettings.openaiApiKey ?? process.env.OPENAI_API_KEY ?? "";
  } else {
    throw new Error(`Unknown provider: ${model.provider}`);
  }

  if (!apiKey.trim()) {
    throw new Error(`${model.provider} API key not configured`);
  }

  const config: AIProviderConfig = {
    apiKey,
    model: model.name,
    maxTokens: 4096,
    temperature: 0.7,
    timeout: 30000,
    ...overrideConfig,
  };

  return createAIProvider(model.provider, config);
}

// Provider-agnostic streaming helper
export async function* streamAIResponse(
  provider: AIProvider,
  messages: AIMessage[],
  config?: Partial<AIProviderConfig>
): AsyncIterable<AIStreamChunk> {
  try {
    for await (const chunk of provider.streamResponse(messages, config)) {
      yield chunk;
    }
  } catch (error) {
    throw new Error(`AI streaming failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Provider-agnostic response helper
export async function generateAIResponse(
  provider: AIProvider,
  messages: AIMessage[],
  config?: Partial<AIProviderConfig>
): Promise<AIResponse> {
  try {
    return await provider.generateResponse(messages, config);
  } catch (error) {
    throw new Error(`AI generation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
} 