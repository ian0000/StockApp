import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { createBackupFileExporter } from './backup-file-exporter';

export const localBackupFileExporter = createBackupFileExporter({
  createTemporaryFile(fileName) {
    const file = new File(Paths.cache, fileName);
    return {
      uri: file.uri,
      write(contents) {
        file.write(contents);
      },
      delete() {
        if (file.exists) {
          file.delete();
        }
      },
    };
  },
  isSharingAvailable: () => Sharing.isAvailableAsync(),
  share: (uri, options) => Sharing.shareAsync(uri, options),
});
