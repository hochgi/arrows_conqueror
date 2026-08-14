import type { ObjectStore } from './api-types';

export const getObject = async (
  s3: ObjectStore,
  key: string,
): Promise<string | undefined> => await Promise.resolve(s3.get(key));

export const putObject = async (
  s3: ObjectStore,
  key: string,
  body: string,
): Promise<void> => {
  await Promise.resolve(s3.put(key, body));
};

export const listObjects = async (
  s3: ObjectStore,
  prefix: string,
): Promise<readonly string[]> => await Promise.resolve(s3.listPrefix(prefix));
