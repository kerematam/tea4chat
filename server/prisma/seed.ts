import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const systemModels = [
    {
      provider: "openai",
      name: "gpt-4o",
      description: "OpenAI flagship GPT-4o model",
    },
    {
      provider: "openai",
      name: "gpt-4o-mini",
      description: "OpenAI GPT-4o Mini model",
    },
    {
      provider: "openai",
      name: "gpt-3.5-turbo",
      description: "OpenAI GPT-3.5 Turbo model",
    },
    {
      provider: "openai",
      name: "gpt-4.1",
      description: "OpenAI GPT-4.1 model",
    },
    {
      provider: "openai",
      name: "gpt-4.1-mini",
      description: "OpenAI GPT-4.1 Mini model",
    },
    {
      provider: "openai",
      name: "gpt-4.1-nano",
      description: "OpenAI GPT-4.1 Nano model",
    },
    {
      provider: "openai",
      name: "o3-mini",
      description: "OpenAI o3 Mini model",
    },
    {
      provider: "anthropic",
      name: "claude-3-5-sonnet-20241022",
      description: "Anthropic Claude-3.5 Sonnet (October 2024)",
    },
    {
      provider: "anthropic",
      name: "claude-3-5-haiku-20241022",
      description: "Anthropic Claude-3.5 Haiku model",
    },
    {
      provider: "anthropic",
      name: "claude-3-opus-20240229",
      description: "Anthropic Claude-3 Opus model",
    },
    {
      provider: "anthropic",
      name: "claude-3-5-sonnet-20240620",
      description: "Anthropic Claude-3.5 Sonnet (June 2024)",
    },
    {
      provider: "anthropic",
      name: "claude-sonnet-4-0",
      description: "Anthropic Claude-4 Sonnet model",
    },
    {
      provider: "anthropic",
      name: "claude-opus-4-0",
      description: "Anthropic Claude-4 Opus model",
    },
    {
      provider: "anthropic",
      name: "claude-3-5-sonnet-latest",
      description: "Anthropic Claude-3.5 Sonnet (Latest)",
    },
    {
      provider: "anthropic",
      name: "claude-3-7-sonnet-latest",
      description: "Anthropic Claude-3.7 Sonnet (Latest)",
    },
  ];

  for (const model of systemModels) {
    // Deterministic ID so upsert can target it
    const id = `sys_${model.provider}_${model.name}`;

    await prisma.modelCatalog.upsert({
      where: { id },
      update: {
        description: model.description,
        isEnabled: true,
        isPublic: true,
      },
      create: {
        id,
        provider: model.provider,
        name: model.name,
        description: model.description,
        isPublic: true,
        isEnabled: true,
      },
    });
    console.log(`✔️  Seeded provider: ${model.provider}, model: ${model.name}`);
  }
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 