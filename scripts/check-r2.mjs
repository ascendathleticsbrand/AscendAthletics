/** Checks R2 access; the optional upload test verifies public image delivery and removes its temporary object. */
// Checks private R2 credentials without printing them. Run from the project root.
import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import {
  S3Client,
  ListObjectsV2Command,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const required = [
  'R2_ACCOUNT_ID',
  'R2_BUCKET_NAME',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_PUBLIC_BASE_URL',
];
const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length) {
  console.error('Add these private .env.local settings first: ' + missing.join(', '));
  process.exitCode = 1;
} else {
  let client;
  let testKey;
  let uploaded = false;
  const bucket = process.env.R2_BUCKET_NAME.trim();
  try {
    const account = process.env.R2_ACCOUNT_ID.trim();
    const publicUrl = new URL(process.env.R2_PUBLIC_BASE_URL.trim());
    if (!/^[a-f0-9]{32}$/i.test(account) || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket))
      throw new Error('Invalid R2 account ID or bucket name.');
    if (
      publicUrl.protocol !== 'https:' ||
      publicUrl.username ||
      publicUrl.password ||
      publicUrl.pathname !== '/' ||
      publicUrl.search ||
      publicUrl.hash ||
      /(?:^|\.)r2\.cloudflarestorage\.com$/i.test(publicUrl.hostname)
    )
      throw new Error('Use the public HTTPS bucket address, not the S3 API endpoint.');
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${account}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID.trim(),
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY.trim(),
      },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      maxAttempts: 2,
    });
    await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: 'products/', MaxKeys: 1 }),
    );
    console.log('R2 authenticated connection verified for bucket: ' + bucket);
    // The optional write check uses a unique temporary key, never an existing product image.
    if (process.argv.includes('--upload-test')) {
      const bytes = readFileSync(
        new URL(
          '../public/products/compression-shirts/black-red-graphic-compression-shirt.jpg',
          import.meta.url,
        ),
      );
      testKey = '_ascend-connection-check/' + randomUUID() + '.jpg';
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: testKey,
          Body: bytes,
          ContentType: 'image/jpeg',
          CacheControl: 'no-store',
          IfNoneMatch: '*',
        }),
      );
      uploaded = true;
      const response = await fetch(publicUrl.origin + '/' + testKey, {
        signal: AbortSignal.timeout(20000),
        cache: 'no-store',
      });
      if (!response.ok)
        throw new Error(
          'The test image was uploaded, but its public URL did not serve it. Check public access and the URL/bucket match.',
        );
      const downloaded = Buffer.from(await response.arrayBuffer());
      if (!bytes.equals(downloaded))
        throw new Error('The public URL did not return the uploaded image.');
      console.log(
        'R2 upload and public image delivery verified; the test photo will now be removed.',
      );
    } else
      console.log(
        'No objects changed. To verify upload/public delivery too, run npm run check:r2 -- --upload-test.',
      );
  } catch (error) {
    // SDK error objects may contain request metadata. Never log them or credentials.
    const known =
      error instanceof Error &&
      [
        'Invalid R2 account ID or bucket name.',
        'Use the public HTTPS bucket address, not the S3 API endpoint.',
        'The test image was uploaded, but its public URL did not serve it. Check public access and the URL/bucket match.',
        'The public URL did not return the uploaded image.',
      ].includes(error.message);
    console.error(
      known
        ? error.message
        : 'R2 verification failed. Check the account ID, bucket name, scoped Object Read & Write credentials and public access.',
    );
    process.exitCode = 1;
  } finally {
    if (client && uploaded && testKey)
      try {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: testKey }));
        console.log('Removed the temporary R2 connection-test object.');
      } catch {
        console.error('Remove the temporary object from ' + bucket + ': ' + testKey);
        process.exitCode = 1;
      }
    client?.destroy();
  }
}
