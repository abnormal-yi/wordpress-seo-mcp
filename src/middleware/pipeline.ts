import { Telemetry } from '../infrastructure/telemetry.js';

export interface MiddlewareContext {
  tool: string;
  args: Record<string, any>;
  startTime: number;
  errors: string[];
}

export type MiddlewareFn = (ctx: MiddlewareContext, next: () => Promise<void>) => Promise<void>;

export class Pipeline {
  private middlewares: MiddlewareFn[] = [];
  private telemetry?: Telemetry;

  constructor(telemetry?: Telemetry) {
    this.telemetry = telemetry;
  }

  use(fn: MiddlewareFn): void {
    this.middlewares.push(fn);
  }

  async run(ctx: MiddlewareContext): Promise<void> {
    let index = -1;
    const dispatch = async (i: number): Promise<void> => {
      if (i <= index) throw new Error('next() called multiple times');
      index = i;
      if (i < this.middlewares.length) {
        const start = Date.now();
        try {
          await this.middlewares[i](ctx, () => dispatch(i + 1));
          this.telemetry?.observeHistogram("middleware.duration", Date.now() - start, { middleware: String(i), tool: ctx.tool });
        } catch (err) {
          ctx.errors.push(String(err));
          this.telemetry?.incrementCounter("middleware.errors", 1, { middleware: String(i), tool: ctx.tool });
          throw err;
        }
      }
    };
    await dispatch(0);
  }
}
