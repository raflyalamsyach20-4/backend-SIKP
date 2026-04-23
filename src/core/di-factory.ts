export type FactoryMap<TContainer extends object, TRegistry extends Record<string, unknown>> = {
  [K in keyof TRegistry]: (container: TContainer) => TRegistry[K];
};

export const defineLazyRegistry = <
  TContainer extends object,
  TRegistry extends Record<string, unknown>
>(
  target: TContainer,
  cache: Partial<TRegistry>,
  factories: FactoryMap<TContainer, TRegistry>
): void => {
  for (const [key, factory] of Object.entries(factories) as [
    keyof TRegistry,
    FactoryMap<TContainer, TRegistry>[keyof TRegistry]
  ][]) {
    Object.defineProperty(target, key, {
      enumerable: true,
      configurable: false,
      get() {
        let instance = cache[key];
        if (instance === undefined) {
          instance = factory(target);
          cache[key] = instance;
        }
        return instance;
      },
    });
  }
};