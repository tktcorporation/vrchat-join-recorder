import * as fs from 'fs';
import { Result, ok, err } from 'neverthrow';

export const readFileSyncSafe = (
  filePath: string,
  options?: { encoding?: null; flag?: string } | null
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

export const readDirSyncSafe = (dirPath: string): Result<string[], Error> => {
  try {
    const dirNames = fs.readdirSync(dirPath);
    return ok(dirNames);
  } catch (e) {
    if (e instanceof Error) {
      return err(e);
    }
    throw e;
  }
};

export const writeFileSyncSafe = (
  filePath: string,
  data: string | Uint8Array,
  options?: Parameters<typeof fs.writeFileSync>[2]
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
