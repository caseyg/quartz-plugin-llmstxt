import { QuartzEmitterPlugin } from '@quartz-community/types';
export { BuildCtx, FilePath, FullSlug, ProcessedContent, QuartzEmitterPlugin, QuartzEmitterPluginInstance } from '@quartz-community/types';
import { LlmsTxtEmitterOptions } from './types.js';

declare const LlmsTxtEmitter: QuartzEmitterPlugin<Partial<LlmsTxtEmitterOptions>>;

export { LlmsTxtEmitter, LlmsTxtEmitterOptions };
