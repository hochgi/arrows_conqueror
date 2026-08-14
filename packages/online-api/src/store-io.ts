import type { ObjectPutOptions, ObjectStore } from './api-types';
export { PreconditionFailed, isPreconditionFailed } from './api-types';

export const getObject = async (
  s3: ObjectStore,
  key: string,
): Promise<string | undefined> => await Promise.resolve(s3.get(key));

export const putObject = async (
  s3: ObjectStore,
  key: string,
  body: string,
  options?: ObjectPutOptions,
): Promise<void> => {
  await Promise.resolve(s3.put(key, body, options));
};

export const deleteObject = async (s3: ObjectStore, key: string): Promise<void> => {
  await Promise.resolve(s3.delete(key));
};

export const listObjects = async (
  s3: ObjectStore,
  prefix: string,
): Promise<readonly string[]> => await Promise.resolve(s3.listPrefix(prefix));
