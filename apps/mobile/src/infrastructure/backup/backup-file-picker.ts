export interface PickedBackupFile {
  readonly name: string;
  readonly contents: string;
}

export interface BackupFilePicker {
  pick(): Promise<PickedBackupFile | null>;
}

interface BackupFilePickerDependencies {
  pickDocument(): Promise<
    | { readonly canceled: true }
    | {
        readonly canceled: false;
        readonly asset: { readonly name: string; readonly uri: string };
      }
  >;
  readTemporaryFile(uri: string): Promise<string>;
  deleteTemporaryFile(uri: string): void;
}

export function createBackupFilePicker(
  dependencies: BackupFilePickerDependencies,
): BackupFilePicker {
  return {
    async pick() {
      const result = await dependencies.pickDocument();
      if (result.canceled) return null;

      try {
        return Object.freeze({
          name: result.asset.name,
          contents: await dependencies.readTemporaryFile(result.asset.uri),
        });
      } finally {
        dependencies.deleteTemporaryFile(result.asset.uri);
      }
    },
  };
}
