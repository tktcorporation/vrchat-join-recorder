import * as fs from 'node:fs';
import { type Result, err, ok } from 'neverthrow';

export const readFileSyncSafe = (
  filePath: string,
  options?: { encoding?: null; flag?: string } | null,
): Result<Buffer, Error> => {
  try {
    const content = fs.readFileSync(filePath, options);
    return ok(content);
  } catch (e) {
    if (e instanceof Error) {
      return err(e);
    }
    throw e;
  }
};

export type FSError = 'ENOENT';
const toFSError = (error: Error & { code?: string }): FSError => {
  switch (error.code) {
    case 'ENOENT':
      return 'ENOENT';
    default:
      throw error;
  }
};

export const readDirSyncSafe = (dirPath: string): Result<string[], FSError> => {
  try {
    const dirNames = fs.readdirSync(dirPath);
    return ok(dirNames);
  } catch (error) {
    if (error instanceof Error) {
      return err(toFSError(error));
    }
    throw error;
  }
};

export const writeFileSyncSafe = (
  filePath: string,
  data: string | Uint8Array,
  options?: Parameters<typeof fs.writeFileSync>[2],
): Result<void, Error> => {
  try {
    fs.writeFileSync(filePath, data, options);
    return ok(undefined);
  } catch (e) {
    if (e instanceof Error) {
      return err(e);
    }
    throw e;
  }
};

export const mkdirSyncSafe = (dirPath: string): Result<void, Error> => {
  try {
    fs.mkdirSync(dirPath);
    return ok(undefined);
  } catch (e) {
    if (e instanceof Error) {
      return err(e);
    }
    throw e;
  }
};

export const existsSyncSafe = (path: string): Result<boolean, Error> => {
  try {
    const result = fs.existsSync(path);
    return ok(result);
  } catch (e) {
    if (e instanceof Error) {
      return err(e);
    }
    throw e;
  }
};

export const readFileSafe = (
  filePath: string,
  options?: { encoding?: null; flag?: string } | null,
): Result<Buffer, Error> => {
  try {
    const content = fs.readFileSync(filePath, options);
    return ok(content);
  } catch (e) {
    if (e instanceof Error) {
      return err(e);
    }
    throw e;
  }
};

export const createReadStream = (
  filePath: string,
  options?: Parameters<typeof fs.createReadStream>[1],
): fs.ReadStream => {
  return fs.createReadStream(filePath, options);
};

export const unlinkSafe = (path: string): Result<void, Error> => {
  try {
    fs.unlinkSync(path);
    return ok(undefined);
  } catch (e) {
    if (e instanceof Error) {
      return err(e);
    }
    throw e;
  }
};
