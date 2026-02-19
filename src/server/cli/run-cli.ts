import { spawn } from 'node:child_process';
import readline from 'node:readline';

export interface RunCliOptions {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  onJsonEvent?: (event: Record<string, unknown>) => void;
  onTextLine?: (line: string) => void;
}

export interface RunCliResult {
  events: Array<Record<string, unknown>>;
  stderr: string;
}

function tryParseJson(line: string): Record<string, unknown> | null {
  const normalized = line.trim();
  if (!normalized.startsWith('{') || !normalized.endsWith('}')) {
    return null;
  }

  try {
    const parsed = JSON.parse(normalized) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

export async function runCli(options: RunCliOptions): Promise<RunCliResult> {
  return new Promise<RunCliResult>((resolve, reject) => {
    const child = spawn(options.command, options.args, {
      cwd: options.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    const events: Array<Record<string, unknown>> = [];
    let stderrBuffer = '';

    const onStdoutLine = (line: string): void => {
      const json = tryParseJson(line);
      if (json) {
        events.push(json);
        options.onJsonEvent?.(json);
      } else {
        options.onTextLine?.(line);
      }
    };

    const stdoutReader = readline.createInterface({ input: child.stdout });
    stdoutReader.on('line', onStdoutLine);

    const stderrReader = readline.createInterface({ input: child.stderr });
    stderrReader.on('line', (line) => {
      stderrBuffer += `${line}\n`;
    });

    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`命令执行超时: ${options.command} ${options.args.join(' ')}`));
    }, options.timeoutMs);

    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      stdoutReader.close();
      stderrReader.close();

      if (code !== 0) {
        reject(
          new Error(
            `${options.command} 退出码 ${code}。stderr:\n${stderrBuffer || '(empty)'}`,
          ),
        );
        return;
      }

      resolve({ events, stderr: stderrBuffer.trim() });
    });
  });
}
