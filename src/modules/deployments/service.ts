import path from "path";
import { readFile, readdir, stat } from "fs/promises";
import type { DeploymentTarget } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto/encryption";
import type { DeploymentTargetInput } from "@/lib/validation/blogs";

type UploadResult = {
  uploadedFiles: number;
  skippedFiles: number;
  deletedFiles: number;
  log: string[];
};

type DeploymentConnectionTarget =
  Pick<DeploymentTarget, "type" | "host" | "port" | "username" | "remoteRootPath"> &
  Partial<Pick<DeploymentTarget, "passwordEncrypted" | "privateKeyEncrypted" | "privateKeyPassphraseEncrypted">> &
  Partial<Pick<DeploymentTargetInput, "password" | "privateKey" | "privateKeyPassphrase">>;

type PublicVerification = {
  url: string;
  expectedText: string;
};

type DeployBuildOptions = {
  targetId?: string;
  publicVerifications?: PublicVerification[];
  cleanRemoteRoot?: boolean;
};

type UploadOptions = {
  cleanRemoteRoot?: boolean;
};

export async function testDeploymentTarget(targetId: string) {
  const target = await prisma.deploymentTarget.findUniqueOrThrow({ where: { id: targetId } });
  try {
    await testDeploymentConnection(target);
    return prisma.deploymentTarget.update({
      where: { id: targetId },
      data: { lastTestedAt: new Date(), lastTestStatus: "SUCCESS" },
    });
  } catch (error) {
    await prisma.deploymentTarget.update({
      where: { id: targetId },
      data: {
        lastTestedAt: new Date(),
        lastTestStatus: error instanceof Error ? error.message : "FAILED",
      },
    });
    throw error;
  }
}

export async function testDeploymentConnection(target: DeploymentConnectionTarget) {
  await withClient(target, async (client) => {
    await ensureRemoteRoot(client, target);
  });
  return { ok: true };
}

