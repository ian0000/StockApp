import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createBarcodeScanGate,
  createBarcodeNotFoundPresentation,
  createBarcodeScannerFailurePresentation,
  BARCODE_SCANNER_ROUTE,
  COMMERCIAL_BARCODE_TYPES,
  getCameraPermissionContentKind,
  isBarcodeScannerPlatformSupported,
  normalizeScannedBarcode,
} from '../src/ui/barcode/barcode-scanner-presentation';

test('scanner text preserves leading zeroes and trims boundary whitespace', () => {
  assert.equal(normalizeScannedBarcode('0012345678905'), '0012345678905');
  assert.equal(normalizeScannedBarcode('  0012345678905  '), '0012345678905');
});

test('scanner text is never converted through a numeric representation', () => {
  const barcode = normalizeScannedBarcode('000000000001');

  assert.equal(barcode, '000000000001');
  assert.equal(typeof barcode, 'string');
});

test('empty scanner data is rejected before lookup', () => {
  assert.equal(normalizeScannedBarcode(''), null);
  assert.equal(normalizeScannedBarcode('   '), null);
});

test('the scan gate accepts only the first callback while resolving', () => {
  const gate = createBarcodeScanGate();

  assert.equal(gate.tryAccept('0012345'), '0012345');
  assert.equal(gate.tryAccept('0012345'), null);
  assert.equal(gate.tryAccept('0099999'), null);
  assert.equal(gate.isArmed(), false);
});

test('the scan gate ignores empty data without disarming', () => {
  const gate = createBarcodeScanGate();

  assert.equal(gate.tryAccept('   '), null);
  assert.equal(gate.isArmed(), true);
  assert.equal(gate.tryAccept('0012345'), '0012345');
});

test('the scan gate can be rearmed after a result', () => {
  const gate = createBarcodeScanGate();

  gate.tryAccept('0012345');
  gate.rearm();

  assert.equal(gate.isArmed(), true);
  assert.equal(gate.tryAccept('0099999'), '0099999');
});

test('permission presentation covers checking, required, ready and denied states', () => {
  assert.equal(getCameraPermissionContentKind(null), 'checking');
  assert.equal(
    getCameraPermissionContentKind({
      status: 'undetermined',
      granted: false,
      canAskAgain: true,
    }),
    'required',
  );
  assert.equal(
    getCameraPermissionContentKind({
      status: 'granted',
      granted: true,
      canAskAgain: true,
    }),
    'ready',
  );
  assert.equal(
    getCameraPermissionContentKind({
      status: 'denied',
      granted: false,
      canAskAgain: true,
    }),
    'denied-requestable',
  );
  assert.equal(
    getCameraPermissionContentKind({
      status: 'denied',
      granted: false,
      canAskAgain: false,
    }),
    'denied-settings',
  );
});

test('scanner route is dedicated and transports no Product data', () => {
  assert.equal(BARCODE_SCANNER_ROUTE, '/barcode/scan');
});

test('scanner enables only the approved commercial barcode formats', () => {
  assert.deepEqual(COMMERCIAL_BARCODE_TYPES, [
    'ean13',
    'ean8',
    'upc_a',
    'upc_e',
    'code128',
  ]);
  assert.equal(COMMERCIAL_BARCODE_TYPES.includes('qr' as never), false);
});

test('camera scanner is native-only and Web remains an explicit preview', () => {
  assert.equal(isBarcodeScannerPlatformSupported('ios'), true);
  assert.equal(isBarcodeScannerPlatformSupported('android'), true);
  assert.equal(isBarcodeScannerPlatformSupported('web'), false);
});

test('not-found presentation preserves the scanned barcode for retry review', () => {
  assert.deepEqual(createBarcodeNotFoundPresentation('0012345'), {
    message: 'Producto no encontrado',
    supportingText:
      'No existe un producto activo con este código en tu inventario.',
    barcode: '0012345',
  });
});

test('camera and lookup failures use distinct non-technical messages', () => {
  const camera = createBarcodeScannerFailurePresentation('camera');
  const lookup = createBarcodeScannerFailurePresentation('lookup');

  assert.match(camera.message, /cámara/);
  assert.match(lookup.message, /producto/);
  assert.doesNotMatch(
    `${camera.message} ${camera.supportingText} ${lookup.message} ${lookup.supportingText}`,
    /SQLITE|RangeError|native module|stack/i,
  );
});
