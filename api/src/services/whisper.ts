import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { spawn } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { logger } from '@/lib/logger';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '../../../');
const WHISPER_BINARY = join(PROJECT_ROOT, 'services/whisper.cpp/build/bin/main');
const WHISPER_MODEL = join(PROJECT_ROOT, 'models/whisper/ggml-small.bin');

const fastify = Fastify({
  logger: false, // Disable Fastify's built-in logging
  disableRequestLogging: true,
});

await fastify.register(multipart);

fastify.get('/health', async () => {
  return { status: 'up', model: WHISPER_MODEL };
});

fastify.post('/v1/audio/transcriptions', async (request, reply) => {
  const parts = request.parts();
  let tempFile = join(os.tmpdir(), `whisper-${Date.now()}.wav`);
  let language: string | undefined;

  for await (const part of parts) {
    if (part.type === 'file') {
      const buffer = await part.toBuffer();
      await writeFile(tempFile, buffer);
    } else {
      if (part.fieldname === 'language') {
        language = (part as any).value;
      }
    }
  }

  try {
    const args = [
      '-m', WHISPER_MODEL,
      '-f', tempFile,
      '-oj', // output json to stdout
      '--no-prints'
    ];

    if (language) {
      args.push('-l', language);
    }

    logger.info(`Running whisper: ${WHISPER_BINARY} ${args.join(' ')}`);

    const whisperProcess = spawn(WHISPER_BINARY, args);
    let stdout = '';
    let stderr = '';

    whisperProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    whisperProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    const exitCode = await new Promise((resolve) => {
      whisperProcess.on('close', resolve);
    });

    if (exitCode !== 0) {
      logger.error(`Whisper failed: ${stderr}`);
      return reply.status(500).send({ error: 'Transcription failed', details: stderr });
    }

    try {
      const output = JSON.parse(stdout);
      let text = '';
      if (output.transcription) {
        text = output.transcription.map((t: any) => t.text).join(' ').trim();
      } else {
        text = stdout.trim();
      }
      return { text };
    } catch (e) {
      return { text: stdout.trim() };
    }
  } finally {
    try {
      await unlink(tempFile);
    } catch (e) {}
  }
});

const port = 8002;
const host = '127.0.0.1';

try {
  await fastify.listen({ port, host });
  logger.info(`🎙️ Whisper TS Server running at http://${host}:${port}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}

