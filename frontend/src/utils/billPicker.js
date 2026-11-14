import * as ImagePicker from 'expo-image-picker';

/**
 * Picks a bill photo from the camera or the gallery.
 * Resolves to { uri, name, type } (plus `file` on web), null when the user backs out,
 * or throws an Error with code 'permission' when access was refused.
 */
export async function pickBillImage(source) {
  const fromCamera = source === 'camera';
  const permission = fromCamera
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    const error = new Error('permission');
    error.code = 'permission';
    throw error;
  }

  const options = { mediaTypes: ['images'], quality: 0.8, allowsEditing: false };
  const result = fromCamera
    ? await ImagePicker.launchCameraAsync(options)
    : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets?.length) return null;

  const asset = result.assets[0];
  const isPng = (asset.mimeType || '').includes('png') || /\.png$/i.test(asset.uri || '');
  return {
    uri: asset.uri,
    name: isPng ? 'bill.png' : 'bill.jpg',
    type: isPng ? 'image/png' : 'image/jpeg',
    file: asset.file || null, // web only: the File behind the picker
  };
}
