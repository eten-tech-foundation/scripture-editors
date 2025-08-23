interface Context<T = unknown> {
  Provider: (value: T, callback: () => void) => void;
  Consumer: () => T;
}

export function createContext<T = unknown>(): Context<T> {
  let contextValue: T;

  function Provider(value: T, callback: () => void): void {
    const currentValue = contextValue;
    contextValue = value;
    callback();
    contextValue = currentValue;
  }

  function Consumer(): T {
    return contextValue;
  }

  return {
    Provider,
    Consumer,
  };
}

export function useContext<T = unknown>(ctxRef: Context<T>): T {
  return ctxRef.Consumer();
}
