/**
 * Product tagging CLI (offline job, LLM).
 *
 *   pnpm --filter @dafitmatch/api tag:products -- --limit 500
 *   pnpm --filter @dafitmatch/api tag:products -- --dry-run
 *
 * Uses the service-role client: catalog writes are not user-scoped (RLS stays on for the app).
 * The prompt only sees the product title, brand, category and price.
 */
import { loadEnv } from '../../env';
import { createServiceClient } from '../../lib/supabase-admin';
import { tagProducts } from './index';
import { buildTaggingPrompt, type TagBatchResult, type TagInput, type TagModel } from './prompt';

interface Args {
  limit: number;
  batchSize: number;
  retag: boolean;
  dryRun: boolean;
  model: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    limit: 0,
    batchSize: 20,
    retag: false,
    dryRun: false,
    model: '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    const next = () => argv[++i] ?? '';
    if (arg === '--limit' || arg === '-l') args.limit = Number(next());
    else if (arg === '--batch-size' || arg === '-b') args.batchSize = Number(next());
    else if (arg === '--model' || arg === '-m') args.model = next();
    else if (arg === '--retag') args.retag = true;
    else if (arg === '--dry-run') args.dryRun = true;
  }
  return args;
}

async function buildModel(modelName: string): Promise<TagModel> {
  const { generateText, Output } = await import('ai');
  const { createOpenAI } = await import('@ai-sdk/openai');

  const openai = createOpenAI();
  return async (batch: TagInput[]): Promise<TagBatchResult> => {
    const { output, usage } = await generateText({
      model: openai(modelName),
      output: Output.object({
        schema: (await import('./prompt')).TagBatchSchema,
        name: 'product_tags',
        description: 'Structured style tags for a batch of fashion products.',
      }),
      prompt: buildTaggingPrompt(batch),
    });
    return {
      items: output.items,
      usage: {
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
      },
    };
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = loadEnv();
  const modelName = args.model || env.LLM_MODEL;
  if (!modelName) {
    throw new Error('No model: pass --model or set LLM_MODEL in the environment.');
  }
  if (!env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required to tag products.');
  }

  const service = createServiceClient(env);
  const model = await buildModel(modelName);
  const report = await tagProducts(service, model, {
    batchSize: args.batchSize,
    maxRows: args.limit,
    retag: args.retag,
    dryRun: args.dryRun,
    onProgress: (progress) => {
      console.log(
        `[tag:products] ${progress.seen} seen - ${progress.tagged} tagged - ${progress.failed} failed`,
      );
    },
  });

  console.log(
    `[tag:products] done: ${report.tagged} tagged, ${report.skipped} skipped, ${report.failed} failed ` +
      `(${report.batches} batches, ${report.inputTokens} input / ${report.outputTokens} output tokens)`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
