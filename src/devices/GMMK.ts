import * as usb from 'usb';
import { Device } from 'usb/dist/usb';
import { Endpoint } from 'usb/dist/usb/endpoint';
import { Interface } from 'usb/dist/usb/interface';
import { allocAndSet } from '../utils'

const VID = 0x0c45;
const PID = 0x652f;

const COMMAND_ENDPOINT = 0x03;
const INTERRUPT_ENDPOINT = 0x82;

const headerBuf = allocAndSet(64, [0x04, 0x01, 0x00, 0x01]);
const footerBuf = allocAndSet(64, [0x04, 0x02, 0x00, 0x02]);

const TIMEOUT = 1000;
export class GMMK {
  device: Device;
  commandEp: Endpoint;
  interruptEp: Endpoint;
  iFace: Interface;

  hasDetachedKernelDriver = false;

  constructor() {
    this.device = usb.findByIds(VID, PID);
    if (!this.device) {
      throw new Error('GMMK Device Not Found')
    }
    this.device.open();

    this.iFace = this.device.interfaces[1];
    if (this.iFace.isKernelDriverActive()) {
      this.hasDetachedKernelDriver = true;
      this.iFace.detachKernelDriver();
    }
    this.iFace.claim();

    this.commandEp = this.iFace.endpoints.find(e => e.address === COMMAND_ENDPOINT);
    this.interruptEp = this.iFace.endpoints.find(e => e.address === INTERRUPT_ENDPOINT);
  }

  async commandTransfer(data: Buffer): Promise<Buffer> {
    type TransferCb = Parameters<typeof this.commandEp.makeTransfer>[1];
    return new Promise((resolve, reject) => {
      const cb: TransferCb = (err, data, length) => {
        if (err) {
          return reject(err);
        }
        return resolve(data.slice(0, length));
      };

      const transfer = this.commandEp.makeTransfer(TIMEOUT, cb);
      transfer.submit(data, cb);
    });
  }

  async interruptTransfer(data: Buffer): Promise<Buffer> {
    type TransferCb = Parameters<typeof this.commandEp.makeTransfer>[1];
    return new Promise((resolve, reject) => {
      const cb: TransferCb = (err, data, length) => {
        if (err) {
          return reject(err);
        }
        return resolve(data.slice(0, length));
      };

      const transfer = this.interruptEp.makeTransfer(TIMEOUT, cb);
      transfer.submit(data, cb);
    });
  }

  async setBrightness(level: number): Promise<void> {
    let rxBuffer = Buffer.alloc(64);

    await this.commandTransfer(headerBuf);
    await this.interruptTransfer(rxBuffer);
    rxBuffer = Buffer.alloc(64);

    // Actual request
    const transferBuffer = allocAndSet(64, [
      0x04,
      0x08 + level,
      0x00,
      0x06,
      0x01,
      0x01,
      0x00,
      0x00,
      level,
    ]);
    await this.commandTransfer(transferBuffer);
    await this.interruptTransfer(rxBuffer);
    rxBuffer = Buffer.alloc(64);

    // Footer
    await this.commandTransfer(footerBuf);
    await this.interruptTransfer(rxBuffer);
  }

  async setLEDMode(mode: number): Promise<void> {
    let rxBuffer = Buffer.alloc(64);

    // Header
    await this.commandTransfer(headerBuf);
    await this.interruptTransfer(rxBuffer);
    rxBuffer = Buffer.alloc(64);

    // Actual request
    const transferBuffer = allocAndSet(64, [
      0x04,
      0x08 + mode,
      0x00,
      0x06,
      0x01,
      0x04,
      0x00,
      0x00,
      mode,
    ]);
    await this.commandTransfer(transferBuffer);
    await this.interruptTransfer(rxBuffer);
    rxBuffer = Buffer.alloc(64);

    // Footer
    await this.commandTransfer(footerBuf);
    await this.interruptTransfer(rxBuffer);
  }

