export interface MiddlewareContext {
  tool: string;
  args: Record<string, any>;
  startTime: number;
  errors: string[];
}

export type MiddlewareFn = (ctx: MiddlewareContext, next: () => Promise<void>) => Promise<void>;

export class Pipeline {
  private middlewares: MiddlewareFn[] = [];

  use(fn: MiddlewareFn) {
    this.middlewares.push(fn);
  }

  async run(ctx: MiddlewareContext): Promise<void> {
    let index = -1;
    const dispatch = async (i: number): Promise<void> => {
      if (i <= index) throw new Error('next() called multiple times');
      index = i;
      if (i < this.middlewares.length) {
        await this.middlewares[i](ctx, () => dispatch(i + 1));
      }
    };
    await dispatch(0);
  }
}
