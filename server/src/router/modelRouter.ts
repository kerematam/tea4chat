import { z } from "zod";
import { router } from "../trpc";
import { withOwnerProcedure } from "../procedures";
import { PrismaClient } from "@prisma/client";
import { FALLBACK_MODEL_ID } from "../constants/defaultOwnerSettings";

const prisma = new PrismaClient();

export const modelRouter = router({
  /**
   * List models visible to the requester.
   * Returns:
   *   - system models (ownerId = null, isEnabled = true)
   *   - plus, if authenticated, their own custom models.
   *
   * Optional flags allow narrowing the result set.
   */
  list: withOwnerProcedure
    .input(
      z
        .object({
          includeSystem: z.boolean().optional().default(true),
          includeCustom: z.boolean().optional().default(true),
          onlyEnabled: z.boolean().optional().default(true),
        })
        .optional()
        .default({})
    )
    .query(async ({ input, ctx }) => {
      const { includeSystem, includeCustom, onlyEnabled } = input;

      // Build dynamic "where" clause
      const filters: any = {};
      if (onlyEnabled) filters.isEnabled = true;

      // Determine owner conditions
      if (includeSystem && includeCustom && ctx.owner) {
        filters.OR = [{ ownerId: null }, { ownerId: ctx.owner.id }];
      } else if (includeSystem && !includeCustom) {
        filters.ownerId = null;
      } else if (!includeSystem && includeCustom && ctx.owner) {
        filters.ownerId = ctx.owner.id;
      } else if (!ctx.owner) {
        // If requester has no owner context, fall back to system models only
        filters.ownerId = null;
      }

      // Single query to get all models, ordered by provider then name
      const models = await prisma.modelCatalog.findMany({
        where: filters,
        orderBy: [{ provider: "asc" }, { name: "asc" }]
      });

      // Group models by provider in memory (efficient since it's already sorted)
      const providersMap = new Map<string, typeof models>();
      
      models.forEach((model) => {
        if (!providersMap.has(model.provider)) {
          providersMap.set(model.provider, []);
        }
        providersMap.get(model.provider)!.push(model);
      });

      // Convert to array format with provider info
      const providers = Array.from(providersMap.entries()).map(([provider, providerModels]) => ({
        provider,
        models: providerModels,
        count: providerModels.length,
      }));

      return {
        providers,
        totalModels: models.length,
        totalProviders: providersMap.size,
      };
    }),

  /**
   * Get model selection info including default, chat-specific, and fallback models.
   */
  getSelection: withOwnerProcedure
    .input(
      z.object({
        chatId: z.string().optional(),
      }).optional().default({})
    )
    .query(async ({ input, ctx }) => {
      const { chatId } = input;

      // Helper to fetch model details
      const fetchModel = async (id: string | null) => {
        if (!id) return null;
        const m = await prisma.modelCatalog.findUnique({
          where: { id },
          select: { id: true, name: true, provider: true },
        });
        return m;
      };

      // Get owner's default model id
      const defaultModelId = ctx.owner?.settings?.defaultModelId || null;

      // Get chat's selected model id (with permission check)
      let chatModelId: string | null = null;
      if (chatId) {
        const chat = await prisma.chat.findUnique({
          where: { id: chatId },
          select: { modelId: true, ownerId: true },
        });

        if (!chat) {
          throw new Error("Chat not found");
        }

        if (ctx.owner && chat.ownerId !== ctx.owner.id) {
          throw new Error("Unauthorized: Chat does not belong to you");
        }

        chatModelId = chat.modelId || null;
      }

      // Fetch model objects
      const [defaultModel, chatModel, fallbackModel] = await Promise.all([
        fetchModel(defaultModelId),
        fetchModel(chatModelId),
        fetchModel(FALLBACK_MODEL_ID),
      ]);

      // Determine selected following priority
      const selectedModel = chatModel || defaultModel || fallbackModel;

      return {
        default: defaultModel,
        chat: chatModel,
        fallback: fallbackModel,
        selected: selectedModel,
      };
    }),

  /**
   * Update owner's default model selection.
   */
  updateDefault: withOwnerProcedure
    .input(
      z.object({
        modelId: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { modelId } = input;

      if (!ctx.owner) {
        throw new Error("Owner context required");
      }

      // Verify the model exists and is accessible to this owner
      const model = await prisma.modelCatalog.findFirst({
        where: {
          id: modelId,
          isEnabled: true,
          OR: [
            { ownerId: null }, // System model
            { ownerId: ctx.owner.id }, // Owner's custom model
          ],
        },
      });

      if (!model) {
        throw new Error("Model not found or not accessible");
      }

      // Update owner's default model
      await prisma.ownerSettings.upsert({
        where: { ownerId: ctx.owner.id },
        update: { defaultModelId: modelId },
        create: {
          ownerId: ctx.owner.id,
          defaultModelId: modelId,
          openaiApiKey: null,
          anthropicApiKey: null,
          extra: {},
        },
      });

      return { success: true, modelId };
    }),

  /**
   * Update model selection for a specific chat.
   */
  updateChatModel: withOwnerProcedure
    .input(
      z.object({
        chatId: z.string(),
        modelId: z.string().nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { chatId, modelId } = input;

      if (!ctx.owner) {
        throw new Error("Owner context required");
      }

      // First, verify chat belongs to owner
      const chat = await prisma.chat.findUnique({
        where: { id: chatId },
        select: { ownerId: true },
      });

      if (!chat) {
        throw new Error("Chat not found");
      }

      if (chat.ownerId !== ctx.owner.id) {
        throw new Error("Unauthorized: Chat does not belong to you");
      }

      // If modelId is provided, verify it exists and is accessible
      if (modelId) {
        const model = await prisma.modelCatalog.findFirst({
          where: {
            id: modelId,
            isEnabled: true,
            OR: [
              { ownerId: null }, // System model
              { ownerId: ctx.owner.id }, // Owner's custom model
            ],
          },
        });

        if (!model) {
          throw new Error("Model not found or not accessible");
        }
      }

      // Update chat's model (null to clear override and use default)
      await prisma.chat.update({
        where: { id: chatId },
        data: { modelId },
      });

      return { success: true, chatId, modelId };
    }),
}); 