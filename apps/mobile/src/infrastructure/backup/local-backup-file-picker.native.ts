import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';

import { createBackupFilePicker } from './backup-file-picker';

export const localBackupFilePicker = createBackupFilePicker({
  async pickDocument() {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: 'application/json',
    });

    if (result.canceled) return { canceled: true };

    const asset = result.assets[0];
    if (asset === undefined) {
      throw new Error('Document picker returned no selected file.');
    }

    return {
      canceled: false,
      asset: { name: asset.name, uri: asset.uri },
    };
  },
  readTemporaryFile(uri) {
    return new File(uri).text();
  },
  deleteTemporaryFile(uri) {
    const file = new File(uri);
    if (file.exists) file.delete();
  },
});
