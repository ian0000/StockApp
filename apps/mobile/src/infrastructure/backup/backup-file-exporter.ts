import type { BackupArtifact } from '@stock-app/application';

export interface BackupFileExporter {
  export(artifact: BackupArtifact): Promise<void>;
}

interface TemporaryBackupFile {
  readonly uri: string;
  write(contents: string): void;
  delete(): void;
}

interface BackupFileExporterDependencies {
  createTemporaryFile(fileName: string): TemporaryBackupFile;
  isSharingAvailable(): Promise<boolean>;
  share(
    uri: string,
    options: { readonly mimeType: string; readonly UTI: string },
  ): Promise<void>;
}

export function createBackupFileExporter(
  dependencies: BackupFileExporterDependencies,
): BackupFileExporter {
  return {
    async export(artifact) {
      if (!(await dependencies.isSharingAvailable())) {
        throw new Error('Native file sharing is not available.');
      }

      const file = dependencies.createTemporaryFile(artifact.fileName);
      try {
        file.write(artifact.contents);
        await dependencies.share(file.uri, {
          mimeType: artifact.mimeType,
          UTI: 'public.json',
        });
      } finally {
        file.delete();
      }
    },
  };
}
