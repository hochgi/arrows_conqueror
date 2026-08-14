import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { PreconditionFailed, type ObjectPutOptions, type ObjectStore } from './api-types';
import { compareStrings } from './hashing';

const httpStatusOf = (error: unknown): number | undefined => {
  if (typeof error !== 'object' || error === null) return undefined;
  const rec = error as Record<string, unknown>;
  const meta = rec['$metadata'];
  if (typeof meta !== 'object' || meta === null) return undefined;
  const code = (meta as Record<string, unknown>)['httpStatusCode'];
  return typeof code === 'number' ? code : undefined;
};

const isNoSuchKey = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) return false;
  const rec = error as Record<string, unknown>;
  if (rec['name'] === 'NoSuchKey') return true;
  return httpStatusOf(error) === 404;
};

const isS3Precondition = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) return false;
  const rec = error as Record<string, unknown>;
  if (rec['name'] === 'PreconditionFailed' || rec['name'] === 'ConditionalRequestConflict') {
    return true;
  }
  const status = httpStatusOf(error);
  return status === 412 || status === 409;
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
  put: async (key, body, options?: ObjectPutOptions) => {
    const command: {
      Bucket: string;
      Key: string;
      Body: string;
      ContentType: string;
      IfMatch?: string;
      IfNoneMatch?: string;
    } = { Bucket: bucket, Key: key, Body: body, ContentType: 'application/json' };
    if (options?.ifNoneMatch === '*') {
      command.IfNoneMatch = '*';
    }
    if (options?.ifMatch !== undefined) {
      const current = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key })).catch(
        (error: unknown) => {
          if (isNoSuchKey(error)) return undefined;
          throw error;
        },
      );
      if (current === undefined) throw new PreconditionFailed();
      const currentBody = current.Body === undefined ? '' : await current.Body.transformToString();
      if (currentBody !== options.ifMatch) throw new PreconditionFailed();
      const etag = current.ETag;
      if (etag !== undefined) command.IfMatch = etag;
    }
    try {
      await client.send(new PutObjectCommand(command));
    } catch (error: unknown) {
      if (isS3Precondition(error)) throw new PreconditionFailed();
      throw error;
    }
  },
  delete: async (key) => {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
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
