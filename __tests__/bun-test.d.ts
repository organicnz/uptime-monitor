declare module "bun:test" {
  export const mock: {
    <T extends (...args: never[]) => unknown>(fn?: T): Mock<T>;
    module(specifier: string, factory: () => unknown): void;
  };
}