export async function deployBuild(
  buildId: string,
  targetIdOrOptions?: string | DeployBuildOptions,
  legacyPublicVerifications: PublicVerification[] = []
) {
  const options: DeployBuildOptions = typeof targetIdOrOptions === "object" && targetIdOrOptions !== null
    ? targetIdOrOptions
    : { targetId: targetIdOrOptions, publicVerifications: legacyPublicVerifications };
  const publicVerifications = options.publicVerifications || [];
  const build = await prisma.build.findUniqueOrThrow({ where: { id: buildId } });
  if (build.status !== "SUCCESS" || !build.outputPath) {
    throw new Error("Only successful builds can be deployed.");
  }
  const blog = await prisma.blog.findUniqueOrThrow({ where: { id: build.blogId } });
  const target = options.targetId
    ? await prisma.deploymentTarget.findUnique({ where: { id: options.targetId } })
    : await prisma.deploymentTarget.findFirst({
        where: { blogId: build.blogId },
        orderBy: { createdAt: "desc" },
      });
  if (!target) {
    throw new Error("No deployment target is saved for this blog. Save the FTP/SFTP target before deploying.");
  }
  const deployment = await prisma.deployment.create({
    data: {
      blogId: build.blogId,
      buildId: build.id,
      targetId: target.id,
      status: "RUNNING",
      startedAt: new Date(),
    },
  });
  let result: UploadResult | null = null;
  try {
    result = await uploadDirectory(build.outputPath, target, { cleanRemoteRoot: Boolean(options.cleanRemoteRoot) });
    await verifyPublicPage({
      url: blog.baseUrl,
      expectedText: await expectedTitleFromFile(path.join(build.outputPath, "index.html")),
    });
    for (const verification of publicVerifications) {
      await verifyPublicPage(verification);
    }
    return prisma.deployment.update({
      where: { id: deployment.id },
      data: {
        status: "SUCCESS",
        uploadedFiles: result.uploadedFiles,
        skippedFiles: result.skippedFiles,
        deletedFiles: result.deletedFiles,
        logJson: result.log,
        completedAt: new Date(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Deployment failed";
    await prisma.deployment.update({
      where: { id: deployment.id },
      data: {
        status: "FAILED",
        error: message,
        uploadedFiles: result?.uploadedFiles || 0,
        skippedFiles: result?.skippedFiles || 0,
        deletedFiles: result?.deletedFiles || 0,
        logJson: result?.log,
        completedAt: new Date(),
      },
    });
    throw error;
  }
}

async function expectedTitleFromFile(filePath: string) {
  const html = await readFile(filePath, "utf8");
  return html.match(/<title>(.*?)<\/title>/i)?.[1] || "";
}

async function verifyPublicPage({ url, expectedText }: PublicVerification) {
  const fetchUrl = verificationUrl(url);
  const response = await fetch(fetchUrl, {
    redirect: "follow",
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  });
  if (!response.ok) {
    throw new Error(
      `FTP upload completed, but public verification failed: ${url} returned HTTP ${response.status}. Check that the FTP remote root is the public web root for this domain.`
    );
  }
  const html = await response.text();
  if (expectedText && !html.includes(expectedText)) {
    throw new Error(
      `FTP upload completed, but public verification failed: ${url} is reachable but does not show the generated blog. Check DNS/hosting and FTP remote root; the upload account appears to be different from the live web root.`
    );
  }
}

function verificationUrl(url: string) {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("aeo_verify", Date.now().toString());
    return parsed.toString();
  } catch {
    return url;
  }
}

async function uploadDirectory(root: string, target: DeploymentTarget, options: UploadOptions = {}): Promise<UploadResult> {
  const files = await listLocalFiles(root);
  const log: string[] = [];
  let deletedFiles = 0;
  await withClient(target, async (client) => {
    await ensureRemoteRoot(client, target);
    if (options.cleanRemoteRoot) {
      deletedFiles += await cleanRemoteRoot(client, target, log);
    } else if (!target.htaccessEnabled && await removeRemoteHtaccess(client, target, log)) {
      deletedFiles += 1;
    }
    if (target.type === "SFTP") {
      for (const file of files) {
        const relative = path.relative(root, file).split(path.sep).join("/");
        const remote = `${target.remoteRootPath.replace(/\/+$/, "")}/${relative}`;
        try {
          await ensureSftpDir(client, path.posix.dirname(remote));
          await client.fastPut(file, remote);
        } catch (error) {
          throw decorateUploadError(error, relative);
        }
        log.push(`uploaded ${relative}`);
      }
    } else {
      for (const file of files) {
        const relative = path.relative(root, file).split(path.sep).join("/");
        const remoteDir = path.posix.dirname(relative);
        try {
          if (remoteDir !== ".") {
            await client.ensureDir(joinRemotePath(target.remoteRootPath, remoteDir));
          } else {
            await client.cd(target.remoteRootPath);
          }
          await uploadFtpFile(client, file, relative);
        } catch (error) {
          throw decorateUploadError(error, relative);
        }
        log.push(`uploaded ${relative}`);
      }
    }
  });
  return { uploadedFiles: files.length, skippedFiles: 0, deletedFiles, log };
}

async function ensureRemoteRoot(client: any, target: DeploymentConnectionTarget) {
  if (target.type === "SFTP") {
    await ensureSftpDir(client, target.remoteRootPath);
    await client.list(target.remoteRootPath);
    return;
  }
  await client.ensureDir(target.remoteRootPath);
}

function decorateUploadError(error: unknown, relative: string) {
  const message = error instanceof Error ? error.message : String(error || "upload failed");
  return new Error(`Could not upload ${relative}: ${message}`);
}

async function uploadFtpFile(client: any, file: string, relative: string) {
  const fileName = path.posix.basename(relative);
  try {
    await client.uploadFrom(file, fileName);
    return;
  } catch (error) {
    if (fileName !== ".htaccess" || !/553|could not create file/i.test(error instanceof Error ? error.message : String(error))) {
      throw error;
    }
  }

  const tempName = `htaccess-${Date.now()}.tmp`;
  try {
    await client.uploadFrom(file, tempName);
    await client.rename(tempName, fileName);
  } catch (error) {
    await client.remove(tempName).catch(() => undefined);
    throw error;
  }
}

async function cleanRemoteRoot(client: any, target: DeploymentTarget, log: string[]) {
  const root = normalizeRemoteRoot(target.remoteRootPath);
  try {
    const deleted = await deleteRemoteChildren(client, target, root, root, log);
    log.push(`cleaned remote root ${root} (${deleted} item${deleted === 1 ? "" : "s"} deleted)`);
    return deleted;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "unknown error");
    throw new Error(`Could not clean FTP/SFTP remote folder "${root}": ${message}`);
  }
}

async function deleteRemoteChildren(
  client: any,
  target: DeploymentTarget,
  remoteDir: string,
  root: string,
  log: string[]
): Promise<number> {
  const entries = await client.list(remoteDir);
  let deleted = 0;
  for (const entry of entries) {
    if (!entry.name || entry.name === "." || entry.name === "..") continue;
    if (remoteDir === root && entry.name === "_aeo-private") {
      log.push("preserved _aeo-private fallback lead queue");
      continue;
    }
    const remotePath = joinRemotePath(remoteDir, entry.name);
    if (isRemoteDirectory(entry)) {
      deleted += await deleteRemoteChildren(client, target, remotePath, root, log);
      await removeRemoteDirectory(client, target, remotePath);
    } else {
      await removeRemoteFile(client, target, remotePath);
    }
    deleted += 1;
    log.push(`deleted ${remoteLogPath(root, remotePath)}`);
  }
  return deleted;
}

function isRemoteDirectory(entry: any) {
  return entry.isDirectory === true || entry.type === 2 || entry.type === "d" || entry.type === "dir" || entry.type === "directory";
}

async function removeRemoteFile(client: any, target: DeploymentTarget, remotePath: string) {
  if (target.type === "SFTP") {
    await client.delete(remotePath);
  } else {
    await client.remove(remotePath);
  }
}

async function removeRemoteDirectory(client: any, target: DeploymentTarget, remotePath: string) {
  if (target.type === "SFTP") {
    await client.rmdir(remotePath);
  } else {
    await client.removeDir(remotePath);
  }
}

async function removeRemoteHtaccess(client: any, target: DeploymentTarget, log: string[]) {
  const remote = joinRemotePath(target.remoteRootPath, ".htaccess");
  try {
    if (target.type === "SFTP") {
      if (!await client.exists(remote)) return false;
      await client.delete(remote);
    } else {
      await client.remove(remote);
    }
    log.push("deleted stale .htaccess");
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    if (!/not found|no such file|550/i.test(message)) {
      log.push(`could not delete stale .htaccess: ${message}`);
    }
    return false;
  }
}

function joinRemotePath(root: string, relative: string) {
  const cleanRoot = normalizeRemoteRoot(root).replace(/\/+$/, "");
  return cleanRoot ? `${cleanRoot}/${relative}` : `/${relative}`;
}

function normalizeRemoteRoot(root: string) {
  const cleanRoot = root.replace(/\/+$/, "");
  return cleanRoot || "/";
}

function remoteLogPath(root: string, remotePath: string) {
  const cleanRoot = normalizeRemoteRoot(root);
  if (cleanRoot === "/") return remotePath.replace(/^\/+/, "") || "/";
  return remotePath.startsWith(`${cleanRoot}/`) ? remotePath.slice(cleanRoot.length + 1) : remotePath;
}

async function withClient<T>(
  target: DeploymentConnectionTarget,
  fn: (client: any) => Promise<T>
) {
  if (target.type === "SFTP") {
    const { default: SftpClient } = await import("ssh2-sftp-client");
    const client = new SftpClient();
    try {
      await client.connect({
        host: target.host,
        port: target.port,
        username: target.username,
        password: target.password || decryptSecret(target.passwordEncrypted) || undefined,
        privateKey: target.privateKey || decryptSecret(target.privateKeyEncrypted) || undefined,
        passphrase: target.privateKeyPassphrase || decryptSecret(target.privateKeyPassphraseEncrypted) || undefined,
      });
    } catch (error) {
      await client.end().catch(() => undefined);
      throw decorateConnectionError(error, target);
    }
    try {
      return await fn(client);
    } finally {
      await client.end();
    }
  }

  const ftp = await import("basic-ftp");
  const client = new ftp.Client();
  client.ftp.verbose = false;
  try {
    await client.access({
      host: target.host,
      port: target.port,
      user: target.username,
      password: target.password || decryptSecret(target.passwordEncrypted) || undefined,
      secure: target.type === "FTPS",
    });
  } catch (error) {
    client.close();
    throw decorateConnectionError(error, target);
  }
  try {
    return await fn(client);
  } finally {
    client.close();
  }
}

function decorateConnectionError(error: unknown, target: DeploymentConnectionTarget) {
  const message = error instanceof Error ? error.message : String(error || "Connection failed");
  if (target.type === "SFTP" && /auth|authentication|password|permission denied/i.test(message)) {
    return new Error(
      `${message} The SFTP server rejected the login. Check that FileZilla is using "SFTP - SSH File Transfer Protocol", the same port, and the same username format.`
    );
  }
  if (target.type !== "SFTP" && /530|login incorrect|not logged in|authentication failed/i.test(message)) {
    return new Error(
      `${message} The FTP server rejected the login. If FileZilla works, match FileZilla's Protocol and Encryption exactly: use FTPS for "Require explicit FTP over TLS", SFTP for "SSH File Transfer Protocol", and FTP only for plain FTP. Also check whether the username must be the full account email.`
    );
  }
  return error instanceof Error ? error : new Error(message);
}

async function ensureSftpDir(client: any, dir: string) {
  const parts = dir.split("/").filter(Boolean);
  let current = dir.startsWith("/") ? "/" : "";
  for (const part of parts) {
    current = current === "/" ? `/${part}` : `${current}/${part}`;
    const exists = await client.exists(current);
    if (!exists) await client.mkdir(current);
  }
}

async function listLocalFiles(root: string, current = root): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) return listLocalFiles(root, full);
      const stats = await stat(full);
      return stats.isFile() ? [full] : [];
    })
  );
  return nested.flat();
}

export async function latestSuccessfulBuild(blogId: string) {
  return prisma.build.findFirst({
    where: { blogId, status: "SUCCESS" },
    orderBy: { createdAt: "desc" },
  });
}
