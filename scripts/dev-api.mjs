import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { open, readFile, stat, unlink } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiUrl = 'http://127.0.0.1:5278/api/health-check';
const lockName = createHash('sha256').update(repositoryRoot).digest('hex').slice(0, 20);
const lockPath = join(tmpdir(), `smartlibrary-api-${lockName}.lock`);
const startupTimeoutMs = 60_000;

const sleep = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

async function isApiHealthy() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1_500);

  try {
    const response = await fetch(apiUrl, { signal: controller.signal });
    return response.ok && (await response.text()).trim().toLowerCase() === 'healthy';
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    if (error.code === 'EPERM') return true;
    throw error;
  }
}

async function readLock() {
  try {
    return JSON.parse(await readFile(lockPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    if (error instanceof SyntaxError) return {};
    throw error;
  }
}

async function removeStaleLock() {
  try {
    const lockStat = await stat(lockPath);
    if (Date.now() - lockStat.mtimeMs < 5_000) return false;
    await unlink(lockPath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return true;
    throw error;
  }
}

async function waitForExistingApi(ownerPid) {
  const deadline = Date.now() + startupTimeoutMs;
  while (Date.now() < deadline) {
    if (await isApiHealthy()) return true;
    if (!isProcessRunning(ownerPid)) return false;
    await sleep(500);
  }
  return false;
}

async function acquireStartupLock() {
  while (true) {
    try {
      const lock = await open(lockPath, 'wx');
      const token = randomUUID();
      await lock.writeFile(JSON.stringify({ pid: process.pid, token }));
      return { lock, token };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;

      const existingLock = await readLock();
      if (!existingLock?.pid) {
        await removeStaleLock();
        await sleep(100);
        continue;
      }

      if (await waitForExistingApi(existingLock.pid)) {
        console.log('SmartLibrary API đã chạy; kết nối terminal này với tiến trình hiện có.');
        return null;
      }

      if (isProcessRunning(existingLock.pid)) {
        throw new Error(`Tiến trình API PID ${existingLock.pid} đang khởi động nhưng chưa sẵn sàng sau ${startupTimeoutMs / 1000} giây.`);
      }

      await unlink(lockPath).catch((unlinkError) => {
        if (unlinkError.code !== 'ENOENT') throw unlinkError;
      });
    }
  }
}

async function isPortOccupied() {
  return new Promise((resolvePromise, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: 5278 });
    socket.setTimeout(1_000);
    socket.once('connect', () => {
      socket.destroy();
      resolvePromise(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolvePromise(false);
    });
    socket.once('error', (error) => {
      socket.destroy();
      if (error.code === 'ECONNREFUSED') resolvePromise(false);
      else reject(error);
    });
  });
}

async function releaseStartupLock(lock, token) {
  try {
    const currentLock = await readLock();
    if (currentLock?.token === token) await unlink(lockPath);
  } finally {
    await lock.close();
  }
}

async function stopExistingApi() {
  if (process.platform !== 'win32') {
    throw new Error('Chưa hỗ trợ dừng một API được khởi chạy từ terminal khác trên hệ điều hành này.');
  }

  const projectPath = resolve(repositoryRoot, 'apps', 'api', 'src', 'SmartLibrary.Api')
    .replaceAll("'", "''");
  const command = `
    $ErrorActionPreference = 'Stop'
    $projectPath = [IO.Path]::GetFullPath('${projectPath}')
    $processIds = @(Get-NetTCPConnection -LocalPort 5278 -State Listen -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty OwningProcess -Unique)
    $matchingProcesses = @(
      foreach ($processId in $processIds) {
        $candidate = Get-CimInstance Win32_Process -Filter "ProcessId = $processId"
        if (-not $candidate -or $candidate.Name -ne 'SmartLibrary.Api.exe' -or -not $candidate.ExecutablePath) {
          continue
        }
        $executablePath = [IO.Path]::GetFullPath($candidate.ExecutablePath)
        if ($executablePath.StartsWith($projectPath + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
          $candidate
        }
      }
    )
    if ($matchingProcesses.Count -ne 1) {
      throw "Expected exactly one SmartLibrary API process for this repository on port 5278, found $($matchingProcesses.Count). No process was stopped."
    }
    Stop-Process -Id $matchingProcesses[0].ProcessId
    Write-Output $matchingProcesses[0].ProcessId
  `;

  const result = await new Promise((resolvePromise, reject) => {
    const powershell = spawn('powershell.exe', [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      command,
    ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    powershell.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    powershell.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    powershell.once('error', reject);
    powershell.once('exit', (code) => {
      if (code === 0) {
        resolvePromise(stdout.trim());
      } else {
        reject(new Error(stderr.trim() || `PowerShell exited with code ${code}.`));
      }
    });
  });

  const pid = Number(result);
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error('Không xác định được PID API đã dừng; hãy kiểm tra trạng thái cổng 5278.');
  }
  console.log(`Đã gửi lệnh dừng tới SmartLibrary API (PID ${pid}).`);
}

async function attachToExistingApi() {
  console.log('SmartLibrary API đã chạy tại http://localhost:5278 và đang được giữ bởi terminal này. Nhấn Ctrl+C để dừng API.');

  await new Promise((resolvePromise, reject) => {
    let stopping = false;
    let checking = false;
    const poll = setInterval(async () => {
      if (checking || stopping) return;
      checking = true;
      try {
        if (!(await isApiHealthy())) {
          cleanup();
          console.log('SmartLibrary API đã dừng bên ngoài terminal này.');
          resolvePromise();
        }
      } catch (error) {
        cleanup();
        reject(error);
      } finally {
        checking = false;
      }
    }, 1_000);

    const handleSignal = async () => {
      if (stopping) return;
      stopping = true;
      try {
        await stopAndWaitForApi();
        process.exitCode = 130;
        resolvePromise();
      } catch (error) {
        reject(error);
      } finally {
        cleanup();
      }
    };

    const cleanup = () => {
      clearInterval(poll);
      process.removeListener('SIGINT', handleSignal);
      process.removeListener('SIGTERM', handleSignal);
    };

    process.once('SIGINT', handleSignal);
    process.once('SIGTERM', handleSignal);
  });
}

async function stopAndWaitForApi() {
  await stopExistingApi();
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline && await isApiHealthy()) {
    await sleep(250);
  }
  if (await isApiHealthy()) {
    throw new Error('API vẫn phản hồi sau lệnh dừng. Hãy kiểm tra tiến trình đang lắng nghe trên cổng 5278.');
  }
}

async function runApi() {
  if (process.argv.includes('--stop')) {
    await stopAndWaitForApi();
    return;
  }

  const startupLock = await acquireStartupLock();
  if (!startupLock) {
    if (await isApiHealthy()) await attachToExistingApi();
    return;
  }

  const { lock, token } = startupLock;
  try {
    if (await isApiHealthy()) {
      await attachToExistingApi();
      return;
    }

    if (await isPortOccupied()) {
      throw new Error('Cổng 5278 đang được một dịch vụ khác sử dụng nhưng không phản hồi health check SmartLibrary API. Hãy dừng đúng dịch vụ đó hoặc đổi cổng API trước khi chạy lại.');
    }

    const child = spawn('dotnet', ['run', '--project', 'apps/api/src/SmartLibrary.Api'], {
      cwd: repositoryRoot,
      stdio: 'inherit',
      windowsHide: false,
    });

    const forwardSignal = (signal) => child.kill(signal);
    process.once('SIGINT', forwardSignal);
    process.once('SIGTERM', forwardSignal);

    try {
      const exitCode = await new Promise((resolvePromise, reject) => {
        child.once('error', reject);
        child.once('exit', (code, signal) => {
          if (signal) {
            console.error(`SmartLibrary API đã dừng do tín hiệu ${signal}.`);
            resolvePromise(1);
            return;
          }
          resolvePromise(code ?? 1);
        });
      });
      process.exitCode = exitCode;
    } finally {
      process.removeListener('SIGINT', forwardSignal);
      process.removeListener('SIGTERM', forwardSignal);
    }
  } finally {
    await releaseStartupLock(lock, token);
  }
}

runApi().catch((error) => {
  console.error(`Không thể chạy SmartLibrary API: ${error.message}`);
  process.exitCode = 1;
});
