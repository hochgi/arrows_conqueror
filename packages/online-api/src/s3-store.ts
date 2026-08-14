import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { ObjectStore } from './api-types';
import { compareStrings } from './hashing';

const isNoSuchKey = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) return false;
  const rec = error as Record<string, unknown>;
  if (rec['name'] === 'NoSuchKey') return true;
  const meta = rec['$metadata'];
  if (typeof meta !== 'object' || meta === null) return false;
  return (meta as Record<string, unknown>)['httpStatusCode'] === 404;
};

const listPage = async (
  client: S3Client,
  bucket: string,
  prefix: string,
  continuation: string | undefined,
): Promise<{ readonly keys: readonly string[]; readonly next: string | undefined }> => {
  const out = await client.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ...(continuation === undefined ? {} : { ContinuationToken: continuation }),
    }),
  );
  const keys: string[] = [];
  for (const obj of out.Contents ?? []) {
    if (obj.Key !== undefined) keys.push(obj.Key);
  }
  const next = out.IsTruncated === true ? out.NextContinuationToken : undefined;
  return { keys, next };
};

export const createS3Store = (bucket: string, client: S3Client = new S3Client({})): ObjectStore => ({
  get: async (key) => {
    try {
      const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const body = out.Body;
      if (body === undefined) return undefined;
      return await body.transformToString();
    } catch (error: unknown) {
      if (isNoSuchKey(error)) return undefined;
      throw error;
    }
  },
  put: async (key, body) => {
    await client.send(
      new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: 'application/json' }),
    );
  },
  listPrefix: async (prefix) => {
    const keys: string[] = [];
    let continuation: string | undefined;
    do {
      const page = await listPage(client, bucket, prefix, continuation);
      keys.push(...page.keys);
      continuation = page.next;
    } while (continuation !== undefined);
    return keys.sort(compareStrings);
  },
});
