declare module "ssh2-sftp-client" {
  export default class SftpClient {
    connect(config: Record<string, unknown>): Promise<void>;
    list(path: string): Promise<unknown[]>;
    exists(path: string): Promise<false | "d" | "-" | "l">;
    mkdir(path: string): Promise<void>;
    fastPut(localPath: string, remotePath: string): Promise<void>;
    end(): Promise<void>;
  }
}