  async setProfile(profile: number): Promise<void> {
    let rxBuffer = Buffer.alloc(64);

    const profile2 = profile * 2;

    // Status request?
    await this.commandTransfer(allocAndSet(64, [0x04, 0x2F, 0x00, 0x03, 0x2C]));
    const currentProfileResponse = Buffer.alloc(64);
    await this.interruptTransfer(currentProfileResponse);

    // Transaction 1
    await this.commandTransfer(headerBuf);
    await this.interruptTransfer(rxBuffer);

    await this.commandTransfer(Buffer.from([
      0x04, 0x3D, 0x00, 0x05, 0x38, 0x00, 0x00, 0x00, 0x14, 0x03, 0x02, 0x00, 0x01, 0xFF, 0xFF, 0x00,
      0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x06, 0x03, 0x02, 0x00, 0xFF, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]));
    await this.interruptTransfer(rxBuffer);

    await this.commandTransfer(allocAndSet(64, [0x04, 0x67, 0x00, 0x05, 0x38, 0x2A]));
    await this.interruptTransfer(rxBuffer);

    await this.commandTransfer(allocAndSet(64, [0x04, 0x91, 0x00, 0x05, 0x38, 0x54]));
    await this.interruptTransfer(rxBuffer);

    await this.commandTransfer(footerBuf);
    await this.interruptTransfer(rxBuffer);

    // Transaction 2
    await this.commandTransfer(headerBuf);
    await this.interruptTransfer(rxBuffer);

    await this.commandTransfer(allocAndSet(64, [0x04, 0x47 + profile2, 0x00, 0x11, 0x36, 0x00, profile2]));
    await this.interruptTransfer(rxBuffer);

    await this.commandTransfer(Buffer.from([
      0x04, 0x73 + profile2, 0x0a, 0x11, 0x36, 0x36, profile2, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0x00, 0xFF, 0xFF,
      0x00, 0xFF, 0xFF, 0x00, 0xFF, 0xFF, 0x00, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]));
    await this.interruptTransfer(rxBuffer);

    await this.commandTransfer(Buffer.from([
      0x04, 0xB0 + profile2, 0x03, 0x11, 0x36, 0x6c, profile2, 0x00, 0x00, 0x00, 0x00, 0xFF, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0xFF, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF, 0x00, 0x00, 0x00, 0x00,
    ]));
    await this.interruptTransfer(rxBuffer);

    await this.commandTransfer(allocAndSet(64, [
      0x04, 0xE7 + profile2, 0x02, 0x11, 0x36, 0xa2, profile2, 0x00, 0xFF, 0x00, 0x00, 0xFF,
    ]));
    await this.interruptTransfer(rxBuffer);

    await this.commandTransfer(allocAndSet(64, [0x04, 0x1F + profile2, 0x01, 0x11, 0x36, 0xD8, profile2]));
    await this.interruptTransfer(rxBuffer);

    await this.commandTransfer(allocAndSet(64, [0x04, 0x56 + profile2, 0x00, 0x11, 0x36, 0x0E, 1 + profile2]));
    await this.interruptTransfer(rxBuffer);

    await this.commandTransfer(allocAndSet(64, [0x04, 0x90 + profile2, 0x00, 0x11, 0x36, 0x44, 1 + profile2]));
    await this.interruptTransfer(rxBuffer);

    await this.commandTransfer(allocAndSet(64, [0x04, 0xC6 + profile2, 0x00, 0x11, 0x36, 0x7A, 1 + profile2]));
    await this.interruptTransfer(rxBuffer);

    await this.commandTransfer(footerBuf);
    await this.interruptTransfer(rxBuffer);

    // Final transaction
    await this.commandTransfer(allocAndSet(64, [0x04, 0x2F, 0x00, 0x03, 0x2C]));
    await this.interruptTransfer(rxBuffer);

    await this.commandTransfer(Buffer.from([
      0x04, 0xE2 + profile, 0x03, 0x04, 0x2C, 0x00, 0x00, 0x00, 0x55, 0xAA, 0xFF, 0x02, 0x45, 0x0C, 0x2F, 0x65,
      0x05, 0x01, profile, 0x08, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x08, 0x07,
      0x09, 0x0B, 0x0A, 0x0C, 0x0D, 0x0E, 0x0F, 0x10, 0x11, 0x12, 0x14, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]));
    await this.interruptTransfer(rxBuffer);
  }

  release() {
    this.iFace.release();
    if (this.hasDetachedKernelDriver) {
      this.iFace.attachKernelDriver();
    }
  }
}
