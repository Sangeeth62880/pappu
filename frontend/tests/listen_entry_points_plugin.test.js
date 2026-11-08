/**
 * @jest-environment node
 */
const withListenEntryPoints = require('../plugins/withListenEntryPoints');

const { addTileService, tileServiceSource } = withListenEntryPoints;

function bareManifest() {
  return {
    manifest: {
      $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' },
      application: [{ $: { 'android:name': '.MainApplication' }, activity: [] }],
    },
  };
}

const services = (m) => m.manifest.application[0].service || [];

describe('withListenEntryPoints: Quick Settings tile', () => {
  test('declares an exported TileService bound by the system with the QS_TILE action', () => {
    const [tile] = services(addTileService(bareManifest()));

    expect(tile.$).toEqual({
      'android:name': '.ListenTileService',
      'android:exported': 'true',
      'android:label': 'Talk to Pappu',
      'android:icon': '@drawable/ic_listen_tile',
      'android:permission': 'android.permission.BIND_QUICK_SETTINGS_TILE',
    });
    expect(tile['intent-filter'][0].action[0].$['android:name']).toBe(
      'android.service.quicksettings.action.QS_TILE'
    );
  });

  test('running prebuild again does not declare the tile twice', () => {
    const manifest = addTileService(addTileService(bareManifest()));
    expect(services(manifest)).toHaveLength(1);
  });

  test('the service opens pappu://listen in this app, with the API 34+ PendingIntent overload', () => {
    const src = tileServiceSource('com.sangeethps.pappu');

    expect(src).toMatch(/^package com\.sangeethps\.pappu\n/);
    expect(src).toContain('class ListenTileService : TileService()');
    expect(src).toContain('Uri.parse("pappu://listen")');
    expect(src).toContain('setPackage(packageName)');
    expect(src).toMatch(/SDK_INT >= Build\.VERSION_CODES\.UPSIDE_DOWN_CAKE\)[\s\S]*startActivityAndCollapse\(pending\)/);
    expect(src).toContain('PendingIntent.FLAG_IMMUTABLE');
    expect(src).toContain('unlockAndRun');
  });
});
