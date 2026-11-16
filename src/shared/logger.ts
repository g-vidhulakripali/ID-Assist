declare const __DEV__: boolean | undefined;

const PREFIX = '[ID Assist]';

export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

const isDev = typeof __DEV__ !== 'undefined' && __DEV__;

/**
 * Console logger. Debug output is only emitted in watch builds so a release
 * build stays silent on ordinary pages. Never log field values.
 */
export const logger: Logger = {
  debug: (...args) => {
    if (isDev) console.debug(PREFIX, ...args);
  },
  info: (...args) => console.info(PREFIX, ...args),
  warn: (...args) => console.warn(PREFIX, ...args),
  error: (...args) => console.error(PREFIX, ...args),
};

export const silentLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};
