export interface DownloadPlatform {
  create(blob: Blob): string;
  revoke(url: string): void;
  handoff(url: string, filename: string): void;
  schedule(cleanup: () => void): void;
}
const browserPlatform: DownloadPlatform = {
  create: (blob) => URL.createObjectURL(blob),
  revoke: (url) => URL.revokeObjectURL(url),
  handoff(url, filename) {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.hidden = true;
    document.body.append(anchor);
    try {
      anchor.click();
    } finally {
      anchor.remove();
    }
  },
  // Release after the browser's click handoff; also release immediately at a session boundary.
  schedule: (cleanup) => {
    window.setTimeout(cleanup, 0);
  },
};
export class JsonDownloads {
  private urls = new Set<string>();
  constructor(private platform: DownloadPlatform = browserPlatform) {}
  save(
    contents: unknown,
    filename: 'stockapp-backup.json' | 'stockapp-account-export.json',
  ) {
    const blob = new Blob([JSON.stringify(contents, null, 2) + '\n'], {
      type: 'application/json',
    });
    const url = this.platform.create(blob);
    this.urls.add(url);
    const release = () => {
      if (this.urls.delete(url)) this.platform.revoke(url);
    };
    try {
      this.platform.handoff(url, filename);
      this.platform.schedule(release);
    } catch (error) {
      release();
      throw error;
    }
  }
  clear() {
    for (const url of this.urls) this.platform.revoke(url);
    this.urls.clear();
  }
}
