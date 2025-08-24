import type { Prisma } from "@prisma/client";

export const publicMessageSelect = {
  id: true,
  createdAt: true,
  chatId: true,

  // Combined user + agent content
  userContent: true,
  agentContent: true,

  // Metadata
  status: true,
  finishedAt: true,

  // Analytics (optional)
  promptTokens: true,
  completionTokens: true,
  totalTokens: true,
  providerLatencyMs: true,
  firstByteMs: true,
  errorReason: true,
  metadata: true,
} as const;

export type PublicMessage = Prisma.MessageGetPayload<{
  select: typeof publicMessageSelect;
}>;


