import { z } from "zod";
import { router } from "../trpc";
import { withOwnerProcedure } from "../procedures";
import { PrismaClient } from "@prisma/client";
import { cacheHelpers } from "../lib/redis";

const prisma = new PrismaClient();

export const settingsRouter = router({
  // Get user settings including API keys (masked for security)
  get: withOwnerProcedure
    .query(async ({ ctx }) => {
      if (!ctx.owner) {
        throw new Error("Owner not found");
      }

      // Try to get from cache first
      const cachedSettings = await cacheHelpers.getOwnerSettings(ctx.owner.id);
      if (cachedSettings) {
        return {
          ...cachedSettings,
          // Mask API keys for security (show only first 8 chars + asterisks)
          openaiApiKey: cachedSettings.openaiApiKey 
            ? `${cachedSettings.openaiApiKey.substring(0, 8)}${'*'.repeat(32)}`
            : null,
          anthropicApiKey: cachedSettings.anthropicApiKey 
            ? `${cachedSettings.anthropicApiKey.substring(0, 12)}${'*'.repeat(32)}`
            : null,
        };
      }

      const settings = await prisma.ownerSettings.findUnique({
        where: {
          ownerId: ctx.owner.id,
        },
        include: {
          model: {
            select: {
              id: true,
              name: true,
              provider: true,
              description: true,
            },
          },
        },
      });

      // If no settings exist, create default ones
      if (!settings) {
        const defaultSettings = await prisma.ownerSettings.create({
          data: {
            ownerId: ctx.owner.id,
          },
          include: {
            model: {
              select: {
                id: true,
                name: true,
                provider: true,
                description: true,
              },
            },
          },
        });

        // Cache the settings for 5 minutes
        await cacheHelpers.setOwnerSettings(ctx.owner.id, defaultSettings, 300);

        return {
          ...defaultSettings,
          openaiApiKey: null,
          anthropicApiKey: null,
        };
      }

      // Cache the settings for 5 minutes
      await cacheHelpers.setOwnerSettings(ctx.owner.id, settings, 300);

      return {
        ...settings,
        // Mask API keys for security (show only first 8 chars + asterisks)
        openaiApiKey: settings.openaiApiKey 
          ? `${settings.openaiApiKey.substring(0, 8)}${'*'.repeat(32)}`
          : null,
        anthropicApiKey: settings.anthropicApiKey 
          ? `${settings.anthropicApiKey.substring(0, 12)}${'*'.repeat(32)}`
          : null,
      };
    }),

  // Update API keys
  updateApiKeys: withOwnerProcedure
    .input(
      z.object({
        openaiApiKey: z.string().optional(),
        anthropicApiKey: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.owner) {
        throw new Error("Owner not found");
      }

      // Validate API key formats
      if (input.openaiApiKey && !input.openaiApiKey.startsWith('sk-')) {
        throw new Error("Invalid OpenAI API key format. Must start with 'sk-'");
      }

      if (input.anthropicApiKey && !input.anthropicApiKey.startsWith('sk-ant-')) {
        throw new Error("Invalid Anthropic API key format. Must start with 'sk-ant-'");
      }

      // Prepare update data - only include fields that are provided
      const updateData: { openaiApiKey?: string | null; anthropicApiKey?: string | null } = {};
      
      if (input.openaiApiKey !== undefined) {
        updateData.openaiApiKey = input.openaiApiKey || null;
      }
      
      if (input.anthropicApiKey !== undefined) {
        updateData.anthropicApiKey = input.anthropicApiKey || null;
      }

      // Update or create settings
      const updatedSettings = await prisma.ownerSettings.upsert({
        where: {
          ownerId: ctx.owner.id,
        },
        update: updateData,
        create: {
          ownerId: ctx.owner.id,
          ...updateData,
        },
        include: {
          model: {
            select: {
              id: true,
              name: true,
              provider: true,
              description: true,
            },
          },
        },
      });

      // Invalidate cache
      await cacheHelpers.invalidateOwnerSettings(ctx.owner.id);

      return {
        success: true,
        message: "API keys updated successfully",
        settings: {
          ...updatedSettings,
          // Mask API keys for security in response
          openaiApiKey: updatedSettings.openaiApiKey 
            ? `${updatedSettings.openaiApiKey.substring(0, 8)}${'*'.repeat(32)}`
            : null,
          anthropicApiKey: updatedSettings.anthropicApiKey 
            ? `${updatedSettings.anthropicApiKey.substring(0, 12)}${'*'.repeat(32)}`
            : null,
        },
      };
    }),

  // Update default model
  updateDefaultModel: withOwnerProcedure
    .input(
      z.object({
        defaultModelId: z.string().nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.owner) {
        throw new Error("Owner not found");
      }

      // If a model ID is provided, verify it exists and the user has access to it
      if (input.defaultModelId) {
        const model = await prisma.modelCatalog.findFirst({
          where: {
            id: input.defaultModelId,
            OR: [
              { ownerId: null }, // System model
              { ownerId: ctx.owner.id }, // User's own model
              { isPublic: true }, // Public model
            ],
          },
        });

        if (!model) {
          throw new Error("Model not found or access denied");
        }
      }

      // Update or create settings
      const updatedSettings = await prisma.ownerSettings.upsert({
        where: {
          ownerId: ctx.owner.id,
        },
        update: {
          defaultModelId: input.defaultModelId,
        },
        create: {
          ownerId: ctx.owner.id,
          defaultModelId: input.defaultModelId,
        },
        include: {
          model: {
            select: {
              id: true,
              name: true,
              provider: true,
              description: true,
            },
          },
        },
      });

      // Invalidate cache
      await cacheHelpers.invalidateOwnerSettings(ctx.owner.id);

      return {
        success: true,
        message: "Default model updated successfully",
        settings: {
          ...updatedSettings,
          // Mask API keys for security in response
          openaiApiKey: updatedSettings.openaiApiKey 
            ? `${updatedSettings.openaiApiKey.substring(0, 8)}${'*'.repeat(32)}`
            : null,
          anthropicApiKey: updatedSettings.anthropicApiKey 
            ? `${updatedSettings.anthropicApiKey.substring(0, 12)}${'*'.repeat(32)}`
            : null,
        },
      };
    }),

  // Get raw API keys for internal use (not exposed to frontend)
  getRawApiKeys: withOwnerProcedure
    .query(async ({ ctx }) => {
      if (!ctx.owner) {
        throw new Error("Owner not found");
      }

      const settings = await prisma.ownerSettings.findUnique({
        where: {
          ownerId: ctx.owner.id,
        },
        select: {
          openaiApiKey: true,
          anthropicApiKey: true,
        },
      });

      return {
        openaiApiKey: settings?.openaiApiKey || null,
        anthropicApiKey: settings?.anthropicApiKey || null,
      };
    }),

  // Delete API keys
  deleteApiKeys: withOwnerProcedure
    .input(
      z.object({
        deleteOpenai: z.boolean().default(false),
        deleteAnthropic: z.boolean().default(false),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.owner) {
        throw new Error("Owner not found");
      }

      if (!input.deleteOpenai && !input.deleteAnthropic) {
        throw new Error("Must specify at least one API key to delete");
      }

      // Prepare update data
      const updateData: { openaiApiKey?: null; anthropicApiKey?: null } = {};
      
      if (input.deleteOpenai) {
        updateData.openaiApiKey = null;
      }
      
      if (input.deleteAnthropic) {
        updateData.anthropicApiKey = null;
      }

      // Update settings
      const updatedSettings = await prisma.ownerSettings.upsert({
        where: {
          ownerId: ctx.owner.id,
        },
        update: updateData,
        create: {
          ownerId: ctx.owner.id,
          ...updateData,
        },
        include: {
          model: {
            select: {
              id: true,
              name: true,
              provider: true,
              description: true,
            },
          },
        },
      });

      // Invalidate cache
      await cacheHelpers.invalidateOwnerSettings(ctx.owner.id);

      const deletedKeys = [];
      if (input.deleteOpenai) deletedKeys.push("OpenAI");
      if (input.deleteAnthropic) deletedKeys.push("Anthropic");

      return {
        success: true,
        message: `${deletedKeys.join(" and ")} API key${deletedKeys.length > 1 ? 's' : ''} deleted successfully`,
        settings: {
          ...updatedSettings,
          openaiApiKey: null,
          anthropicApiKey: null,
        },
      };
    }),
}); 